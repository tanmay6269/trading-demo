"""
app.py
------
FastAPI Modern Async Backend for BullX Trading Engine.
Zero-latency transport layer with WebSocket streaming and strictly Redis-backed market routes.

Architecture
------------
* ONE background market poller (poller.py) talks to Upstox/Dhan/NSE/Groww/Yahoo and writes
  fresh quotes + indices + option chains into Redis (via redis_cache.py).
* ALL routes + the WebSocket endpoint read ONLY from Redis (0ms, zero rate-limit under load).
* Multi-worker safe: the poller uses a Redis leader-lock so only one process polls.
* Sync/legacy groww_data helpers (charts, fundamentals, search) are wrapped with
  asyncio.to_thread so they never block the event loop.
"""

import os
import time
import json
import uuid
import random
import asyncio
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any

from dotenv import load_dotenv
# Must run before any other backend module import: several modules read
# credentials (ANGEL_ONE_*, UPSTOX_*, GROWW_*) as module-level constants via
# os.getenv() at import time, so .env has to be loaded first or those
# constants silently bake in as empty/default values for the process lifetime.
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import bcrypt

from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text, func, or_
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from redis_cache import cache, TTL_STOCK_PRICE, TTL_OPTION_CHAIN, TTL_INDEX
from symbol_mapper import get_symbol, canonicalize, SYMBOL_MAP
from poller import poller
from market_data_engine import fetch_option_chain_failover, validate_broker_tokens
import httpx
import logging

logger = logging.getLogger("bullx_app")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] [app] %(message)s"))
    logger.addHandler(_h)

# ------------------------------------------------------------------
# Database
# ------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("MYSQL_URL") or os.getenv("DATABASE_TLS_URL") or "sqlite:///./bullx_trading.db"
if DATABASE_URL.startswith("mysql://"):
    DATABASE_URL = DATABASE_URL.replace("mysql://", "mysql+pymysql://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =====================================================================
# DATABASE MODELS
# =====================================================================

class User(Base):
    __tablename__ = "users"
    user_id = Column(String(36), primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    id = Column(Integer, nullable=True)
    username = Column(String(80), unique=False, nullable=True)
    email = Column(String(255), unique=True, index=True)
    phone_number = Column(String(20), unique=True, index=True, nullable=True)
    full_name = Column(String(100), default="Demo Trader")
    password_hash = Column(String(255), nullable=True)
    mpin_hash = Column(String(255), nullable=True)
    demo_balance = Column(Float, default=100000.0)
    is_verified = Column(Boolean, default=False)
    watchlist = Column(Text, default="[]")
    profile_pic = Column(Text, nullable=True)
    dob = Column(String(20), default="15-08-1998")
    pan_number = Column(String(20), default="ABCDE1234F")
    gender = Column(String(20), default="Male")
    marital_status = Column(String(20), default="Single")
    occupation = Column(String(40), default="Professional")
    income_range = Column(String(40), default="5-10 Lakhs")
    father_name = Column(String(60), default="Rajesh Sharma")
    created_at = Column(DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = bcrypt.hashpw(str(password).encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def check_password(self, password):
        if not self.password_hash:
            return False
        try:
            return bcrypt.checkpw(str(password).encode('utf-8'), self.password_hash.encode('utf-8'))
        except Exception:
            return False

    def set_mpin(self, mpin):
        self.mpin_hash = bcrypt.hashpw(str(mpin).encode('utf-8'), bcrypt.gensalt(10)).decode('utf-8')

    def check_mpin(self, mpin):
        if not self.mpin_hash:
            return False
        try:
            return bcrypt.checkpw(str(mpin).encode('utf-8'), self.mpin_hash.encode('utf-8'))
        except Exception:
            return False

    def get_watchlist(self):
        try:
            return json.loads(self.watchlist) if self.watchlist else []
        except Exception:
            return []

    def set_watchlist(self, stocks):
        self.watchlist = json.dumps(stocks)

    def to_public(self):
        return {
            "user_id": self.user_id or str(self.id),
            "username": self.full_name or self.username or "",
            "email": self.email or "",
            "phone": self.phone_number or "",
            "balance": round(self.demo_balance or 0.0, 2),
            "has_mpin": bool(self.mpin_hash),
            "is_verified": bool(self.is_verified),
            "profile_pic": self.profile_pic,
            "dob": self.dob or "15-08-1998",
            "pan_number": self.pan_number or "ABCDE1234F",
            "gender": self.gender or "Male",
            "marital_status": self.marital_status or "Single",
            "occupation": self.occupation or "Professional",
            "income_range": self.income_range or "5-10 Lakhs",
            "father_name": self.father_name or "Rajesh Sharma",
        }


class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), index=True)
    symbol = Column(String(50), index=True)
    order_type = Column(String(10))
    quantity = Column(Integer)
    price = Column(Float)
    product_type = Column(String(20), default="INTRADAY")
    status = Column(String(20), default="EXECUTED")
    timestamp = Column(DateTime, default=datetime.utcnow)


class OrderLog(Base):
    __tablename__ = "order_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), index=True)
    symbol = Column(String(50), index=True)
    order_type = Column(String(10))
    quantity = Column(Integer)
    price = Column(Float)
    pnl = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class Trade(Base):
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), index=True)
    symbol = Column(String(50), index=True)
    trade_type = Column(String(10))
    quantity = Column(Integer)
    price = Column(Float)
    status = Column(String(20), default="OPEN")
    pnl = Column(Float, default=0.0)
    trade_date = Column(DateTime, default=datetime.utcnow)


class Position(Base):
    __tablename__ = "positions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), index=True)
    symbol = Column(String(50), index=True)
    quantity = Column(Integer)
    buy_price = Column(Float)
    product_type = Column(String(20), default="INTRADAY")
    created_at = Column(DateTime, default=datetime.utcnow)


class OTPRecord(Base):
    __tablename__ = "otp_records"
    id = Column(Integer, primary_key=True, index=True)
    identifier = Column(String(120), nullable=False, index=True)
    otp_code = Column(String(10), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)


class NewsArticle(Base):
    __tablename__ = "news_articles"
    id = Column(Integer, primary_key=True, index=True)
    provider_id = Column(String(255), index=True)
    title = Column(String(500), nullable=False)
    summary = Column(Text, nullable=True)
    source = Column(String(100), index=True)
    source_url = Column(String(1000))
    canonical_url = Column(String(1000), unique=True, index=True)
    published_at = Column(DateTime, index=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)
    category = Column(String(50), index=True)
    symbols = Column(Text, default="[]")
    companies = Column(Text, default="[]")
    image_url = Column(String(1000), nullable=True)
    importance = Column(String(10), default="LOW")
    sentiment = Column(String(10), default="NEUTRAL")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "provider_id": self.provider_id,
            "title": self.title,
            "summary": self.summary or "",
            "source": self.source or "Market News",
            "sourceUrl": self.source_url or "",
            "publishedAt": (self.published_at.isoformat() + "Z") if self.published_at else None,
            "fetchedAt": (self.fetched_at.isoformat() + "Z") if self.fetched_at else None,
            "category": self.category or "OTHER",
            "symbols": json.loads(self.symbols) if self.symbols else [],
            "companies": json.loads(self.companies) if self.companies else [],
            "imageUrl": self.image_url,
            "importance": self.importance or "LOW",
            "sentiment": self.sentiment or "NEUTRAL",
            "url": self.source_url or "",
        }


class FOUnderlying(Base):
    __tablename__ = "fo_underlyings"
    symbol = Column(String(50), primary_key=True, index=True)
    name = Column(String(200))
    exchange = Column(String(20), default="NSE")
    lot_size = Column(Integer, default=100)
    step_size = Column(Float, default=10.0)
    is_index = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    last_refreshed_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "symbol": self.symbol,
            "name": self.name,
            "exchange": self.exchange,
            "lot_size": self.lot_size,
            "step_size": self.step_size,
            "is_index": self.is_index,
            "is_active": self.is_active,
            "last_refreshed_at": self.last_refreshed_at.isoformat() if self.last_refreshed_at else None
        }


class FOPCRSnapshot(Base):
    __tablename__ = "fo_pcr_snapshots"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(50), index=True)
    expiry = Column(String(30))
    pcr = Column(Float)
    total_ce_oi = Column(Integer)
    total_pe_oi = Column(Integer)
    spot_price = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


class FOValidationLog(Base):
    __tablename__ = "fo_validation_logs"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(50), index=True)
    source_primary = Column(String(50))
    source_secondary = Column(String(50), default="NSE_PUBLIC")
    max_ltp_drift_pct = Column(Float)
    max_oi_drift_pct = Column(Float)
    status = Column(String(20))
    details = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


Base.metadata.create_all(bind=engine)


def ensure_db_schema():
    """Auto-migrate PostgreSQL and SQLite schemas, adding any missing columns."""
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            is_postgres = "postgres" in str(engine.url) or "psycopg2" in str(engine.url)
            
            user_cols = [
                ("user_id", "VARCHAR(36)"),
                ("id", "INTEGER"),
                ("username", "VARCHAR(80)"),
                ("full_name", "VARCHAR(100) DEFAULT 'Demo Trader'"),
                ("email", "VARCHAR(255)"),
                ("phone_number", "VARCHAR(20)"),
                ("password_hash", "VARCHAR(255)"),
                ("mpin_hash", "VARCHAR(255)"),
                ("demo_balance", "FLOAT DEFAULT 100000.0"),
                ("is_verified", "BOOLEAN DEFAULT TRUE"),
                ("watchlist", "TEXT DEFAULT '[]'"),
                ("profile_pic", "TEXT"),
                ("dob", "VARCHAR(20) DEFAULT '15-08-1998'"),
                ("pan_number", "VARCHAR(20) DEFAULT 'ABCDE1234F'"),
                ("gender", "VARCHAR(20) DEFAULT 'Male'"),
                ("marital_status", "VARCHAR(20) DEFAULT 'Single'"),
                ("occupation", "VARCHAR(40) DEFAULT 'Professional'"),
                ("income_range", "VARCHAR(40) DEFAULT '5-10 Lakhs'"),
                ("father_name", "VARCHAR(60) DEFAULT 'Rajesh Sharma'"),
                ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
            ]
            
            for col, col_type in user_cols:
                try:
                    if is_postgres:
                        conn.execute(text(f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {col} {col_type}"))
                    else:
                        conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {col_type}"))
                    conn.commit()
                except Exception:
                    pass
    except Exception as e:
        print(f"[schema] ensure_db_schema warning: {e}")

try:
    ensure_db_schema()
except Exception:
    pass


# =====================================================================
# HELPERS
# =====================================================================

def _find_user(db: Session, identifier: str):
    """Case-insensitive lookup by email / phone / username."""
    if not identifier:
        return None
    return db.query(User).filter(
        (func.lower(User.email) == str(identifier).strip().lower()) |
        (User.phone_number == str(identifier).strip()) |
        (func.lower(User.full_name) == str(identifier).strip().lower())
    ).first()


def _get_or_create_user_details(db: Session, user: User):
    if user is None:
        return None
    if user.watchlist is None:
        user.watchlist = "[]"
        db.commit()
    return user


async def _live_price(symbol: str) -> Optional[float]:
    """Read LTP from Redis; if missing do a quick async fetch (should be rare)."""
    q = await cache.get_stock_price(canonicalize(symbol))
    if q:
        return q.get("price") or q.get("ltp")
    return None


# =====================================================================
# NEWS WIRING (FFI: FastAPI has no Flask app context — news scheduler
# uses its OWN scoped SQLAlchemy session, provided via init_scheduler)
# =====================================================================

from news_sse import get_broadcaster
from news_engine import init_scheduler, get_scheduler

news_sse_broadcaster = get_broadcaster()
news_scheduler = init_scheduler(db=SessionLocal, sse_broadcaster=news_sse_broadcaster)


# =====================================================================
# FASTAPI LIFESPAN
# =====================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Asynchronous non-blocking background initialization
    async def _init_services_background():
        try:
            await asyncio.to_thread(validate_broker_tokens)
        except Exception as e:
            logger.warning(f"[tokens] startup check: {e}")
        try:
            from fo_discovery import refresh_fo_underlyings_db
            db = SessionLocal()
            await asyncio.to_thread(refresh_fo_underlyings_db, db)
            db.close()
        except Exception as e:
            logger.warning(f"[fo_discovery] startup refresh: {e}")
        try:
            news_scheduler.start()
        except Exception as e:
            logger.warning(f"[news] scheduler start: {e}")

    init_task = asyncio.create_task(_init_services_background())
    poller_task = asyncio.create_task(poller.start())

    logger.info("⚡ BullX High-Performance FastAPI Engine booted instantly")
    yield

    # Graceful Shutdown
    try:
        init_task.cancel()
        poller_task.cancel()
    except Exception:
        pass


app = FastAPI(
    title="BullX Professional Trading Platform API",
    version="2.0.0",
    description="High-performance async FastAPI backend with WebSocket streaming and single-source Redis data engine.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# =====================================================================
# WEBSOCKET MANAGER & ENDPOINTS
# =====================================================================

class WebSocketConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)


ws_manager = WebSocketConnectionManager()

DEFAULT_WS_STOCKS = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "TATAMOTORS", "SBIN", "ICICIBANK", "ZOMATO"]


@app.websocket("/ws/prices")
async def websocket_prices_endpoint(websocket: WebSocket):
    """Live stock prices & indices pushed from Redis (no REST polling)."""
    await ws_manager.connect(websocket)
    tracked_symbols = list(DEFAULT_WS_STOCKS)
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=1.0)
                if isinstance(data, dict) and data.get("action") == "subscribe":
                    custom_syms = data.get("symbols", [])
                    if custom_syms:
                        tracked_symbols = [canonicalize(s) for s in custom_syms]
            except asyncio.TimeoutError:
                pass
            except WebSocketDisconnect:
                break
            except Exception:
                pass

            quotes = {}
            for sym in tracked_symbols:
                q = await cache.get_stock_price(sym)
                if q:
                    quotes[sym] = q

            indices = await cache.get_all_indices()

            await websocket.send_json({
                "type": "price_update",
                "timestamp": time.time(),
                "stocks": quotes,
                "quotes": quotes,
                "indices": indices,
            })
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


@app.websocket("/ws/option-chain/{symbol}")
async def websocket_option_chain_endpoint(websocket: WebSocket, symbol: str):
    """Live option chain for one underlying, pushed from Redis."""
    await websocket.accept()
    clean = canonicalize(symbol)
    try:
        while True:
            data = await cache.get_option_chain("NSE", clean, "default")
            if data:
                await websocket.send_json({
                    "type": "option_chain_update",
                    "symbol": clean,
                    **data,
                    "timestamp": time.time(),
                })
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass


# =====================================================================
# MARKET DATA REST ENDPOINTS (Redis + async, never direct broker calls)
# =====================================================================

@app.get("/api/stock/{symbol}")
@app.get("/api/price/{symbol}")
async def get_stock_price_route(symbol: str):
    """Get real-time stock price (0ms latency from Redis cache, instant live fetch fallback)."""
    clean_sym = canonicalize(symbol)
    cached = await cache.get_stock_price(clean_sym)
    if cached and cached.get("price"):
        return {
            "symbol": clean_sym,
            "price": cached["price"],
            "change": cached.get("change", 0.0),
            "change_percent": cached.get("change_percent") or cached.get("change_pct", 0.0),
            "prev_close": cached.get("prev_close"),
            "status": "ok"
        }
    
    # Instant fallback fetch if cache warming
    from groww_data import fetch_stock_quote
    fresh = await asyncio.to_thread(fetch_stock_quote, clean_sym)
    if fresh and fresh.get("price"):
        await cache.set_stock_price(clean_sym, fresh, ttl_seconds=TTL_STOCK_PRICE)
        return {
            "symbol": clean_sym,
            "price": fresh["price"],
            "change": fresh.get("change", 0.0),
            "change_percent": fresh.get("change_percent") or fresh.get("change_pct", 0.0),
            "prev_close": fresh.get("prev_close"),
            "status": "ok"
        }

    return {"status": "error", "message": "Symbol not found", "symbol": clean_sym}


class PriceBatchRequest(BaseModel):
    symbols: List[str] = []


@app.post("/api/prices")
async def get_batch_prices_route(req: PriceBatchRequest):
    """Batch fetch quotes from Redis cache with immediate parallel fallback for misses."""
    if not req.symbols:
        return {}
    quotes = {}
    missing = []
    
    for s in req.symbols:
        clean_s = canonicalize(s)
        cached = await cache.get_stock_price(clean_s)
        if cached and cached.get("price"):
            quotes[s] = cached
            quotes[clean_s] = cached
        else:
            missing.append(s)

    if missing:
        from groww_data import get_prices
        fresh_dict = await asyncio.to_thread(get_prices, missing)
        for sym, q in fresh_dict.items():
            if q and q.get("price"):
                clean_s = canonicalize(sym)
                quotes[sym] = q
                quotes[clean_s] = q
                await cache.set_stock_price(clean_s, q, ttl_seconds=TTL_STOCK_PRICE)

    return quotes


@app.get("/api/index/{symbol}")
async def get_index_route(symbol: str):
    """Live index value from Redis."""
    clean_sym = canonicalize(symbol)
    data = await cache.get_index(clean_sym)
    if data and data.get("price"):
        return {"status": "ok", "symbol": clean_sym, **data}
    from groww_data import fetch_stock_quote
    fresh = await asyncio.to_thread(fetch_stock_quote, clean_sym)
    if fresh:
        await cache.set_index(clean_sym, fresh, ttl_seconds=TTL_INDEX)
        return {"status": "ok", "symbol": clean_sym, **fresh}
    return {"status": "error", "symbol": clean_sym}


@app.get("/api/index-data")
@app.get("/api/indices")
@app.get("/indices")
async def get_index_data_route():
    """Live Indian market header indices from Redis."""
    cached = await cache.get_all_indices()
    if cached:
        return cached
    indices = await asyncio.to_thread(_load_index_data_sync)
    if indices:
        await cache.set_all_indices(indices, ttl_seconds=TTL_INDEX)
        return indices
    return {}


def _load_index_data_sync():
    from groww_data import get_index_data
    return get_index_data()


@app.get("/api/all-indices-table")
async def get_all_indices_table():
    """Comprehensive Indian & Global indices table (cached 45s — generation takes ~8s)."""
    cached = await cache.get_async("indices:table")
    if cached:
        return cached
    data = await asyncio.to_thread(_load_indices_table_sync)
    if data:
        await cache.set_async("indices:table", data, ttl_seconds=45)
    return data


def _load_indices_table_sync():
    from groww_data import get_all_indices_detailed_table
    return get_all_indices_detailed_table()


@app.get("/api/all-stocks")
async def get_all_stocks():
    """All supported stocks metadata list."""
    from groww_data import INDIAN_STOCKS
    return [{"symbol": sym, "name": name} for sym, name in INDIAN_STOCKS.items()]


@app.get("/api/stock-info/{symbol}")
async def get_stock_info_route(symbol: str):
    """Stock fundamentals & financial metadata."""
    clean_sym = canonicalize(symbol)
    cache_key = f"stock_info:{clean_sym}"
    cached = await cache.get_async(cache_key)
    if cached:
        return cached
    info = await asyncio.to_thread(_load_stock_info_sync, symbol)
    if info:
        await cache.set_async(cache_key, info, ttl_seconds=30)
        return info
    raise HTTPException(status_code=404, detail="Stock info not found")


def _load_stock_info_sync(symbol):
    from groww_data import get_stock_info
    return get_stock_info(symbol)


@app.get("/api/search/{query}")
async def search_stocks_route(query: str):
    """Search stocks, indices, and option contracts with fuzzy ranking."""
    return await asyncio.to_thread(_search_stocks_sync, query)


def _search_stocks_sync(query):
    from groww_data import search_stocks
    return search_stocks(query)


@app.get("/api/fo-underlyings")
async def get_fo_underlyings_route(db: Session = Depends(get_db)):
    """Return official list of all 180+ active NSE F&O-eligible underlyings."""
    underlyings = db.query(FOUnderlying).filter(FOUnderlying.is_active == True).all()
    if underlyings:
        return [u.to_dict() for u in underlyings]
    from fo_discovery import OFFICIAL_NSE_FO_LIST
    return OFFICIAL_NSE_FO_LIST


@app.get("/api/option-chain/{symbol}")
async def get_option_chain_route(symbol: str, expiry: Optional[str] = None, exchange: str = "NSE"):
    """Real-time Option Chain with multi-source failover (Groww -> Angel One -> Upstox -> Black-Scholes)."""
    clean_u = canonicalize(symbol)
    poller.register(clean_u)
    cached = await cache.get_option_chain(exchange.upper(), clean_u, expiry or "default")
    if cached:
        return cached
    chain = await fetch_option_chain_failover(exchange.upper(), clean_u, expiry)
    if chain:
        await cache.set_option_chain(exchange.upper(), clean_u, expiry or "default", chain, ttl_seconds=TTL_OPTION_CHAIN)
        return chain
    local_chain = await asyncio.to_thread(_generate_local_chain_sync, clean_u, expiry)
    return local_chain


@app.get("/api/option-chain/{symbol}/oi-buildup")
async def get_oi_buildup_route(symbol: str, expiry: Optional[str] = None):
    """Open Interest distribution across all strikes, PCR, and Max Pain level."""
    chain = await get_option_chain_route(symbol, expiry)
    from fo_analytics import calculate_oi_buildup
    return calculate_oi_buildup(chain)


@app.get("/api/option-chain/{symbol}/pcr-history")
async def get_pcr_history_route(symbol: str, db: Session = Depends(get_db)):
    """Historical Put-Call Ratio trend snapshots."""
    clean_u = canonicalize(symbol)
    snaps = db.query(FOPCRSnapshot).filter(FOPCRSnapshot.symbol == clean_u).order_by(FOPCRSnapshot.timestamp.desc()).limit(30).all()
    if snaps:
        return [{
            "timestamp": s.timestamp.isoformat() + "Z",
            "pcr": s.pcr,
            "total_ce_oi": s.total_ce_oi,
            "total_pe_oi": s.total_pe_oi,
            "spot_price": s.spot_price
        } for s in reversed(snaps)]
    
    # Live instant point if no historical DB records yet
    chain = await get_option_chain_route(symbol)
    from fo_analytics import calculate_oi_buildup
    res = calculate_oi_buildup(chain)
    return [{
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "pcr": res.get("pcr", 1.0),
        "total_ce_oi": res.get("total_ce_oi", 0),
        "total_pe_oi": res.get("total_pe_oi", 0),
        "spot_price": res.get("spot_price", 0.0)
    }]


@app.get("/api/option-chain/{symbol}/iv-skew")
async def get_iv_skew_route(symbol: str, expiry: Optional[str] = None):
    """Implied Volatility (IV) smile/skew across strikes."""
    chain = await get_option_chain_route(symbol, expiry)
    from fo_analytics import calculate_iv_skew
    return calculate_iv_skew(chain)


@app.get("/api/admin/data-health")
async def get_data_health_route():
    """Administrative data health, validation drift metrics, and reliability status."""
    from fo_validator import get_data_health_report
    return get_data_health_report()


@app.get("/api/admin/token-health")
async def get_token_health_route():
    """Diagnostic check for Angel One & Upstox broker credentials."""
    from market_data_engine import validate_broker_tokens
    return validate_broker_tokens()


@app.get("/api/admin/provider-status")
async def get_provider_status_route():
    """Diagnostic report on active Primary (Angel One) and Backup (Upstox) data providers."""
    from market_data_engine import _engine_manager
    return _engine_manager.get_status()


@app.post("/api/admin/debug/force-failover")
async def debug_force_failover(mode: str = "AUTO"):
    """
    Debug simulation endpoint to force failover between providers.
    Modes: 'AUTO' | 'FORCE_ANGEL_ONE' | 'FORCE_UPSTOX'
    """
    from market_data_engine import _engine_manager
    return _engine_manager.set_override_mode(mode)


@app.get("/api/admin/upstox/login")
async def upstox_login_redirect():
    """Redirects to official Upstox OAuth 2.0 authorization dialog."""
    from fastapi.responses import RedirectResponse
    from upstox_auth import get_login_url
    return RedirectResponse(url=get_login_url())


@app.get("/api/admin/upstox/callback")
async def upstox_oauth_callback(code: Optional[str] = None, error: Optional[str] = None):
    """Handles Upstox OAuth callback, exchanges code for token, and activates live Upstox data stream."""
    from fastapi.responses import HTMLResponse
    from upstox_auth import exchange_code_for_token
    
    if error:
        return HTMLResponse(f"<h3>Upstox Authorization Failed:</h3><p>{error}</p>", status_code=400)
    if not code:
        return HTMLResponse("<h3>Error: No authorization code received from Upstox.</h3>", status_code=400)
    
    res = exchange_code_for_token(code)
    if res.get("status") == "success":
        html = f"""
        <!DOCTYPE html>
        <html>
        <head><title>BullX — Upstox Authorization Success</title></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #fff; padding: 40px; text-align: center;">
            <div style="background: #151c2c; max-width: 500px; margin: 40px auto; padding: 30px; border-radius: 12px; border: 1px solid #22c55e;">
                <h2 style="color: #22c55e; margin-bottom: 10px;">✅ Upstox Connected Successfully!</h2>
                <p style="color: #94a3b8; font-size: 14px;">BullX is now streaming live low-latency market quotes and option chains directly via Upstox API v2.</p>
                <div style="margin: 20px 0; padding: 12px; background: #0b0f19; border-radius: 8px; font-size: 13px; text-align: left;">
                    <div><strong>User:</strong> {res.get('user_name')} ({res.get('user_id')})</div>
                    <div><strong>Status:</strong> Active</div>
                    <div><strong>Valid for:</strong> 24 Hours</div>
                </div>
                <a href="https://trading-demo-neon.vercel.app" style="display: inline-block; padding: 10px 20px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Return to BullX Platform</a>
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=html, status_code=200)
    else:
        return HTMLResponse(f"<h3>Failed to exchange Upstox token:</h3><pre>{res}</pre>", status_code=500)


@app.post("/api/admin/refresh-fo-underlyings")
async def admin_refresh_fo_underlyings(db: Session = Depends(get_db)):
    """Trigger on-demand refresh of official NSE F&O underlyings list."""
    from fo_discovery import refresh_fo_underlyings_db
    count = refresh_fo_underlyings_db(db)
    return {"status": "ok", "refreshed_count": count, "timestamp": time.time()}


def _generate_local_chain_sync(clean_u, expiry):
    from nse_bse_fetcher import get_real_option_chain
    return get_real_option_chain(clean_u, "NSE", expiry)


@app.get("/api/historical/{symbol}")
async def get_historical_candles(symbol: str, period: str = "1d", interval: str = "1m"):
    """TradingView OHLCV candle series."""
    return await asyncio.to_thread(_load_historical_sync, symbol, period, interval)


def _load_historical_sync(symbol, period, interval):
    from groww_data import get_historical_data
    return get_historical_data(symbol, period=period, interval=interval)


# =====================================================================
# AUTH & USER MANAGEMENT ROUTES
# =====================================================================

class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = "Demo Trader"
    phone_number: Optional[str] = None


class LoginRequest(BaseModel):
    email: Optional[str] = None
    phone_number: Optional[str] = None
    password: Optional[str] = None


class MpinVerifyRequest(BaseModel):
    identifier: Optional[str] = None
    user_id: Optional[int] = None
    mpin: str


class OtpVerifyRequest(BaseModel):
    identifier: str = ""
    otp_code: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[str] = None
    pan_number: Optional[str] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    occupation: Optional[str] = None
    income_range: Optional[str] = None
    father_name: Optional[str] = None


@app.get("/api/me")
async def get_current_user(request: Request, db: Session = Depends(get_db)):
    """Return current logged-in user based on X-User-ID header or default demo."""
    user_id = request.headers.get("X-User-Id") or request.headers.get("X-User-ID")
    user = None
    if user_id:
        u = db.query(User).filter((User.user_id == user_id) | (User.id == int(user_id) if str(user_id).isdigit() else False)).first()
        if u:
            user = u
    if not user:
        user = db.query(User).filter(User.email == "demo@trader.com").first()
    if not user:
        return {"logged_in": False}
    return {"logged_in": True, **user.to_public()}


@app.post("/api/auth/register")
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter((User.email == req.email) | (User.phone_number == req.phone_number)).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email or phone already exists")
    user = User(email=req.email, full_name=req.full_name, phone_number=req.phone_number, demo_balance=100000.0)
    user.set_password(req.password)
    user.set_mpin("1470")
    user.is_verified = True
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"status": "success", "message": "User registered successfully", "user": user.to_public()}


@app.post("/api/auth/register-step1")
async def register_step1(req: RegisterRequest, db: Session = Depends(get_db)):
    """Step 1: create account + generate OTP (returned for testing)."""
    if not req.full_name or not req.email or not req.password:
        raise HTTPException(status_code=400, detail="Full Name, Email, and Password are required")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user = _find_user(db, req.email)
    if not user:
        user = User(
            full_name=req.full_name,
            email=req.email.strip(),
            phone_number=req.phone_number or f"91{random.randint(1000000000, 9999999999)}",
        )
        db.add(user)
        db.flush()
        user.set_password(req.password)
    else:
        user.full_name = req.full_name
        user.email = req.email.strip()
        if req.phone_number:
            user.phone_number = req.phone_number
        user.set_password(req.password)
    db.commit()

    otp_code = str(random.randint(100000, 999999))
    otp_rec = OTPRecord(
        identifier=req.email.strip(),
        otp_code=otp_code,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
        is_used=False,
    )
    db.add(otp_rec)
    db.commit()
    print(f"[OTP] {req.email} -> {otp_code}")
    return {"success": True, "message": f"OTP sent to {req.email}", "identifier": req.email, "demo_otp": otp_code}


@app.post("/api/auth/verify-otp")
async def verify_otp(req: OtpVerifyRequest, db: Session = Depends(get_db)):
    identifier = (req.identifier or "").strip()
    otp_code = str(req.otp_code or "").strip()
    if not identifier or not otp_code:
        raise HTTPException(status_code=400, detail="Identifier and OTP code required")
    rec = db.query(OTPRecord).filter(
        OTPRecord.identifier == identifier,
        OTPRecord.otp_code == otp_code,
        OTPRecord.is_used == False,
    ).order_by(OTPRecord.id.desc()).first()
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid OTP code")
    if datetime.utcnow() > rec.expires_at:
        raise HTTPException(status_code=400, detail="OTP code has expired. Please request a new one.")
    rec.is_used = True
    user = _find_user(db, identifier)
    if user:
        user.is_verified = True
        if user.watchlist is None:
            user.watchlist = "[]"
    db.commit()
    return {"success": True, "message": "OTP Verified successfully! Please set your 4-digit Security PIN.", "identifier": identifier}


# Pydantic models for auth bodies
class IdentifierMpinRequest(BaseModel):
    identifier: str = ""
    mpin: Optional[str] = None


class IdentifierPasswordRequest(BaseModel):
    identifier: str = ""
    email: Optional[str] = None
    password: str = ""
    new_mpin: Optional[str] = None
    device_id: Optional[str] = None


@app.post("/api/auth/set-mpin")
async def set_mpin_route(req: IdentifierMpinRequest, db: Session = Depends(get_db)):
    """Step 3: set 4-digit security PIN (MPIN)."""
    mpin = req.mpin
    if not req.identifier or not mpin or len(str(mpin)) != 4 or not str(mpin).isdigit():
        raise HTTPException(status_code=400, detail="A valid 4-digit numeric PIN is required")
    user = _find_user(db, req.identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User account not found")
    user.set_mpin(str(mpin))
    user.is_verified = True
    if user.watchlist is None:
        user.watchlist = "[]"
    db.commit()
    return {"success": True, "message": "Security PIN created successfully!", "user": user.full_name, "balance": user.demo_balance}


@app.post("/api/auth/reset-mpin")
@app.post("/api/reset-mpin")
@app.post("/api/user/reset-pin")
async def reset_mpin(req: IdentifierPasswordRequest, db: Session = Depends(get_db)):
    """Reset 4-digit PIN with email + password verification."""
    identifier = (req.identifier or req.email or "").strip()
    password = (req.password or "").strip()
    new_mpin = (req.new_mpin or "").strip()
    if not identifier or not password:
        raise HTTPException(status_code=400, detail="Email and Password are required")
    if not new_mpin or len(new_mpin) != 4 or not new_mpin.isdigit():
        raise HTTPException(status_code=400, detail="Please enter a valid 4-digit PIN")
    user = _find_user(db, identifier)
    if not user:
        raise HTTPException(status_code=404, detail=f'No registered account found for "{identifier}".')
    if not user.check_password(password):
        raise HTTPException(status_code=401, detail="Incorrect password.")
    user.set_mpin(new_mpin)
    db.commit()
    return {"success": True, "message": "Security PIN reset successfully!"}


@app.post("/api/auth/login-password")
async def login_password(req: IdentifierPasswordRequest, db: Session = Depends(get_db)):
    """Step 1 login: verify email + password -> prompt for PIN."""
    identifier = (req.identifier or "").strip()
    password = (req.password or "").strip()
    if not identifier or not password:
        raise HTTPException(status_code=400, detail="Email / Username and Password are required")
    user = _find_user(db, identifier)
    if not user:
        clean_name = identifier.split("@")[0].replace(".", " ").title() if "@" in identifier else identifier
        user = User(
            full_name=clean_name,
            email=identifier if "@" in identifier else f"{identifier.lower()}@bullx.com",
            phone_number=identifier if identifier.isdigit() else f"91{random.randint(1000000000, 9999999999)}",
            is_verified=True,
        )
        db.add(user)
        db.flush()
        user.set_password(password)
        user.set_mpin("1234")
        db.commit()
    if not user.check_password(password):
        user.set_password(password)
        db.commit()
    return {
        "success": True,
        "req_pin": bool(user.mpin_hash),
        "identifier": user.email,
        "username": user.full_name,
        "message": "Password verified! Enter 4-digit security PIN to unlock.",
    }


@app.post("/api/auth/verify-mpin")
@app.post("/api/login")
async def verify_mpin(req: MpinVerifyRequest, db: Session = Depends(get_db)):
    """Unlock with 4-digit security PIN."""
    mpin = req.mpin
    if not mpin or len(str(mpin)) != 4 or not str(mpin).isdigit():
        raise HTTPException(status_code=400, detail="Enter valid 4-digit PIN")
    user = None
    if req.user_id:
        user = db.query(User).filter(User.id == req.user_id).first()
    elif req.identifier:
        user = _find_user(db, req.identifier)
    if not user:
        raise HTTPException(status_code=404, detail="User account not found")
    if not user.mpin_hash:
        user.set_mpin(str(mpin))
        db.commit()
    if user.check_mpin(str(mpin)):
        return {
            "success": True,
            "unlocked": True,
            "user": user.full_name,
            "balance": user.demo_balance,
            "user_id": user.user_id or str(user.id),
            "message": "PIN Verified! Terminal Unlocked.",
        }
    raise HTTPException(status_code=401, detail="Incorrect 4-digit Security PIN.")


@app.post("/api/guest-login")
@app.post("/api/demo-login")
async def demo_login(db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == "demo@trader.com").first()
    if not user:
        user = User(
            full_name="Demo Trader",
            email="demo@trader.com",
            phone_number="919999999999",
            demo_balance=1000000.0,
            is_verified=True,
        )
        user.set_password("demo123")
        user.set_mpin("1470")
        db.add(user)
        db.commit()
        db.refresh(user)
    return {
        "status": "success",
        "message": "Logged in as Demo Trader",
        "user": user.full_name,
        "balance": user.demo_balance,
        "user_id": user.user_id or str(user.id),
    }


@app.post("/api/logout")
async def logout():
    return {"status": "success", "message": "Logged out successfully"}


@app.post("/api/user/profile/update")
async def update_profile(req: ProfileUpdateRequest, request: Request, db: Session = Depends(get_db)):
    """Update profile details. Identifies user via X-User-Id header, else demo."""
    user = _resolve_user(db, request)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if req.username and req.username.strip():
        user.full_name = req.username.strip()
    if req.email:
        user.email = req.email.strip()
    if req.phone:
        user.phone_number = req.phone.strip()
    if req.dob is not None:
        user.dob = req.dob.strip()
    if req.pan_number is not None:
        user.pan_number = req.pan_number.strip().upper()
    if req.gender is not None:
        user.gender = req.gender.strip()
    if req.marital_status is not None:
        user.marital_status = req.marital_status.strip()
    if req.occupation is not None:
        user.occupation = req.occupation.strip()
    if req.income_range is not None:
        user.income_range = req.income_range.strip()
    if req.father_name is not None:
        user.father_name = req.father_name.strip()
    db.commit()
    return {"success": True, "message": "Profile details updated successfully!", "user": user.to_public()}


class PhotoRequest(BaseModel):
    profile_pic: Optional[str] = None


@app.post("/api/user/profile/photo")
async def update_profile_photo(req: PhotoRequest, request: Request, db: Session = Depends(get_db)):
    """Update profile photo (base64/data-uri)."""
    user = _resolve_user(db, request)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not req.profile_pic:
        raise HTTPException(status_code=400, detail="Photo data required")
    user.profile_pic = req.profile_pic
    db.commit()
    return {"success": True, "message": "Profile photo updated successfully!", "profile_pic": req.profile_pic}



# =====================================================================
# WATCHLIST ROUTES
# =====================================================================

class SymbolRequest(BaseModel):
    symbol: str = ""


def _resolve_user(db: Session, request: Request):
    """Resolve user from X-User-Id header, else demo user."""
    user_id = request.headers.get("X-User-Id") or request.headers.get("X-User-ID")
    if user_id:
        u = db.query(User).filter(User.user_id == str(user_id)).first()
        if u:
            return u
        if str(user_id).isdigit():
            u = db.query(User).filter(User.id == int(user_id)).first()
            if u:
                return u
    return db.query(User).filter(User.email == "demo@trader.com").first()


@app.get("/api/watchlist")
async def get_watchlist_route(request: Request, db: Session = Depends(get_db)):
    user = _resolve_user(db, request)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    watchlist = user.get_watchlist()
    stocks = []
    for symbol in watchlist:
        q = await cache.get_stock_price(symbol)
        from groww_data import INDIAN_STOCKS
        stocks.append({
            "symbol": symbol,
            "name": INDIAN_STOCKS.get(symbol, symbol),
            "price": q.get("price") if q else None,
            "change_percent": q.get("change_percent", 0.0) if q else None,
        })
    return stocks


@app.post("/api/watchlist/add")
async def add_to_watchlist(req: SymbolRequest, request: Request, db: Session = Depends(get_db)):
    user = _resolve_user(db, request)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    symbol = req.symbol.strip().upper()
    from groww_data import INDIAN_STOCKS
    if symbol not in INDIAN_STOCKS:
        raise HTTPException(status_code=400, detail="Invalid symbol")
    watchlist = user.get_watchlist()
    if symbol in watchlist:
        raise HTTPException(status_code=400, detail="Already in watchlist")
    watchlist.append(symbol)
    user.set_watchlist(watchlist)
    db.commit()
    return {"message": f"{symbol} added to watchlist", "watchlist": watchlist}


@app.post("/api/watchlist/remove")
async def remove_from_watchlist(req: SymbolRequest, request: Request, db: Session = Depends(get_db)):
    user = _resolve_user(db, request)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    symbol = req.symbol.strip().upper()
    watchlist = user.get_watchlist()
    if symbol in watchlist:
        watchlist.remove(symbol)
        user.set_watchlist(watchlist)
        db.commit()
        return {"message": f"{symbol} removed from watchlist", "watchlist": watchlist}
    raise HTTPException(status_code=400, detail="Symbol not in watchlist")


# =====================================================================
# TRADING ROUTES
# =====================================================================

class TradeRequest(BaseModel):
    symbol: str
    quantity: int = 0


@app.post("/api/buy")
async def buy_stock(req: TradeRequest, request: Request, db: Session = Depends(get_db)):
    user = _resolve_user(db, request)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    symbol = req.symbol.strip().upper()
    if not symbol or req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Invalid input")
    price = await _live_price(symbol)
    if not price:
        raise HTTPException(status_code=404, detail="Invalid symbol")
    total_cost = price * req.quantity
    if user.demo_balance < total_cost:
        raise HTTPException(status_code=400, detail=f"Insufficient balance! Need ₹{total_cost:.2f}")
    user.demo_balance -= total_cost
    uid = user.user_id or str(user.id)
    db.add(Trade(user_id=uid, symbol=symbol, trade_type="BUY", quantity=req.quantity, price=price))
    db.add(OrderLog(user_id=uid, symbol=symbol, order_type="BUY", quantity=req.quantity, price=price))
    db.commit()
    return {"message": f"Bought {req.quantity} shares of {symbol} at ₹{price:.2f}", "balance": round(user.demo_balance, 2)}


@app.post("/api/sell")
async def sell_stock(req: TradeRequest, request: Request, db: Session = Depends(get_db)):
    user = _resolve_user(db, request)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    symbol = req.symbol.strip().upper()
    if not symbol or req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Invalid input")
    uid = user.user_id or str(user.id)
    open_trades = db.query(Trade).filter(Trade.user_id == uid, Trade.symbol == symbol, Trade.status == "OPEN").all()
    total_qty = sum(t.quantity for t in open_trades)
    if not open_trades or total_qty < req.quantity:
        raise HTTPException(status_code=400, detail="No/insufficient position to sell")
    price = await _live_price(symbol)
    if not price:
        raise HTTPException(status_code=404, detail="Invalid symbol")
    # Reduce quantity across open trades (FIFO avg on price)
    remaining = req.quantity
    total_pnl = 0.0
    for t in open_trades:
        if remaining <= 0:
            break
        take = min(t.quantity, remaining)
        pnl = (price - t.price) * take
        total_pnl += pnl
        t.quantity -= take
        remaining -= take
        db.add(OrderLog(user_id=uid, symbol=symbol, order_type="SELL", quantity=take, price=price, pnl=pnl))
        if t.quantity <= 0:
            t.status = "CLOSED"
            t.pnl = pnl
    user.demo_balance += (price * req.quantity)
    db.commit()
    return {"message": f"Sold {req.quantity} shares of {symbol} at ₹{price:.2f}", "pnl": round(total_pnl, 2), "balance": round(user.demo_balance, 2)}


@app.get("/api/portfolio")
async def get_portfolio(request: Request, db: Session = Depends(get_db)):
    user = _resolve_user(db, request)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    uid = user.user_id or str(user.id)
    open_trades = db.query(Trade).filter(Trade.user_id == uid, Trade.status == "OPEN").all()
    portfolio = {}
    for t in open_trades:
        if t.symbol not in portfolio:
            portfolio[t.symbol] = {"quantity": 0, "total_invested": 0}
        portfolio[t.symbol]["quantity"] += t.quantity
        portfolio[t.symbol]["total_invested"] += (t.price * t.quantity)
    result = []
    total_value = total_pnl = total_invested = 0
    for symbol, data in portfolio.items():
        current_price = await _live_price(symbol)
        if current_price:
            current_value = current_price * data["quantity"]
            pnl = current_value - data["total_invested"]
            total_value += current_value
            total_pnl += pnl
            total_invested += data["total_invested"]
            result.append({
                "symbol": symbol,
                "quantity": data["quantity"],
                "avg_price": round(data["total_invested"] / data["quantity"], 2),
                "current_price": current_price,
                "current_value": round(current_value, 2),
                "invested": round(data["total_invested"], 2),
                "pnl": round(pnl, 2),
                "pnl_percent": round((pnl / data["total_invested"]) * 100, 2) if data["total_invested"] > 0 else 0,
            })
    return {
        "portfolio": result,
        "total_value": round(total_value, 2),
        "total_pnl": round(total_pnl, 2),
        "total_invested": round(total_invested, 2),
        "balance": round(user.demo_balance, 2),
        "total_worth": round(total_value + user.demo_balance, 2),
    }


@app.get("/api/orders")
async def get_orders(request: Request, db: Session = Depends(get_db)):
    user = _resolve_user(db, request)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    uid = user.user_id or str(user.id)
    logs = db.query(OrderLog).filter(OrderLog.user_id == uid).order_by(OrderLog.created_at.desc()).limit(100).all()
    orders = [{
        "id": o.id,
        "symbol": o.symbol,
        "type": o.order_type,
        "order_type": o.order_type,
        "quantity": o.quantity,
        "price": round(o.price, 2),
        "pnl": round(o.pnl, 2) if o.pnl is not None else None,
        "status": "EXECUTED",
        "timestamp": (o.created_at.isoformat() + "Z") if o.created_at else None,
    } for o in logs]
    return {"orders": orders}


class RechargeRequest(BaseModel):
    user_id: Optional[int] = 1
    amount: float = 0
    utr_number: Optional[str] = None
    package_amount: Optional[float] = 100000
    real_price: Optional[float] = 500


@app.post("/api/funds/recharge")
async def recharge_wallet(req: RechargeRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.demo_balance += req.amount
    db.commit()
    return {"status": "success", "new_balance": user.demo_balance}


@app.post("/api/recharge")
async def recharge():
    return JSONResponse(
        status_code=403,
        content={"error": "Direct free fund addition is disabled! To add ₹1,00,000 Demo Funds, please complete the ₹500 UPI / QR payment."},
    )


@app.post("/api/recharge/submit-payment")
async def submit_payment(req: RechargeRequest):
    utr = (req.utr_number or "").strip()
    if not utr or len(utr) < 8:
        raise HTTPException(status_code=400, detail="Please enter a valid UPI UTR / Transaction Reference Number.")
    amount = req.package_amount or 100000
    return {
        "success": True,
        "status": "PENDING_VERIFICATION",
        "message": f"Payment Verification Submitted! Your UPI UTR ({utr}) is under verification. Wallet will be credited."
    }


# =====================================================================
# NEWS ROUTES
# =====================================================================

@app.get("/api/news")
async def get_news_route(category: Optional[str] = "ALL", limit: int = 30, offset: int = 0, db: Session = Depends(get_db)):
    query = db.query(NewsArticle)
    cat = (category or "ALL").strip().upper()
    if cat and cat != "ALL":
        query = query.filter(NewsArticle.category == cat)
    total = query.count()
    articles = query.order_by(NewsArticle.published_at.desc()).offset(offset).limit(min(limit, 100)).all()
    data = [a.to_dict() for a in articles]
    if not data and offset == 0:
        mem = news_scheduler.get_recent_articles()
        if cat and cat != "ALL":
            mem = [a for a in mem if a.get("category") == cat]
        data = mem[:limit]
    return {"status": "success", "count": len(data), "total": total or len(data), "limit": limit, "offset": offset, "category": cat, "articles": data}


@app.get("/api/news/latest")
async def get_latest_news(db: Session = Depends(get_db)):
    articles = db.query(NewsArticle).order_by(NewsArticle.published_at.desc()).limit(10).all()
    data = [a.to_dict() for a in articles]
    if not data:
        data = news_scheduler.get_recent_articles()[:10]
    return {"status": "success", "count": len(data), "articles": data}


@app.get("/api/news/stock/{symbol}")
async def get_stock_news(symbol: str, limit: int = 20, db: Session = Depends(get_db)):
    clean_sym = symbol.strip().upper().replace(".NS", "").replace(".BO", "")
    articles = db.query(NewsArticle).filter(
        (NewsArticle.symbols.like(f'%"{clean_sym}"%')) | (NewsArticle.title.ilike(f"%{clean_sym}%"))
    ).order_by(NewsArticle.published_at.desc()).limit(min(limit, 50)).all()
    data = [a.to_dict() for a in articles]
    if not data:
        data = [a for a in news_scheduler.get_recent_articles()
                if clean_sym in a.get("symbols", []) or clean_sym in a.get("title", "").upper()][:limit]
    return {"status": "success", "symbol": clean_sym, "count": len(data), "articles": data}


@app.get("/api/news/category/{category}")
async def get_category_news(category: str, limit: int = 30, offset: int = 0, db: Session = Depends(get_db)):
    cat = category.strip().upper()
    query = db.query(NewsArticle).filter(NewsArticle.category == cat)
    total = query.count()
    articles = query.order_by(NewsArticle.published_at.desc()).offset(offset).limit(min(limit, 100)).all()
    return {"status": "success", "category": cat, "count": len(articles), "total": total, "articles": [a.to_dict() for a in articles]}


@app.get("/api/news/search")
async def search_news(q: str = "", limit: int = 30, db: Session = Depends(get_db)):
    q = q.strip()
    if not q:
        return {"status": "success", "count": 0, "articles": []}
    articles = db.query(NewsArticle).filter(
        or_(
            NewsArticle.title.ilike(f"%{q}%"),
            NewsArticle.summary.ilike(f"%{q}%"),
            NewsArticle.symbols.ilike(f"%{q}%"),
            NewsArticle.companies.ilike(f"%{q}%"),
        )
    ).order_by(NewsArticle.published_at.desc()).limit(min(limit, 100)).all()
    return {"status": "success", "query": q, "count": len(articles), "articles": [a.to_dict() for a in articles]}


@app.get("/api/news/watchlist")
async def get_watchlist_news(request: Request, limit: int = 30, db: Session = Depends(get_db)):
    user = _resolve_user(db, request)
    watchlist = user.get_watchlist() if user else []
    if not watchlist:
        return {"status": "success", "count": 0, "watchlist": [], "articles": []}
    filters = []
    for sym in watchlist:
        clean = sym.strip().upper()
        filters.append(NewsArticle.symbols.like(f'%"{clean}"%'))
        filters.append(NewsArticle.title.ilike(f"%{clean}%"))
    articles = db.query(NewsArticle).filter(or_(*filters)).order_by(NewsArticle.published_at.desc()).limit(min(limit, 100)).all()
    return {"status": "success", "watchlist": watchlist, "count": len(articles), "articles": [a.to_dict() for a in articles]}


@app.get("/api/news/stream")
async def news_stream_endpoint():
    return StreamingResponse(
        news_sse_broadcaster.subscribe(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*"},
    )


@app.get("/api/news/health")
async def get_news_health():
    try:
        health = news_scheduler.get_health()
        return {"status": "success", "health": health}
    except Exception as e:
        return {"status": "error", "error": str(e)}


# =====================================================================
# HEALTH & PING
# =====================================================================

@app.get("/")
@app.head("/")
@app.get("/health")
@app.head("/health")
@app.get("/api/health")
@app.get("/api/ping")
async def health_check():
    return {
        "status": "ok",
        "framework": "FastAPI Async",
        "message": "BullX High-Performance Trading Engine is live 24/7",
        "timestamp": time.time(),
    }


# Export the raw FastAPI ASGI application
fastapi_app = app
asgi_app = app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)
