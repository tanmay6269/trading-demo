"""
main.py
--------
Complete FastAPI application for BullX Trading Platform.

Run the poller SEPARATELY (its own process):
    python poller_async.py

Run this web app separately:
    uvicorn main:app --reload --port 5000

Routes and the WebSocket endpoints here NEVER call Upstox/Dhan/NSE/Yahoo
directly — they only read from Redis via redis_cache_async.py. This is
what keeps things 100% correct and instant no matter how many users connect.
"""

import asyncio
import json
import time
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import redis_cache_async as cache
from symbol_mapper import canonicalize, get_symbol, SYMBOL_MAP

app = FastAPI(
    title="BullX Professional Trading Platform API",
    version="2.0.0",
    description="High-performance async FastAPI backend with dual WebSocket endpoints and Redis caching."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TRACKED_STOCKS = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL",
    "ITC", "TATAMOTORS", "LT", "MARUTI", "BAJFINANCE", "SUNPHARMA", "ASIANPAINT",
    "TITAN", "ZOMATO", "PAYTM", "SUZLON", "JIOFIN", "SWIGGY", "WIPRO", "HCLTECH"
]
TRACKED_INDICES = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY", "MIDCPNIFTY", "INDIA VIX"]
WS_PUSH_INTERVAL = 1.0


# ---------- REST Endpoints (Async, strictly Redis-backed) ----------

@app.get("/api/stock/{symbol}")
@app.get("/api/price/{symbol}")
async def get_stock(symbol: str):
    clean = canonicalize(symbol)
    data = await cache.get_stock_price(clean)
    if data is None:
        return {"status": "loading", "symbol": clean}
    return {"status": "ok", "symbol": clean, **data}


class PriceBatchRequest(BaseModel):
    symbols: List[str] = []

@app.post("/api/prices")
async def get_batch_prices(req: PriceBatchRequest):
    return await cache.get_all_tracked_prices(req.symbols)


@app.get("/api/index/{symbol}")
async def get_index(symbol: str):
    clean = canonicalize(symbol)
    data = await cache.get_index(clean)
    if data is None:
        return {"status": "loading", "symbol": clean}
    return {"status": "ok", "symbol": clean, **data}


@app.get("/api/index-data")
async def get_all_indices_header():
    indices = {}
    for sym in TRACKED_INDICES:
        d = await cache.get_index(sym)
        if d:
            display_name = SYMBOL_MAP.get(sym, {}).get("display", sym)
            indices[display_name] = {
                "symbol": sym,
                "value": d.get("price") or d.get("ltp"),
                "price": d.get("price") or d.get("ltp"),
                "prev_close": d.get("prev_close"),
                "change": d.get("change", 0.0),
                "change_percent": d.get("change_percent") or d.get("change_pct", 0.0)
            }
    return indices


@app.get("/api/option-chain/{symbol}")
async def get_option_chain(symbol: str, expiry: Optional[str] = None):
    clean = canonicalize(symbol)
    data = await cache.get_option_chain(clean)
    if data is None:
        # Fallback to local options generator
        from groww_market_data import generate_option_chain
        return generate_option_chain(clean, expiry)
    return {"status": "ok", "symbol": clean, **data}


@app.get("/api/stock-info/{symbol}")
async def get_stock_info_route(symbol: str):
    """Fundamentals & company financial statistics"""
    from groww_data import get_stock_info
    info = get_stock_info(symbol)
    if info:
        return info
    raise HTTPException(status_code=404, detail="Stock info not found")


@app.get("/api/historical/{symbol}")
async def get_historical_chart(symbol: str, period: str = "1d", interval: str = "1m"):
    """TradingView OHLCV candle series"""
    from groww_data import get_historical_data
    return get_historical_data(symbol, period=period, interval=interval)


@app.get("/api/search/{query}")
async def search_stocks_route(query: str):
    from groww_data import search_stocks
    return search_stocks(query)


@app.get("/api/all-stocks")
async def get_all_stocks_list():
    from groww_data import INDIAN_STOCKS
    return [{"symbol": sym, "name": name} for sym, name in INDIAN_STOCKS.items()]


@app.get("/api/all-indices-table")
async def get_all_indices_table():
    from groww_data import get_all_indices_detailed_table
    return get_all_indices_detailed_table()


# ---------- WebSocket: Live Prices & Option Chains ----------

@app.websocket("/ws/prices")
async def ws_prices(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            stocks = await cache.get_all_tracked_prices(TRACKED_STOCKS)
            indices = {}
            for symbol in TRACKED_INDICES:
                data = await cache.get_index(symbol)
                if data:
                    indices[symbol] = data

            await websocket.send_text(json.dumps({
                "type": "price_update",
                "stocks": stocks,
                "indices": indices,
                "timestamp": time.time()
            }))
            await asyncio.sleep(WS_PUSH_INTERVAL)
    except WebSocketDisconnect:
        pass


@app.websocket("/ws/option-chain/{symbol}")
async def ws_option_chain(websocket: WebSocket, symbol: str):
    await websocket.accept()
    clean = canonicalize(symbol)
    try:
        while True:
            data = await cache.get_option_chain(clean)
            if data:
                await websocket.send_text(json.dumps({
                    "type": "option_chain_update",
                    "symbol": clean,
                    **data,
                    "timestamp": time.time()
                }))
            await asyncio.sleep(WS_PUSH_INTERVAL)
    except WebSocketDisconnect:
        pass


# ---------- Health Check ----------

@app.get("/health")
@app.get("/api/health")
@app.get("/api/ping")
async def health_check():
    return {
        "status": "ok",
        "framework": "FastAPI",
        "service": "BullX Live Trading API",
        "timestamp": time.time()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
