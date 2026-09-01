"""
poller.py
---------
High-Performance Tiered Market Poller Engine for BullX.

1. Covers ALL 180+ NSE F&O-eligible stocks and indices.
2. Tier 1 (2.0s Loop): Core Indices + Top 10 Equities + Active User Viewed symbols.
3. Tier 2 (30.0s Loop): Remaining ~170 F&O stocks polled in micro-batches of 15.
4. Single-source price calculation: (LTP - PrevClose) / PrevClose * 100.
5. Option chain failover: Upstox -> Dhan -> Groww SDK -> Groww Free -> NSE Free (nsepython).
6. 60-Second Data Cross-Check Validation against official NSE Public data.
"""

import os
import time
import asyncio
import logging
from typing import Dict, Any, List, Optional, Set
import httpx

from symbol_mapper import canonicalize, get_symbol
import redis_cache as cache
from fo_discovery import OFFICIAL_NSE_FO_LIST
from fo_validator import validator

logger = logging.getLogger("poller")
logger.setLevel(logging.INFO)
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] [poller] %(message)s"))
    logger.addHandler(h)

# Configuration & Credentials
UPSTOX_ACCESS_TOKEN = os.getenv("UPSTOX_ACCESS_TOKEN", "")
DHAN_CLIENT_ID = os.getenv("DHAN_CLIENT_ID", "")
DHAN_ACCESS_TOKEN = os.getenv("DHAN_ACCESS_TOKEN", "")

# Tier 1 "Always-On" Core Set
TIER1_CORE_SYMBOLS = [
    "NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "INDIAVIX",
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN",
    "BHARTIARTL", "ITC", "TATAMOTORS", "LT"
]

TIER1_POLL_INTERVAL = 2.0
TIER2_POLL_INTERVAL = 30.0
VALIDATION_INTERVAL = 60.0


def _correct_pct_change(ltp: float, prev_close: float) -> float:
    """Always (current - previous close) / previous close * 100 — never Open."""
    if not prev_close or prev_close <= 0:
        return 0.0
    return round(((ltp - prev_close) / prev_close) * 100, 2)


class MarketPoller:
    def __init__(self):
        self.running = False
        self.client: Optional[httpx.AsyncClient] = None
        self._active_views: Dict[str, float] = {}  # symbol -> last_viewed_timestamp
        self._all_fo_symbols = [item["symbol"] for item in OFFICIAL_NSE_FO_LIST]
        self._last_validation_time = 0

    def register(self, symbol: str):
        """Mark a symbol as actively viewed by a user (elevates to Tier 1 for 5 mins)."""
        clean = canonicalize(symbol)
        if clean:
            self._active_views[clean] = time.time()

    def get_tier1_symbols(self) -> List[str]:
        """Return Tier 1 symbols (Always-On Core + Active in last 5 minutes)."""
        now = time.time()
        active = [s for s, last_t in self._active_views.items() if (now - last_t) < 300]
        merged = list(dict.fromkeys(TIER1_CORE_SYMBOLS + active))
        return merged

    def get_tier2_symbols(self) -> List[str]:
        """Return Tier 2 symbols (Remaining F&O stocks)."""
        tier1_set = set(self.get_tier1_symbols())
        return [s for s in self._all_fo_symbols if s not in tier1_set]

    async def start(self):
        """Main lifecycle entrypoint for background polling tasks."""
        self.running = True
        self.client = httpx.AsyncClient(
            timeout=4.0,
            limits=httpx.Limits(max_keepalive_connections=50, max_connections=100)
        )
        logger.info(f"🚀 BullX F&O Market Poller started ({len(self._all_fo_symbols)} total underlyings)")

        try:
            await asyncio.gather(
                self._tier1_loop(),
                self._tier2_loop(),
                self._validation_loop()
            )
        except asyncio.CancelledError:
            logger.info("Poller task cancelled")
        finally:
            if self.client:
                await self.client.aclose()

    # ---------- TIER 1: HIGH-PRIORITY LOOP (2.0s) ----------
    async def _tier1_loop(self):
        while self.running:
            try:
                symbols = self.get_tier1_symbols()
                # 1. Poll live prices
                for sym in symbols:
                    q = await self.fetch_price_one_symbol(sym)
                    if q:
                        await cache.set_stock_price(sym, q, ttl_seconds=5)
                        if sym in ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "INDIAVIX"]:
                            await cache.set_index(sym, q, ttl_seconds=10)

                # 2. Poll option chains for active symbols
                for sym in symbols:
                    chain = await self.fetch_option_chain_one_symbol(sym)
                    if chain and chain.get("chain"):
                        await cache.set_option_chain("NSE", sym, "default", chain, ttl_seconds=5)

            except Exception as e:
                logger.error(f"Error in Tier 1 loop: {e}")
            
            await asyncio.sleep(TIER1_POLL_INTERVAL)

    # ---------- TIER 2: STAGGERED BACKGROUND LOOP (30.0s) ----------
    async def _tier2_loop(self):
        while self.running:
            try:
                tier2_symbols = self.get_tier2_symbols()
                batch_size = 15
                
                for i in range(0, len(tier2_symbols), batch_size):
                    batch = tier2_symbols[i:i + batch_size]
                    for sym in batch:
                        q = await self.fetch_price_one_symbol(sym)
                        if q:
                            await cache.set_stock_price(sym, q, ttl_seconds=60)
                    
                    # Micro-delay between batches to respect broker rate limits
                    await asyncio.sleep(0.5)

            except Exception as e:
                logger.error(f"Error in Tier 2 loop: {e}")

            await asyncio.sleep(TIER2_POLL_INTERVAL)

    # ---------- VALIDATION LOOP: 60s SAMPLE CHECK ----------
    async def _validation_loop(self):
        while self.running:
            try:
                sample_symbols = ["NIFTY", "BANKNIFTY", "RELIANCE", "TCS", "HDFCBANK"]
                for sym in sample_symbols:
                    cached_chain = await cache.get_option_chain("NSE", sym, "default")
                    if cached_chain:
                        await validator.validate_sample_symbol(sym, cached_chain)
            except Exception as e:
                logger.debug(f"Validation loop error: {e}")

            await asyncio.sleep(VALIDATION_INTERVAL)

    # ---------- STOCK PRICE FETCHERS (Single-Source Formula) ----------
    async def fetch_price_upstox(self, symbol: str) -> Optional[dict]:
        if not (self.client and UPSTOX_ACCESS_TOKEN):
            return None
        try:
            upstox_symbol = get_symbol(symbol, "upstox")
            resp = await self.client.get(
                "https://api.upstox.com/v2/market-quote/quotes",
                params={"instrument_key": upstox_symbol},
                headers={"Authorization": f"Bearer {UPSTOX_ACCESS_TOKEN}", "Accept": "application/json"}
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
                        "change_percent": _correct_pct_change(ltp, prev_close),
                        "source": "upstox",
                        "ts": time.time()
                    }
        except Exception:
            pass
        return None

    async def fetch_price_groww(self, symbol: str) -> Optional[dict]:
        if not self.client:
            return None
        try:
            clean = get_symbol(symbol, "groww")
            url = f"https://groww.in/v1/api/stocks_data/v1/accord_points/exchange/NSE/segment/CASH/latest_prices_ohlc/{clean}"
            resp = await self.client.get(url, timeout=2.5)
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
                        "change_percent": _correct_pct_change(ltp, prev_close),
                        "high": d.get("high"),
                        "low": d.get("low"),
                        "open": d.get("open"),
                        "source": "groww",
                        "ts": time.time()
                    }
        except Exception:
            pass
        return None

    async def fetch_price_yahoo(self, symbol: str) -> Optional[dict]:
        if not self.client:
            return None
        try:
            yahoo_symbol = get_symbol(symbol, "yahoo")
            resp = await self.client.get(
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
                    prev_close = closes[-2] if len(closes) >= 2 else (meta.get("chartPreviousClose") or meta.get("regularMarketPreviousClose"))
                    
                    if ltp and prev_close and float(prev_close) > 0:
                        ltp = round(float(ltp), 2)
                        prev_close = round(float(prev_close), 2)
                        return {
                            "price": ltp,
                            "ltp": ltp,
                            "prev_close": prev_close,
                            "change": round(ltp - prev_close, 2),
                            "change_percent": _correct_pct_change(ltp, prev_close),
                            "source": "yahoo",
                            "ts": time.time()
                        }
        except Exception:
            pass
        return None

    async def fetch_price_one_symbol(self, symbol: str) -> Optional[dict]:
        for fetcher in (self.fetch_price_upstox, self.fetch_price_groww, self.fetch_price_yahoo):
            try:
                data = await fetcher(symbol)
                if data and data.get("price"):
                    return data
            except Exception:
                continue
        return None

    # ---------- OPTION CHAIN INGESTION (Upstox -> Dhan -> Groww -> NSE) ----------
    async def fetch_option_chain_one_symbol(self, symbol: str, expiry: Optional[str] = None) -> Optional[dict]:
        from market_data_engine import fetch_option_chain_failover
        try:
            chain = await fetch_option_chain_failover("NSE", symbol, expiry)
            if chain and chain.get("chain"):
                return chain
        except Exception as e:
            logger.debug(f"Option chain failover error for {symbol}: {e}")
        return None


# Global singleton poller instance
poller = MarketPoller()
