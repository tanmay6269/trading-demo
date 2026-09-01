"""
poller_async.py
-----------------
Run this as its OWN process, separate from your FastAPI/uvicorn workers:

    python poller_async.py

This is the ONLY code that talks to Upstox / Dhan / NSE / Yahoo / Groww.
FastAPI routes and the WebSocket endpoints only ever read Redis
(via redis_cache_async.py). This keeps behavior correct and lag-free even
if you run FastAPI with multiple uvicorn workers.
"""

import os
import asyncio
import time
from typing import Optional, Dict, Any, List
import httpx

from symbol_mapper import get_symbol
import redis_cache_async as cache

UPSTOX_ACCESS_TOKEN = os.getenv("UPSTOX_ACCESS_TOKEN", "")
DHAN_CLIENT_ID = os.getenv("DHAN_CLIENT_ID", "")
DHAN_ACCESS_TOKEN = os.getenv("DHAN_ACCESS_TOKEN", "")

STOCKS_TO_TRACK = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL",
    "ITC", "TATAMOTORS", "LT", "MARUTI", "BAJFINANCE", "SUNPHARMA", "ASIANPAINT",
    "TITAN", "ZOMATO", "PAYTM", "SUZLON", "JIOFIN", "SWIGGY", "WIPRO", "HCLTECH",
    "ADANIENT", "ADANIPORTS", "POWERGRID", "NTPC", "COALINDIA", "ONGC", "TATASTEEL",
    "JSWSTEEL", "M&M", "EICHERMOT", "BAJAJ-AUTO", "CIPLA", "DIVISLAB", "DRREDDY",
    "VEDL", "TATAPOWER", "HAL", "BEL", "RVNL", "IRFC", "PFC", "REC", "CDSL", "BSE"
]

INDICES_TO_TRACK = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY", "MIDCPNIFTY", "INDIA VIX"]
OPTION_CHAIN_SYMBOLS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX", "RELIANCE", "HDFCBANK"]

PRICE_POLL_INTERVAL = 1.5
OPTION_CHAIN_POLL_INTERVAL = 2.0

# One shared async HTTP client, reused for every call — not recreated per request.
client = httpx.AsyncClient(timeout=3.0)


def _correct_pct_change(ltp: float, prev_close: float) -> float:
    """Always (current - previous close) / previous close * 100 — never Open."""
    if not prev_close or prev_close <= 0:
        return 0.0
    return round(((ltp - prev_close) / prev_close) * 100, 2)


# ---------- STOCK / INDEX PRICES ----------

async def fetch_price_upstox(symbol: str) -> Optional[dict]:
    if not UPSTOX_ACCESS_TOKEN:
        return None
    try:
        upstox_symbol = get_symbol(symbol, "upstox")
        resp = await client.get(
            "https://api.upstox.com/v2/market-quote/quotes",
            params={"instrument_key": upstox_symbol},
            headers={"Authorization": f"Bearer {UPSTOX_ACCESS_TOKEN}", "Accept": "application/json"},
        )
        if resp.status_code == 200:
            payload = resp.json().get("data", {}).get(upstox_symbol, {})
            ltp = float(payload.get("last_price", 0))
            prev_close = float(payload.get("ohlc", {}).get("close") or ltp)
            if ltp > 0 and prev_close > 0:
                return {
                    "price": ltp,
                    "ltp": ltp,
                    "prev_close": prev_close,
                    "change": round(ltp - prev_close, 2),
                    "change_pct": _correct_pct_change(ltp, prev_close),
                    "change_percent": _correct_pct_change(ltp, prev_close),
                    "source": "upstox",
                    "ts": time.time(),
                }
    except Exception:
        pass
    return None


async def fetch_price_nse(symbol: str) -> Optional[dict]:
    """Free fallback, no broker account. pip install nsepython"""
    try:
        from nsepython import nse_eq
        nse_symbol = get_symbol(symbol, "nse")
        data = await asyncio.to_thread(nse_eq, nse_symbol)
        if data and "priceInfo" in data:
            ltp = float(data["priceInfo"].get("lastPrice", 0))
            prev_close = float(data["priceInfo"].get("previousClose") or ltp)
            if ltp > 0 and prev_close > 0:
                return {
                    "price": ltp,
                    "ltp": ltp,
                    "prev_close": prev_close,
                    "change": round(ltp - prev_close, 2),
                    "change_pct": _correct_pct_change(ltp, prev_close),
                    "change_percent": _correct_pct_change(ltp, prev_close),
                    "source": "nse",
                    "ts": time.time(),
                }
    except Exception:
        pass
    return None


async def fetch_price_groww(symbol: str) -> Optional[dict]:
    """Groww Accord API fallback"""
    try:
        clean = get_symbol(symbol, "groww")
        url = f"https://groww.in/v1/api/stocks_data/v1/accord_points/exchange/NSE/segment/CASH/latest_prices_ohlc/{clean}"
        resp = await client.get(url, timeout=2.0)
        if resp.status_code == 200:
            d = resp.json()
            ltp = float(d.get("ltp") or d.get("close") or 0)
            prev_close = float(d.get("close") or ltp)
            if ltp > 0 and prev_close > 0:
                return {
                    "price": round(ltp, 2),
                    "ltp": round(ltp, 2),
                    "prev_close": round(prev_close, 2),
                    "change": round(ltp - prev_close, 2),
                    "change_pct": _correct_pct_change(ltp, prev_close),
                    "change_percent": _correct_pct_change(ltp, prev_close),
                    "high": d.get("high"),
                    "low": d.get("low"),
                    "open": d.get("open"),
                    "source": "groww",
                    "ts": time.time(),
                }
    except Exception:
        pass
    return None


async def fetch_price_yahoo(symbol: str) -> Optional[dict]:
    try:
        yahoo_symbol = get_symbol(symbol, "yahoo")
        resp = await client.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}?interval=1d&range=5d",
            timeout=2.5
        )
        if resp.status_code == 200:
            result = resp.json().get("chart", {}).get("result", [])
            if result:
                meta = result[0].get("meta", {})
                quote = result[0].get("indicators", {}).get("quote", [{}])[0]
                closes = [c for c in quote.get("close", []) if c is not None and c > 0]
                ltp = meta.get("regularMarketPrice") or (closes[-1] if closes else None)
                if closes:
                    if len(closes) >= 2 and ltp and abs(closes[-1] - ltp) < 0.01:
                        prev_close = closes[-2]
                    else:
                        prev_close = closes[-1]
                else:
                    prev_close = meta.get("chartPreviousClose") or meta.get("regularMarketPreviousClose")

                if ltp and prev_close and float(prev_close) > 0:
                    ltp = round(float(ltp), 2)
                    prev_close = round(float(prev_close), 2)
                    return {
                        "price": ltp,
                        "ltp": ltp,
                        "prev_close": prev_close,
                        "change": round(ltp - prev_close, 2),
                        "change_pct": _correct_pct_change(ltp, prev_close),
                        "change_percent": _correct_pct_change(ltp, prev_close),
                        "source": "yahoo",
                        "ts": time.time(),
                    }
    except Exception:
        pass
    return None


async def fetch_price_one_symbol(symbol: str) -> Optional[dict]:
    for fetcher in (fetch_price_upstox, fetch_price_nse, fetch_price_groww, fetch_price_yahoo):
        try:
            data = await fetcher(symbol)
            if data is not None and data.get("price"):
                return data
        except Exception:
            continue
    return None


# ---------- OPTION CHAIN ----------

async def fetch_option_chain_upstox(symbol: str) -> Optional[dict]:
    if not UPSTOX_ACCESS_TOKEN:
        return None
    try:
        upstox_symbol = get_symbol(symbol, "upstox")
        resp = await client.get(
            "https://api.upstox.com/v2/option/chain",
            params={"instrument_key": upstox_symbol},
            headers={"Authorization": f"Bearer {UPSTOX_ACCESS_TOKEN}", "Accept": "application/json"},
        )
        if resp.status_code == 200:
            return {"strikes": resp.json().get("data", []), "source": "upstox", "ts": time.time()}
    except Exception:
        pass
    return None


async def fetch_option_chain_dhan(symbol: str) -> Optional[dict]:
    if not (DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN):
        return None
    try:
        dhan_symbol = get_symbol(symbol, "dhan")
        resp = await client.post(
            "https://api.dhan.co/v2/optionchain",
            json={"UnderlyingSymbol": dhan_symbol},
            headers={
                "client-id": DHAN_CLIENT_ID,
                "access-token": DHAN_ACCESS_TOKEN,
            },
        )
        if resp.status_code == 200:
            return {"strikes": resp.json().get("data", []), "source": "dhan", "ts": time.time()}
    except Exception:
        pass
    return None


async def fetch_option_chain_nse(symbol: str) -> Optional[dict]:
    """Free fallback via NSE public data. pip install nsepython"""
    try:
        from nsepython import nse_optionchain_scrapper
        nse_symbol = get_symbol(symbol, "nse")
        data = await asyncio.to_thread(nse_optionchain_scrapper, nse_symbol)
        if data and "records" in data:
            return {
                "underlyingValue": data["records"].get("underlyingValue"),
                "expiryDates": data["records"].get("expiryDates", []),
                "strikes": data["records"].get("data", []),
                "source": "nse",
                "ts": time.time()
            }
    except Exception:
        pass
    return None


async def fetch_option_chain_one_symbol(symbol: str) -> Optional[dict]:
    # Same priority order: Upstox -> Dhan -> NSE Public
    for fetcher in (fetch_option_chain_upstox, fetch_option_chain_dhan, fetch_option_chain_nse):
        try:
            data = await fetcher(symbol)
            if data is not None and data.get("strikes"):
                return data
        except Exception:
            continue
    return None


# ---------- LOOPS ----------

async def price_loop():
    while True:
        try:
            for symbol in STOCKS_TO_TRACK:
                data = await fetch_price_one_symbol(symbol)
                if data:
                    await cache.set_stock_price(symbol, data)

            for symbol in INDICES_TO_TRACK:
                data = await fetch_price_one_symbol(symbol)
                if data:
                    await cache.set_index(symbol, data)
        except Exception as e:
            print(f"[poller_async] Price loop exception: {e}")
        await asyncio.sleep(PRICE_POLL_INTERVAL)


async def option_chain_loop():
    while True:
        try:
            for symbol in OPTION_CHAIN_SYMBOLS:
                data = await fetch_option_chain_one_symbol(symbol)
                if data:
                    await cache.set_option_chain(symbol, data)
        except Exception as e:
            print(f"[poller_async] Option chain loop exception: {e}")
        await asyncio.sleep(OPTION_CHAIN_POLL_INTERVAL)


async def main():
    print("🚀 [poller_async] Starting BullX background price + option chain poller loops")
    await asyncio.gather(price_loop(), option_chain_loop())


if __name__ == "__main__":
    asyncio.run(main())
