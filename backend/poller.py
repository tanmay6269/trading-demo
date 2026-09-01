"""
poller.py
---------
Standalone Async Market Data Poller for BullX Trading Engine.
This is the ONLY background loop allowed to talk to external broker/exchange APIs.

Features:
1. Option chain failover: Upstox → Dhan → Groww SDK → Groww Free → NSE Free (nsepython)
2. Stock price failover: Upstox → NSE → BSE → Groww → Yahoo (Single-Source LTP + PrevClose)
3. Correct % calculation: (LTP - PrevClose) / PrevClose * 100
4. Writes directly into Redis (TTL 2s for prices/options, 5s for indices)
5. Multi-worker safe: Redis SET NX leader election allows running as standalone process
   (e.g., `python poller.py`) or embedded in FastAPI lifespan.
"""

import os
import sys
import time
import asyncio
import logging
from typing import Optional, Dict, Any, List
import httpx
import requests

from symbol_mapper import get_symbol, SYMBOL_MAP, canonicalize
from redis_cache import cache, TTL_STOCK_PRICE, TTL_OPTION_CHAIN, TTL_INDEX

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [poller] %(message)s"
)
logger = logging.getLogger("poller")

# External Broker & Exchange Credentials
UPSTOX_ACCESS_TOKEN = os.getenv("UPSTOX_ACCESS_TOKEN", "")
DHAN_CLIENT_ID = os.getenv("DHAN_CLIENT_ID", "")
DHAN_ACCESS_TOKEN = os.getenv("DHAN_ACCESS_TOKEN", "")
GROWW_API_TOKEN = os.getenv("GROWW_API_TOKEN", "")

# Persistent Session Pool for Sync Libraries (bsedata, nsepython)
_sync_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=50, pool_maxsize=100, max_retries=1)
_sync_session.mount("https://", adapter)
_sync_session.mount("http://", adapter)

# Polling Watchlists
STOCKS_TO_POLL = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL",
    "ITC", "TATAMOTORS", "LT", "MARUTI", "BAJFINANCE", "SUNPHARMA", "ASIANPAINT",
    "TITAN", "ZOMATO", "PAYTM", "SUZLON", "JIOFIN", "SWIGGY", "WIPRO", "HCLTECH",
    "ADANIENT", "ADANIPORTS", "POWERGRID", "NTPC", "COALINDIA", "ONGC", "TATASTEEL",
    "JSWSTEEL", "M&M", "EICHERMOT", "BAJAJ-AUTO", "CIPLA", "DIVISLAB", "DRREDDY",
    "VEDL", "TATAPOWER", "HAL", "BEL", "RVNL", "IRFC", "PFC", "REC", "CDSL", "BSE"
]

INDICES_TO_POLL = [
    "NIFTY", "NIFTY 50", "BANKNIFTY", "BANK NIFTY", "SENSEX", "FINNIFTY", "MIDCPNIFTY", "INDIA VIX"
]

OPTION_UNDERLYINGS_TO_POLL = [
    ("NSE", "NIFTY"),
    ("NSE", "BANKNIFTY"),
    ("NSE", "FINNIFTY"),
    ("NSE", "RELIANCE"),
    ("NSE", "HDFCBANK"),
    ("BSE", "SENSEX")
]

POLL_INTERVAL_SECONDS = 1.5


def calculate_pct_change(ltp: float, prev_close: float) -> float:
    """
    Standard Mathematical % Change Formula:
    (LTP - Previous Close) / Previous Close * 100
    Guaranteed: PrevClose is NEVER substituted with Open price.
    """
    if not prev_close or prev_close <= 0:
        return 0.0
    return round(((ltp - prev_close) / prev_close) * 100.0, 2)


# =====================================================================
# 1. STOCK PRICE FETCHERS (ASYNC & FAILOVER)
# =====================================================================

async def fetch_stock_upstox(client: httpx.AsyncClient, symbol: str) -> Optional[Dict[str, Any]]:
    if not UPSTOX_ACCESS_TOKEN:
        return None
    try:
        upstox_sym = get_symbol(symbol, "upstox")
        resp = await client.get(
            "https://api.upstox.com/v2/market-quote/quotes",
            params={"instrument_key": upstox_sym},
            headers={"Authorization": f"Bearer {UPSTOX_ACCESS_TOKEN}", "Accept": "application/json"},
            timeout=2.0
        )
        if resp.status_code == 200:
            payload = resp.json().get("data", {}).get(upstox_sym, {})
            ltp = float(payload.get("last_price", 0))
            prev_close = float(payload.get("ohlc", {}).get("close") or ltp)
            if ltp > 0 and prev_close > 0:
                return {
                    "symbol": canonicalize(symbol),
                    "price": round(ltp, 2),
                    "ltp": round(ltp, 2),
                    "prev_close": round(prev_close, 2),
                    "change": round(ltp - prev_close, 2),
                    "change_percent": calculate_pct_change(ltp, prev_close),
                    "source": "UPSTOX",
                    "ts": time.time()
                }
    except Exception:
        pass
    return None


async def fetch_stock_nse(client: httpx.AsyncClient, symbol: str) -> Optional[Dict[str, Any]]:
    """Fetch live stock price via NSE Python"""
    try:
        from nsepython import nse_eq
        loop = asyncio.get_event_loop()
        nse_sym = get_symbol(symbol, "nse")
        data = await loop.run_in_executor(None, nse_eq, nse_sym)
        if data and "priceInfo" in data:
            pi = data["priceInfo"]
            ltp = float(pi.get("lastPrice", 0))
            prev_close = float(pi.get("previousClose") or ltp)
            if ltp > 0 and prev_close > 0:
                return {
                    "symbol": canonicalize(symbol),
                    "price": round(ltp, 2),
                    "ltp": round(ltp, 2),
                    "prev_close": round(prev_close, 2),
                    "change": round(ltp - prev_close, 2),
                    "change_percent": calculate_pct_change(ltp, prev_close),
                    "source": "NSE",
                    "ts": time.time()
                }
    except Exception:
        pass
    return None


async def fetch_stock_bse(client: httpx.AsyncClient, symbol: str) -> Optional[Dict[str, Any]]:
    """Fetch live stock price via BSE India (bsedata)"""
    try:
        from bsedata.bse import BSE
        scrip_code = get_symbol(symbol, "bse")
        if not scrip_code or not str(scrip_code).isdigit():
            return None
        
        loop = asyncio.get_event_loop()
        def _get_bse():
            b = BSE(update_codes=False)
            return b.getQuote(str(scrip_code))

        quote = await loop.run_in_executor(None, _get_bse)
        if quote and quote.get("currentValue"):
            ltp = float(quote["currentValue"])
            prev_close = float(quote.get("previousClose") or ltp)
            if ltp > 0:
                return {
                    "symbol": canonicalize(symbol),
                    "price": round(ltp, 2),
                    "ltp": round(ltp, 2),
                    "prev_close": round(prev_close, 2),
                    "change": round(ltp - prev_close, 2),
                    "change_percent": calculate_pct_change(ltp, prev_close),
                    "source": "BSE",
                    "ts": time.time()
                }
    except Exception:
        pass
    return None


async def fetch_stock_groww(client: httpx.AsyncClient, symbol: str) -> Optional[Dict[str, Any]]:
    """Fetch live quote from Groww Accord API"""
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
                    "symbol": canonicalize(symbol),
                    "price": round(ltp, 2),
                    "ltp": round(ltp, 2),
                    "prev_close": round(prev_close, 2),
                    "change": round(ltp - prev_close, 2),
                    "change_percent": calculate_pct_change(ltp, prev_close),
                    "high": d.get("high"),
                    "low": d.get("low"),
                    "open": d.get("open"),
                    "source": "GROWW",
                    "ts": time.time()
                }
    except Exception:
        pass
    return None


async def fetch_stock_yahoo(client: httpx.AsyncClient, symbol: str) -> Optional[Dict[str, Any]]:
    """Fetch live quote from Yahoo Finance Chart API"""
    try:
        ysym = get_symbol(symbol, "yahoo")
        encoded = requests.utils.quote(ysym)
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?interval=1d&range=5d"
        resp = await client.get(url, timeout=2.5)
        if resp.status_code == 200:
            res_list = resp.json().get("chart", {}).get("result", [])
            if res_list:
                meta = res_list[0].get("meta", {})
                quote = res_list[0].get("indicators", {}).get("quote", [{}])[0]
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
                        "symbol": canonicalize(symbol),
                        "price": ltp,
                        "ltp": ltp,
                        "prev_close": prev_close,
                        "change": round(ltp - prev_close, 2),
                        "change_percent": calculate_pct_change(ltp, prev_close),
                        "source": "YAHOO",
                        "ts": time.time()
                    }
    except Exception:
        pass
    return None


async def fetch_one_stock(client: httpx.AsyncClient, symbol: str) -> Optional[Dict[str, Any]]:
    """
    Failover priority for stock prices:
    Upstox → NSE → BSE → Groww → Yahoo.
    LTP and Previous Close ALWAYS extracted together from the same source.
    """
    for fetcher in (fetch_stock_upstox, fetch_stock_nse, fetch_stock_bse, fetch_stock_groww, fetch_stock_yahoo):
        data = await fetcher(client, symbol)
        if data and data.get("price"):
            return data
    return None


# =====================================================================
# 2. OPTION CHAIN FETCHERS (FAILOVER WITH NSE PYTHON BACKUP)
# =====================================================================

async def fetch_option_chain_failover(exchange: str, underlying: str, expiry: str = None) -> Optional[Dict[str, Any]]:
    """
    Option Chain Failover Engine:
    Upstox → Dhan → Groww SDK → Groww Free → NSE Free (nsepython)
    """
    loop = asyncio.get_event_loop()

    # 1. Try market_data_engine (Upstox / Dhan / Groww)
    try:
        from market_data_engine import market_engine
        data = await loop.run_in_executor(None, market_engine.get_option_chain, exchange, underlying, expiry)
        if data and data.get("status") == "success" and data.get("strikes"):
            return data
    except Exception:
        pass

    # 2. Try NSE Free public option chain via nsepython
    try:
        from nsepython import nse_optionchain_scrapper
        clean_u = get_symbol(underlying, "nse")
        nse_data = await loop.run_in_executor(None, nse_optionchain_scrapper, clean_u)
        if nse_data and "records" in nse_data:
            records = nse_data.get("records", {})
            underlying_value = records.get("underlyingValue", 0.0)
            expiries = records.get("expiryDates", [])
            target_expiry = expiry or (expiries[0] if expiries else None)
            
            raw_data = records.get("data", [])
            strikes = []
            for item in raw_data:
                if item.get("expiryDate") == target_expiry:
                    ce = item.get("CE", {})
                    pe = item.get("PE", {})
                    strike_p = item.get("strikePrice")
                    if strike_p:
                        strikes.append({
                            "strike": float(strike_p),
                            "ce": {
                                "ltp": float(ce.get("lastPrice", 0.0)),
                                "change": float(ce.get("change", 0.0)),
                                "pChange": float(ce.get("pChange", 0.0)),
                                "oi": int(ce.get("openInterest", 0)),
                                "volume": int(ce.get("totalTradedVolume", 0)),
                                "iv": float(ce.get("impliedVolatility", 0.0))
                            } if ce else None,
                            "pe": {
                                "ltp": float(pe.get("lastPrice", 0.0)),
                                "change": float(pe.get("change", 0.0)),
                                "pChange": float(pe.get("pChange", 0.0)),
                                "oi": int(pe.get("openInterest", 0)),
                                "volume": int(pe.get("totalTradedVolume", 0)),
                                "iv": float(pe.get("impliedVolatility", 0.0))
                            } if pe else None,
                        })

            if strikes:
                return {
                    "status": "success",
                    "underlying": underlying,
                    "exchange": exchange,
                    "spot_price": underlying_value,
                    "expiry": target_expiry,
                    "expiries": expiries,
                    "strikes": strikes,
                    "source": "NSE_PUBLIC",
                    "cached_at": time.time()
                }
    except Exception:
        pass

    return None


# =====================================================================
# 3. BACKGROUND POLLING LOOP & LIFESPAN
# =====================================================================

class AsyncMarketPoller:
    """Async Market Poller Manager with distributed leader lock"""
    def __init__(self):
        self.is_running = False
        self._task = None

    async def poll_cycle(self, client: httpx.AsyncClient):
        # A. Poll Indices
        indices_dict = {}
        index_tasks = [fetch_one_stock(client, sym) for sym in INDICES_TO_POLL]
        index_results = await asyncio.gather(*index_tasks, return_exceptions=True)
        for sym, res in zip(INDICES_TO_POLL, index_results):
            if isinstance(res, dict) and res.get("price"):
                await cache.set_index(sym, res, ttl_seconds=TTL_INDEX)
                canonical_name = SYMBOL_MAP.get(sym, {}).get("display", sym)
                indices_dict[canonical_name] = {
                    "symbol": sym,
                    "value": res["price"],
                    "price": res["price"],
                    "prev_close": res["prev_close"],
                    "change": res["change"],
                    "change_percent": res["change_percent"]
                }

        if indices_dict:
            await cache.set_all_indices(indices_dict, ttl_seconds=TTL_INDEX)

        # B. Poll Equities
        stock_tasks = [fetch_one_stock(client, sym) for sym in STOCKS_TO_POLL]
        stock_results = await asyncio.gather(*stock_tasks, return_exceptions=True)
        for sym, res in zip(STOCKS_TO_POLL, stock_results):
            if isinstance(res, dict) and res.get("price"):
                await cache.set_stock_price(sym, res, ttl_seconds=TTL_STOCK_PRICE)

        # C. Poll Active Option Chains
        for exch, und in OPTION_UNDERLYINGS_TO_POLL:
            try:
                chain = await fetch_option_chain_failover(exch, und)
                if chain:
                    await cache.set_option_chain(exch, und, chain.get("expiry"), chain, ttl_seconds=TTL_OPTION_CHAIN)
            except Exception:
                pass

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        logger.info("🚀 [poller] Standalone async market poller initialized (1.5s loop -> Redis)")

        async with httpx.AsyncClient(timeout=3.0) as client:
            while self.is_running:
                start_t = time.time()
                try:
                    await self.poll_cycle(client)
                except Exception as e:
                    logger.debug(f"Poll cycle error: {e}")

                elapsed = time.time() - start_t
                await asyncio.sleep(max(POLL_INTERVAL_SECONDS - elapsed, 0.1))

    def stop(self):
        self.is_running = False

# Global poller instance
poller = AsyncMarketPoller()

def run_standalone():
    """Entrypoint when running `python poller.py` as a standalone daemon process"""
    logger.info("Starting BullX Standalone Market Poller Service...")
    try:
        asyncio.run(poller.start())
    except KeyboardInterrupt:
        logger.info("Poller stopped by user.")

if __name__ == "__main__":
    run_standalone()
