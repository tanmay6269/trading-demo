"""
app.py
------
FastAPI Modern Async Backend for BullX Trading Engine.
Zero-latency transport layer with WebSocket streaming and strictly Redis-backed market routes.
"""

import os
import time
import json
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
import bcrypt

# SQLAlchemy Database setup (Async compatible / thread safe)
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from redis_cache import cache, TTL_STOCK_PRICE, TTL_OPTION_CHAIN, TTL_INDEX
from symbol_mapper import get_symbol, canonicalize, SYMBOL_MAP
from poller import poller, fetch_option_chain_failover, fetch_one_stock
import httpx

# Database Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bullx_trading.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# =====================================================================
# DATABASE MODELS
# =====================================================================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(80), unique=True, nullable=True)
    email = Column(String(120), unique=True, index=True)
    phone_number = Column(String(20), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=True)
    mpin_hash = Column(String(255), nullable=True)
    full_name = Column(String(100), default="Demo Trader")
    demo_balance = Column(Float, default=1000000.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    def set_password(self, password: str):
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def check_password(self, password: str) -> bool:
        if not self.password_hash:
            return False
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

    def set_mpin(self, mpin: str):
        self.mpin_hash = bcrypt.hashpw(mpin.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def check_mpin(self, mpin: str) -> bool:
        if not self.mpin_hash:
            return False
        return bcrypt.checkpw(mpin.encode('utf-8'), self.mpin_hash.encode('utf-8'))


class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    symbol = Column(String(50), index=True)
    order_type = Column(String(10)) # BUY / SELL
    product_type = Column(String(20), default="INTRADAY")
    quantity = Column(Integer)
    price = Column(Float)
    status = Column(String(20), default="EXECUTED")
    timestamp = Column(DateTime, default=datetime.utcnow)


class Position(Base):
    __tablename__ = "positions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    symbol = Column(String(50), index=True)
    quantity = Column(Integer)
    buy_price = Column(Float)
    product_type = Column(String(20), default="INTRADAY")
    created_at = Column(DateTime, default=datetime.utcnow)


class NewsArticle(Base):
    __tablename__ = "news_articles"
    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(String(100), unique=True, index=True)
    title = Column(String(300))
    summary = Column(Text, nullable=True)
    source_name = Column(String(100))
    url = Column(String(500))
    published_at = Column(DateTime, default=datetime.utcnow, index=True)
    category = Column(String(50), default="ALL")
    sentiment = Column(String(20), default="NEUTRAL")
    detected_stocks = Column(Text, default="[]")

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =====================================================================
# FASTAPI LIFESPAN (BACKGROUND WORKERS INITIALIZATION)
# =====================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Startup: Launch Async Market Poller
    poller_task = asyncio.create_task(poller.start())
    
    # 2. Startup: Launch Background News Engine
    try:
        from news_engine import news_scheduler
        news_scheduler.start()
    except Exception:
        pass

    logger_msg = "⚡ [BULLX FASTAPI] Server initialized with async Redis cache and WebSocket engine"
    print(logger_msg)
    yield
    # Shutdown
    poller.stop()
    poller_task.cancel()

app = FastAPI(
    title="BullX Professional Trading Platform API",
    version="2.0.0",
    description="High-performance async FastAPI backend with WebSocket streaming and single-source Redis data engine.",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================================
# WEBSOCKET MANAGER (/ws/prices)
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

@app.websocket("/ws/prices")
async def websocket_prices_endpoint(websocket: WebSocket):
    """
    Real-Time WebSocket Stream for Live Stock Prices & Indices.
    Clients connect once and receive continuous ticks without REST polling.
    """
    await ws_manager.connect(websocket)
    try:
        # Default watch set
        tracked_symbols = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "TATAMOTORS", "SBIN", "ICICIBANK", "ZOMATO"]
        
        while True:
            # Check for client messages (e.g. custom symbol subscriptions)
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

            # Push live ticks directly from Redis memory
            quotes = {}
            for sym in tracked_symbols:
                q = await cache.get_stock_price(sym)
                if q:
                    quotes[sym] = q

            indices = await cache.get_all_indices()

            payload = {
                "type": "TICK_UPDATE",
                "timestamp": time.time(),
                "quotes": quotes,
                "indices": indices
            }
            await websocket.send_json(payload)

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


# =====================================================================
# MARKET DATA REST ENDPOINTS (STRICTLY REDIS FIRST)
# =====================================================================

@app.get("/api/price/{symbol}")
async def get_stock_price_route(symbol: str):
    """Get real-time stock price (0ms latency from Redis cache)"""
    clean_sym = canonicalize(symbol)
    cached = await cache.get_stock_price(clean_sym)
    if cached:
        return cached

    # Direct async fallback on initial cache warm
    async with httpx.AsyncClient(timeout=2.5) as client:
        fresh = await fetch_one_stock(client, clean_sym)
        if fresh:
            await cache.set_stock_price(clean_sym, fresh, ttl_seconds=TTL_STOCK_PRICE)
            return fresh

    raise HTTPException(status_code=404, detail="Symbol not found")


class PriceBatchRequest(BaseModel):
    symbols: List[str] = []

@app.post("/api/prices")
async def get_batch_prices_route(req: PriceBatchRequest):
    """Batch fetch quotes from Redis cache"""
    if not req.symbols:
        return {}

    quotes = {}
    missing = []

    for s in req.symbols:
        clean_s = canonicalize(s)
        cached = await cache.get_stock_price(clean_s)
        if cached:
            quotes[clean_s] = cached
        else:
            missing.append(clean_s)

    if missing:
        async with httpx.AsyncClient(timeout=2.5) as client:
            tasks = [fetch_one_stock(client, m) for m in missing]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for m, res in zip(missing, results):
                if isinstance(res, dict) and res.get("price"):
                    quotes[m] = res
                    await cache.set_stock_price(m, res, ttl_seconds=TTL_STOCK_PRICE)

    return quotes


@app.get("/api/index-data")
async def get_index_data_route():
    """Get live Indian market header indices from Redis"""
    cached = await cache.get_all_indices()
    if cached:
        return cached

    from groww_data import get_index_data
    indices = get_index_data()
    if indices:
        await cache.set_all_indices(indices, ttl_seconds=TTL_INDEX)
        return indices

    return {}


@app.get("/api/all-indices-table")
async def get_all_indices_table():
    """Get comprehensive Indian & Global indices table"""
    from groww_data import get_all_indices_detailed_table
    return get_all_indices_detailed_table()


@app.get("/api/all-stocks")
async def get_all_stocks():
    """Get all 1000+ supported stocks metadata list"""
    from groww_data import INDIAN_STOCKS
    stocks = [{"symbol": sym, "name": name} for sym, name in INDIAN_STOCKS.items()]
    return stocks


@app.get("/api/stock-info/{symbol}")
async def get_stock_info_route(symbol: str):
    """Get stock fundamentals and financial metadata"""
    clean_sym = canonicalize(symbol)
    cache_key = f"stock_info:{clean_sym}"
    cached = await cache.get_async(cache_key)
    if cached:
        return cached

    from groww_data import get_stock_info
    info = get_stock_info(symbol)
    if info:
        await cache.set_async(cache_key, info, ttl_seconds=30)
        return info

    raise HTTPException(status_code=404, detail="Stock info not found")


@app.get("/api/search/{query}")
async def search_stocks_route(query: str):
    """Search stocks, indices, and option contracts with fuzzy ranking"""
    from groww_data import search_stocks
    return search_stocks(query)


@app.get("/api/option-chain/{symbol}")
async def get_option_chain_route(symbol: str, expiry: Optional[str] = None):
    """Get real-time Option Chain with multi-source failover (Upstox -> Dhan -> Groww -> NSE)"""
    clean_u = canonicalize(symbol)
    cached = await cache.get_option_chain("NSE", clean_u, expiry or "default")
    if cached:
        return cached

    chain = await fetch_option_chain_failover("NSE", clean_u, expiry)
    if chain:
        await cache.set_option_chain("NSE", clean_u, expiry or "default", chain, ttl_seconds=TTL_OPTION_CHAIN)
        return chain

    # Fallback to local options engine
    from groww_market_data import generate_option_chain
    local_chain = generate_option_chain(clean_u, expiry)
    return local_chain


@app.get("/api/historical/{symbol}")
async def get_historical_candles(symbol: str, period: str = "1d", interval: str = "1m"):
    """Get TradingView OHLCV candle series"""
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

class MpinRequest(BaseModel):
    user_id: int
    mpin: str

@app.post("/api/auth/register")
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter((User.email == req.email) | (User.phone_number == req.phone_number)).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email or phone already exists")

    user = User(email=req.email, phone_number=req.phone_number, full_name=req.full_name, demo_balance=1000000.0)
    user.set_password(req.password)
    user.set_mpin("1470") # Default Quick MPIN
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "status": "success",
        "message": "User registered successfully",
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "balance": user.demo_balance}
    }


@app.post("/api/auth/login")
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    query = db.query(User)
    if req.email:
        user = query.filter(User.email == req.email).first()
    elif req.phone_number:
        user = query.filter(User.phone_number == req.phone_number).first()
    else:
        raise HTTPException(status_code=400, detail="Email or phone number required")

    if not user or not user.check_password(req.password or ""):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {
        "status": "success",
        "message": "Login successful",
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "balance": user.demo_balance}
    }


@app.post("/api/auth/verify-mpin")
async def verify_mpin(req: MpinRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user or not user.check_mpin(req.mpin):
        raise HTTPException(status_code=401, detail="Invalid MPIN")

    return {
        "status": "success",
        "message": "MPIN verified successfully",
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "balance": user.demo_balance}
    }


@app.post("/api/demo-login")
async def demo_login(db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == "demo@trader.com").first()
    if not user:
        user = User(email="demo@trader.com", full_name="Demo Trader", demo_balance=1000000.0)
        user.set_password("demo123")
        user.set_mpin("1470")
        db.add(user)
        db.commit()
        db.refresh(user)

    return {
        "status": "success",
        "message": "Logged in as Demo Trader",
        "user": {"id": user.id, "email": user.email, "full_name": user.full_name, "balance": user.demo_balance}
    }


@app.post("/api/logout")
async def logout():
    return {"status": "success", "message": "Logged out successfully"}


# =====================================================================
# TRADING & ORDER EXECUTION ROUTES
# =====================================================================

class OrderCreateRequest(BaseModel):
    user_id: Optional[int] = 1
    symbol: str
    order_type: str # BUY / SELL
    quantity: int
    price: Optional[float] = None
    product_type: Optional[str] = "INTRADAY"

@app.get("/api/orders")
async def get_orders(user_id: int = 1, db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.user_id == user_id).order_by(Order.timestamp.desc()).all()
    return [{
        "id": o.id,
        "symbol": o.symbol,
        "order_type": o.order_type,
        "quantity": o.quantity,
        "price": o.price,
        "status": o.status,
        "timestamp": o.timestamp.isoformat() if o.timestamp else None
    } for o in orders]


@app.post("/api/orders")
async def create_order(req: OrderCreateRequest, db: Session = Depends(get_db)):
    # 1. Resolve current market price if not specified
    exec_price = req.price
    if not exec_price:
        clean_s = canonicalize(req.symbol)
        quote = await cache.get_stock_price(clean_s)
        exec_price = quote["price"] if quote else 1000.0

    total_cost = exec_price * req.quantity

    # 2. Update user balance
    user = db.query(User).filter(User.id == req.user_id).first()
    if user:
        if req.order_type.upper() == "BUY":
            if user.demo_balance < total_cost:
                raise HTTPException(status_code=400, detail="Insufficient balance for order")
            user.demo_balance -= total_cost
        elif req.order_type.upper() == "SELL":
            user.demo_balance += total_cost

    # 3. Record order
    order = Order(
        user_id=req.user_id,
        symbol=req.symbol,
        order_type=req.order_type.upper(),
        quantity=req.quantity,
        price=round(exec_price, 2),
        product_type=req.product_type,
        status="EXECUTED"
    )
    db.add(order)

    # 4. Update Position
    pos = db.query(Position).filter(Position.user_id == req.user_id, Position.symbol == req.symbol).first()
    if req.order_type.upper() == "BUY":
        if pos:
            new_qty = pos.quantity + req.quantity
            pos.buy_price = round(((pos.buy_price * pos.quantity) + total_cost) / new_qty, 2)
            pos.quantity = new_qty
        else:
            pos = Position(user_id=req.user_id, symbol=req.symbol, quantity=req.quantity, buy_price=exec_price)
            db.add(pos)
    elif req.order_type.upper() == "SELL" and pos:
        pos.quantity -= req.quantity
        if pos.quantity <= 0:
            db.delete(pos)

    db.commit()
    db.refresh(order)

    return {
        "status": "success",
        "message": "Order executed successfully",
        "order": {
            "id": order.id,
            "symbol": order.symbol,
            "order_type": order.order_type,
            "quantity": order.quantity,
            "price": order.price,
            "status": order.status
        },
        "new_balance": user.demo_balance if user else 1000000.0
    }


@app.get("/api/positions")
async def get_positions(user_id: int = 1, db: Session = Depends(get_db)):
    positions = db.query(Position).filter(Position.user_id == user_id).all()
    results = []
    for p in positions:
        clean_s = canonicalize(p.symbol)
        quote = await cache.get_stock_price(clean_s)
        current_p = quote["price"] if quote else p.buy_price
        pnl = round((current_p - p.buy_price) * p.quantity, 2)
        pnl_pct = round(((current_p - p.buy_price) / p.buy_price) * 100, 2) if p.buy_price else 0.0

        results.append({
            "id": p.id,
            "symbol": p.symbol,
            "quantity": p.quantity,
            "buy_price": p.buy_price,
            "current_price": current_p,
            "pnl": pnl,
            "pnl_percent": pnl_pct
        })
    return results


@app.get("/api/holdings")
async def get_holdings(user_id: int = 1, db: Session = Depends(get_db)):
    return await get_positions(user_id, db)


class RechargeRequest(BaseModel):
    user_id: Optional[int] = 1
    amount: float

@app.post("/api/funds/recharge")
async def recharge_wallet(req: RechargeRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.demo_balance += req.amount
    db.commit()
    return {"status": "success", "new_balance": user.demo_balance}


# =====================================================================
# LIVE NEWS ENGINE ROUTES
# =====================================================================

@app.get("/api/news")
async def get_news_route(category: Optional[str] = "ALL", limit: int = 30, offset: int = 0, db: Session = Depends(get_db)):
    """Fetch structured live news articles from database"""
    query = db.query(NewsArticle)
    if category and category.upper() != "ALL":
        query = query.filter(NewsArticle.category == category.upper())

    articles = query.order_by(NewsArticle.published_at.desc()).offset(offset).limit(limit).all()
    return [{
        "id": a.article_id,
        "title": a.title,
        "summary": a.summary,
        "source": a.source_name,
        "url": a.url,
        "published_at": a.published_at.isoformat() if a.published_at else None,
        "category": a.category,
        "sentiment": a.sentiment,
        "detected_stocks": json.loads(a.detected_stocks) if a.detected_stocks else []
    } for a in articles]


@app.get("/api/news/stream")
async def news_stream_endpoint():
    """SSE Stream for broadcasting newly fetched news articles to terminal"""
    from news_sse import news_sse_broadcaster
    return StreamingResponse(
        news_sse_broadcaster.subscribe(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )


# =====================================================================
# HEALTH & PING ROUTES
# =====================================================================

@app.get("/health")
@app.get("/api/health")
@app.get("/api/ping")
async def health_check():
    return {
        "status": "ok",
        "framework": "FastAPI Async",
        "message": "BullX High-Performance Trading Engine is live 24/7",
        "timestamp": time.time()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=5000, reload=True)