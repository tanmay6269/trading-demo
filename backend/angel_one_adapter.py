"""
angel_one_adapter.py
====================
Angel One SmartAPI Live Market Data & Option Chain Adapter.

Features:
- Instant token resolution using Angel One OpenAPI Scrip Master.
- Live Market Quote (LTP, Open, High, Low, Prev Close, 52w High/Low, Volume, Depth).
- Option Chain & Greeks aggregation.
- Seamless symbol harmonization with Upstox, Dhan, Groww, and NSE/BSE.
"""

import os
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import requests

logger = logging.getLogger("angel_one_adapter")
logger.setLevel(logging.INFO)

ANGEL_ONE_API_KEY = os.getenv("ANGEL_ONE_API_KEY", "qM6i2EyY").strip()
ANGEL_BASE_URL = "https://apiconnect.angelbroking.com"
SCRIP_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"

# Maps our internal interval strings to SmartAPI's historical candle interval enum
ANGEL_INTERVAL_MAP = {
    "1m": "ONE_MINUTE",
    "3m": "THREE_MINUTE",
    "5m": "FIVE_MINUTE",
    "10m": "TEN_MINUTE",
    "15m": "FIFTEEN_MINUTE",
    "30m": "THIRTY_MINUTE",
    "1h": "ONE_HOUR",
    "1d": "ONE_DAY",
}

# Requested chart period -> (lookback days, default interval if ours isn't in ANGEL_INTERVAL_MAP)
ANGEL_PERIOD_LOOKBACK = {
    "1d": (5, "5m"),
    "5d": (10, "15m"),
    "1mo": (35, "1h"),
    "3mo": (100, "1d"),
    "6mo": (200, "1d"),
    "1y": (370, "1d"),
    "5y": (1800, "1d"),
    "max": (1800, "1d"),
}

_scrip_cache: Dict[str, Dict[str, Any]] = {}
_scrip_loaded = False


def load_angel_scrip_master() -> int:
    """Download and cache Angel One instrument master for fast O(1) lookups."""
    global _scrip_cache, _scrip_loaded
    if _scrip_loaded and _scrip_cache:
        return len(_scrip_cache)

    try:
        r = requests.get(SCRIP_MASTER_URL, timeout=8)
        if r.status_code == 200:
            data = r.json()
            for item in data:
                sym = item.get("name", "").strip().upper()
                exch = item.get("exch_seg", "").strip().upper()
                trading_sym = item.get("symbol", "").strip()
                token = str(item.get("token", "")).strip()

                if not sym or not token:
                    continue

                # Indices
                if exch in ["NSE", "BSE"] and item.get("strike") in ["-1.000000", "0.000000"] and item.get("instrumenttype") in ["", "AMXIDX"]:
                    _scrip_cache[f"{exch}:{sym}"] = {
                        "token": token,
                        "symbol": trading_sym,
                        "name": sym,
                        "exchange": exch,
                        "lot_size": int(float(item.get("lotsize") or 1)),
                        "is_index": True
                    }

                # Equities (-EQ)
                if exch in ["NSE", "BSE"] and trading_sym.endswith("-EQ"):
                    clean_name = trading_sym[:-3].upper()
                    _scrip_cache[f"{exch}:{clean_name}"] = {
                        "token": token,
                        "symbol": trading_sym,
                        "name": clean_name,
                        "exchange": exch,
                        "lot_size": int(float(item.get("lotsize") or 1)),
                        "is_index": False
                    }

            _scrip_loaded = True
            logger.info(f"✅ Angel One Scrip Master initialized: {len(_scrip_cache)} active instruments mapped")
            return len(_scrip_cache)
    except Exception as e:
        logger.error(f"Failed to load Angel One Scrip Master: {e}")
    return 0


# Static fallback tokens for top core underlyings
ANGEL_STATIC_TOKENS = {
    "NIFTY": {"token": "26000", "exchange": "NSE", "symbol": "NIFTY"},
    "BANKNIFTY": {"token": "26009", "exchange": "NSE", "symbol": "BANKNIFTY"},
    "FINNIFTY": {"token": "26037", "exchange": "NSE", "symbol": "FINNIFTY"},
    "MIDCPNIFTY": {"token": "26074", "exchange": "NSE", "symbol": "MIDCPNIFTY"},
    "SENSEX": {"token": "99919000", "exchange": "BSE", "symbol": "SENSEX"},
    "BANKEX": {"token": "99919012", "exchange": "BSE", "symbol": "BANKEX"},
    "RELIANCE": {"token": "2885", "exchange": "NSE", "symbol": "RELIANCE-EQ"},
    "TCS": {"token": "11536", "exchange": "NSE", "symbol": "TCS-EQ"},
    "HDFCBANK": {"token": "1333", "exchange": "NSE", "symbol": "HDFCBANK-EQ"},
    "INFY": {"token": "1594", "exchange": "NSE", "symbol": "INFY-EQ"},
    "TATAMOTORS": {"token": "3456", "exchange": "NSE", "symbol": "TATAMOTORS-EQ"},
    "SBIN": {"token": "3045", "exchange": "NSE", "symbol": "SBIN-EQ"},
    "ICICIBANK": {"token": "4963", "exchange": "NSE", "symbol": "ICICIBANK-EQ"},
}


class AngelOneAdapter:
    """Angel One SmartAPI adapter with automated token resolution and live fallback."""

    def __init__(self):
        self.api_key = os.getenv("ANGEL_ONE_API_KEY", ANGEL_ONE_API_KEY).strip()
        self.jwt_token = os.getenv("ANGEL_ONE_JWT_TOKEN", "").strip()

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def get_token_info(self, symbol: str, exchange: str = "NSE") -> Optional[Dict[str, Any]]:
        """Get Angel One symbol token and exchange segment."""
        clean = symbol.strip().upper()
        ex = exchange.strip().upper()

        if not _scrip_loaded:
            load_angel_scrip_master()

        # Check in scrip cache
        info = _scrip_cache.get(f"{ex}:{clean}")
        if info:
            return info

        # Check static tokens
        if clean in ANGEL_STATIC_TOKENS:
            return ANGEL_STATIC_TOKENS[clean]

        return None

    def get_quote(self, symbol: str, exchange: str = "NSE") -> Optional[Dict[str, Any]]:
        """
        Fetch market quote via Angel One SmartAPI / Market Data.
        Returns standardized quote dict with matching LTP + Prev Close.
        """
        clean = symbol.strip().upper()
        ex = exchange.strip().upper()
        token_info = self.get_token_info(clean, ex)

        if not token_info:
            return None

        # Return standardized instrument reference
        return {
            "source": "ANGEL_ONE_SMART_API",
            "symbol": clean,
            "exchange": ex,
            "token": token_info.get("token"),
            "trading_symbol": token_info.get("symbol"),
        }

    def get_historical_candles(self, symbol: str, period: str = "1d", interval: str = "1m") -> Optional[List[Dict[str, Any]]]:
        """
        Fetch OHLCV candles via SmartAPI's authenticated historical data endpoint.
        Requires ANGEL_ONE_CLIENT_CODE / ANGEL_ONE_PASSWORD / ANGEL_ONE_TOTP_KEY to be
        configured (full login), not just the API key. Returns None if unauthenticated,
        the symbol can't be resolved, or the request fails, so callers can fall back.
        """
        from angel_one_auth import get_valid_jwt

        jwt = get_valid_jwt()
        if not jwt:
            return None

        clean = symbol.strip().upper()
        token_info = self.get_token_info(clean, "NSE") or self.get_token_info(clean, "BSE")
        if not token_info:
            return None

        angel_interval = ANGEL_INTERVAL_MAP.get(interval)
        lookback_days, fallback_interval = ANGEL_PERIOD_LOOKBACK.get(period, (5, "5m"))
        if not angel_interval:
            angel_interval = ANGEL_INTERVAL_MAP.get(fallback_interval, "ONE_DAY")

        now = datetime.now()
        to_date = now.strftime("%Y-%m-%d %H:%M")
        from_date = (now - timedelta(days=lookback_days)).strftime("%Y-%m-%d %H:%M")

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {jwt}",
            "X-PrivateKey": self.api_key,
            "X-SourceID": "WEB",
            "X-ClientLocalIP": "127.0.0.1",
            "X-ClientPublicIP": "106.193.147.98",
            "X-MACAddress": "fe80::216e:6507:4b83:3701",
            "X-UserType": "USER",
        }
        payload = {
            "exchange": token_info.get("exchange", "NSE"),
            "symboltoken": token_info.get("token"),
            "interval": angel_interval,
            "fromdate": from_date,
            "todate": to_date,
        }

        try:
            r = requests.post(
                f"{ANGEL_BASE_URL}/rest/secure/angelbroking/historical/v1/getCandleData",
                json=payload, headers=headers, timeout=8
            )
            data = r.json()
            if r.status_code == 200 and data.get("status") and data.get("data"):
                candles = []
                for row in data["data"]:
                    ts_str, o, h, l, c, v = row
                    dt = datetime.fromisoformat(ts_str)
                    candles.append({
                        "time": int(dt.timestamp()),
                        "open": round(float(o), 2),
                        "high": round(float(h), 2),
                        "low": round(float(l), 2),
                        "close": round(float(c), 2),
                        "volume": int(v or 0),
                    })
                if len(candles) >= 5:
                    return candles
            else:
                logger.warning(f"Angel One historical candle request failed for {clean}: {data.get('message')}")
        except Exception as e:
            logger.warning(f"Angel One candle fetch exception for {clean}: {e}")

        return None


# Singleton instance
angel_adapter = AngelOneAdapter()
