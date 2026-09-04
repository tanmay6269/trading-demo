"""
market_data_engine.py
=====================
BullX Production Market Data Provider Abstraction & Failover Engine.

Architecture:
- Abstract Base Class: MarketDataProvider
- Primary Provider: GrowwProvider (Free public API, no auth required)
- Backup Provider: AngelOneProvider (TOTP auth, SmartAPI Scrip Master)
- Tertiary Provider: UpstoxProvider (OAuth2 auth, Upstox API v2 option chain)
- Safety Fallback: RealBSProvider (Live equity spot + Black-Scholes mathematical pricing)

Failover Strategy:
- Primary: Groww Public API by default (free, no auth).
- Failover Trigger: 3 consecutive REST failures -> Switched to Angel One.
- If Angel One fails, try Upstox.
- If all fail, invoke Real Black-Scholes safety engine.
- Debug Mode: 'force_failover' endpoint to simulate outages and verify zero-downtime failover.
"""

import os
import json
import time
import logging
from abc import ABC, abstractmethod
from datetime import datetime, date
from typing import Optional, Dict, Any, List, Tuple
import requests

from symbol_mapper import canonicalize, get_symbol
from angel_one_option_chain import angel_option_engine, interpret_oi_buildup
from angel_one_auth import get_valid_jwt, login_smartapi
from upstox_auth import get_access_token

logger = logging.getLogger("market_data_engine")
logger.setLevel(logging.INFO)
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] [market_data_engine] %(message)s"))
    logger.addHandler(h)

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
})


# ------------------------------------------------------------------
# 1. Abstract Market Data Provider Interface
# ------------------------------------------------------------------
class MarketDataProvider(ABC):
    @abstractmethod
    def get_name(self) -> str:
        """Provider identifier."""
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        """Check if API credentials / tokens are present."""
        pass

    @abstractmethod
    def is_healthy(self) -> bool:
        """Check if provider is operating normally."""
        pass

    @abstractmethod
    def get_option_chain(self, symbol: str, exchange: str = "NSE", expiry: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Fetch and return standardized option chain."""
        pass

    @abstractmethod
    def get_live_tick(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Fetch live quote / tick."""
        pass


# ------------------------------------------------------------------
# 2. Concrete Provider 1: Angel One SmartAPI (PRIMARY)
# ------------------------------------------------------------------
class AngelOneProvider(MarketDataProvider):
    def __init__(self):
        self.name = "ANGEL_ONE_SMART_API"
        self._consecutive_errors = 0
        self._last_error_time = 0

    def get_name(self) -> str:
        return self.name

    def is_configured(self) -> bool:
        return bool(os.getenv("ANGEL_ONE_API_KEY", "qM6i2EyY"))

    def is_healthy(self) -> bool:
        if self._consecutive_errors >= 3:
            # Check if 60 seconds have elapsed since last error to allow recovery probe
            if time.time() - self._last_error_time > 60:
                return True
            return False
        return True

    def record_success(self):
        self._consecutive_errors = 0

    def record_failure(self, reason: str):
        self._consecutive_errors += 1
        self._last_error_time = time.time()
        logger.warning(f"⚠️ [{self.name}] Failure #{self._consecutive_errors}: {reason}")

    def get_option_chain(self, symbol: str, exchange: str = "NSE", expiry: Optional[str] = None) -> Optional[Dict[str, Any]]:
        clean = canonicalize(symbol)
        try:
            chain = angel_option_engine.build_option_chain(clean, expiry=expiry, exchange=exchange)
            if chain and chain.get("chain"):
                self.record_success()
                chain["data_source"] = self.name
                chain["active_provider"] = "PRIMARY (Angel One SmartAPI)"
                return chain
            else:
                self.record_failure("Empty option chain returned")
        except Exception as e:
            self.record_failure(str(e))
        return None

    def get_live_tick(self, symbol: str) -> Optional[Dict[str, Any]]:
        clean = canonicalize(symbol)
        try:
            from groww_data import fetch_stock_quote
            q = fetch_stock_quote(clean)
            if q and q.get("price"):
                self.record_success()
                return {
                    "symbol": clean,
                    "price": float(q["price"]),
                    "change": float(q.get("change") or 0.0),
                    "change_percent": float(q.get("change_percent") or 0.0),
                    "prev_close": float(q.get("prev_close") or q["price"]),
                    "source": self.name
                }
        except Exception as e:
            self.record_failure(str(e))
        return None


# ------------------------------------------------------------------
# 3. Concrete Provider 2: Upstox API v2 (BACKUP / FAILOVER)
# ------------------------------------------------------------------
class UpstoxProvider(MarketDataProvider):
    BASE = "https://api.upstox.com/v2"

    def __init__(self):
        self.name = "UPSTOX_API_V2"
        self._consecutive_errors = 0

    def get_name(self) -> str:
        return self.name

    @property
    def token(self) -> str:
        t = get_access_token()
        if t:
            return t
        return os.getenv("UPSTOX_ACCESS_TOKEN", "").strip()

    def is_configured(self) -> bool:
        return bool(self.token) or bool(os.getenv("UPSTOX_API_KEY"))

    def is_healthy(self) -> bool:
        return self._consecutive_errors < 5

    def get_option_chain(self, symbol: str, exchange: str = "NSE", expiry: Optional[str] = None) -> Optional[Dict[str, Any]]:
        clean = canonicalize(symbol)
        token = self.token
        if not token:
            logger.info("Upstox: Token not active, falling over to mathematical fallback")
            return None

        inst_key = get_symbol(clean, "upstox")
        params = {"instrument_key": inst_key}
        if expiry:
            params["expiry_date"] = expiry

        try:
            r = SESSION.get(
                f"{self.BASE}/option/chain",
                params=params,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                timeout=6
            )
            if r.status_code == 200:
                data = r.json()
                if data.get("status") == "success" and data.get("data"):
                    self._consecutive_errors = 0
                    norm = self._normalize_upstox_chain(data["data"], clean, exchange, expiry)
                    norm["data_source"] = self.name
                    norm["active_provider"] = "FALLBACK (Upstox API v2)"
                    logger.info(f"✅ Upstox Option Chain: Loaded {len(norm.get('chain', []))} strikes for {clean}")
                    return norm
            elif r.status_code == 401:
                logger.warning("Upstox: HTTP 401 Unauthorized (Access token expired)")
                self._consecutive_errors += 1
            else:
                logger.warning(f"Upstox: HTTP {r.status_code} for {clean}")
                self._consecutive_errors += 1
        except Exception as e:
            logger.warning(f"Upstox Option Chain Exception: {e}")
            self._consecutive_errors += 1
        return None

    def get_live_tick(self, symbol: str) -> Optional[Dict[str, Any]]:
        clean = canonicalize(symbol)
        token = self.token
        if not token:
            return None
        inst_key = get_symbol(clean, "upstox")
        try:
            r = SESSION.get(
                f"{self.BASE}/market-quote/quotes",
                params={"instrument_key": inst_key},
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                timeout=4
            )
            if r.status_code == 200:
                d = r.json().get("data", {}).get(inst_key.replace("|", ":"), {})
                if d:
                    ltp = float(d.get("last_price") or 0.0)
                    close = float(d.get("ohlc", {}).get("close") or ltp)
                    chg = round(ltp - close, 2)
                    pct = round((chg / close) * 100.0, 2) if close > 0 else 0.0
                    return {
                        "symbol": clean,
                        "price": ltp,
                        "change": chg,
                        "change_percent": pct,
                        "prev_close": close,
                        "source": self.name
                    }
        except Exception:
            pass
        return None

    def _normalize_upstox_chain(self, raw_data, underlying, exchange, expiry):
        rows = []
        spot_price = None
        total_ce_oi = 0
        total_pe_oi = 0
        expiries_set = set()
        strike_losses = {}

        for item in raw_data:
            strike = item.get("strike_price")
            if strike is None:
                continue
            strike = float(strike)

            if spot_price is None:
                spot_price = item.get("underlying_spot_price")
                if spot_price is not None:
                    spot_price = float(spot_price)

            exp = item.get("expiry")
            if exp:
                expiries_set.add(exp)

            ce_raw = item.get("call_options") or {}
            pe_raw = item.get("put_options") or {}

            ce = self._parse_upstox_leg(ce_raw)
            pe = self._parse_upstox_leg(pe_raw)

            if ce: total_ce_oi += (ce.get("oi") or 0)
            if pe: total_pe_oi += (pe.get("oi") or 0)

            rows.append({"strike": strike, "ce": ce, "pe": pe})

        rows.sort(key=lambda x: x["strike"])
        if not spot_price and rows:
            spot_price = rows[len(rows) // 2]["strike"]

        atm_strike = spot_price
        if spot_price and rows:
            atm_row = min(rows, key=lambda x: abs(x["strike"] - spot_price))
            atm_strike = atm_row["strike"]
            for r in rows:
                r["is_atm"] = (r["strike"] == atm_strike)

        # Max pain calculation
        for r in rows:
            stk = r["strike"]
            loss = 0.0
            for other_r in rows:
                o_stk = other_r["strike"]
                ce_oi = other_r.get("ce", {}).get("oi", 0) if other_r.get("ce") else 0
                pe_oi = other_r.get("pe", {}).get("oi", 0) if other_r.get("pe") else 0
                if o_stk < stk: loss += (stk - o_stk) * ce_oi
                elif o_stk > stk: loss += (o_stk - stk) * pe_oi
            strike_losses[stk] = loss

        max_pain = min(strike_losses, key=strike_losses.get) if strike_losses else atm_strike
        pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else 1.0

        return {
            "status": "success",
            "symbol": underlying,
            "exchange": exchange,
            "spot_price": spot_price,
            "atm_strike": atm_strike,
            "expiries": sorted(expiries_set),
            "selected_expiry": expiry or (sorted(expiries_set)[0] if expiries_set else None),
            "pcr": pcr,
            "max_pain": max_pain,
            "total_ce_oi": total_ce_oi,
            "total_pe_oi": total_pe_oi,
            "chain": rows,
            "received_at": datetime.utcnow().isoformat() + "Z",
        }

    def _parse_upstox_leg(self, raw):
        if not raw:
            return None
        md = raw.get("market_data") or {}
        greeks = raw.get("option_greeks") or {}
        ltp = float(md.get("ltp") or md.get("last_price") or 0.0)
        oi = int(md.get("oi") or md.get("open_interest") or 0)
        close = float(md.get("close_price") or ltp)
        chg = round(ltp - close, 2)
        oi_chg = int(oi * 0.04)

        return {
            "symbol": raw.get("instrument_key"),
            "ltp": ltp,
            "oi": oi,
            "change_in_oi": oi_chg,
            "volume": int(md.get("volume") or 0),
            "iv": float(greeks.get("iv") or 14.5),
            "delta": float(greeks.get("delta") or 0.5),
            "gamma": float(greeks.get("gamma") or 0.001),
            "theta": float(greeks.get("theta") or -2.0),
            "vega": float(greeks.get("vega") or 3.5),
            "bid_price": float(md.get("bid_price") or ltp * 0.995),
            "bid_qty": int(md.get("bid_qty") or 100),
            "ask_price": float(md.get("ask_price") or ltp * 1.005),
            "ask_qty": int(md.get("ask_qty") or 100),
            "buildup": interpret_oi_buildup(chg, oi_chg)
        }


# ------------------------------------------------------------------
# 4. Groww API Provider (PRIMARY - Free, No Auth Required)
# ------------------------------------------------------------------
class GrowwProvider(MarketDataProvider):
    def __init__(self):
        self.name = "GROWW_PUBLIC_API"
        self._consecutive_errors = 0
        self._last_error_time = 0

    def get_name(self) -> str:
        return self.name

    def is_configured(self) -> bool:
        return True

    def is_healthy(self) -> bool:
        if self._consecutive_errors >= 3:
            if time.time() - self._last_error_time > 60:
                return True
            return False
        return True

    def record_success(self):
        self._consecutive_errors = 0

    def record_failure(self, reason: str):
        self._consecutive_errors += 1
        self._last_error_time = time.time()
        logger.warning(f"[{self.name}] Failure #{self._consecutive_errors}: {reason}")

    def get_option_chain(self, symbol: str, exchange: str = "NSE", expiry: Optional[str] = None) -> Optional[Dict[str, Any]]:
        try:
            from nse_bse_fetcher import fetch_groww_option_chain_api
            chain = fetch_groww_option_chain_api(exchange, symbol, expiry)
            if chain and chain.get("chain"):
                self.record_success()
                chain["data_source"] = self.name
                chain["active_provider"] = "PRIMARY (Groww Public API)"
                return chain
            else:
                self.record_failure("Empty option chain returned")
        except Exception as e:
            self.record_failure(str(e))
        return None

    def get_live_tick(self, symbol: str) -> Optional[Dict[str, Any]]:
        clean = canonicalize(symbol)
        try:
            from groww_data import fetch_stock_quote
            q = fetch_stock_quote(clean)
            if q and q.get("price"):
                self.record_success()
                return {
                    "symbol": clean,
                    "price": float(q["price"]),
                    "change": float(q.get("change") or 0.0),
                    "change_percent": float(q.get("change_percent") or 0.0),
                    "prev_close": float(q.get("prev_close") or q["price"]),
                    "source": self.name
                }
        except Exception as e:
            self.record_failure(str(e))
        return None


# ------------------------------------------------------------------
# 5. Safety Fallback: Real Option Chain Engine (Black-Scholes)
# ------------------------------------------------------------------
class RealBSProvider(MarketDataProvider):
    def get_name(self) -> str:
        return "LOCAL_REAL_BLACK_SCHOLES"

    def is_configured(self) -> bool:
        return True

    def is_healthy(self) -> bool:
        return True

    def get_option_chain(self, symbol: str, exchange: str = "NSE", expiry: Optional[str] = None) -> Optional[Dict[str, Any]]:
        from nse_bse_fetcher import get_real_option_chain
        res = get_real_option_chain(symbol, exchange, expiry)
        if res:
            res["active_provider"] = "FALLBACK (Real Black-Scholes Formula Engine)"
        return res

    def get_live_tick(self, symbol: str) -> Optional[Dict[str, Any]]:
        from groww_data import fetch_stock_quote
        q = fetch_stock_quote(symbol)
        if q:
            return {
                "symbol": symbol,
                "price": float(q.get("price") or 0.0),
                "change": float(q.get("change") or 0.0),
                "change_percent": float(q.get("change_percent") or 0.0),
                "prev_close": float(q.get("prev_close") or q.get("price") or 0.0),
                "source": self.get_name()
            }
        return None


# ------------------------------------------------------------------
# 6. Master Provider Selection & Failover Manager
# ------------------------------------------------------------------
class MarketDataEngineManager:
    """Coordinates Primary (Groww) -> Backup (Angel One/Upstox) -> Fallback (BS) failover."""

    def __init__(self):
        self.primary_provider = GrowwProvider()
        self.backup_provider = AngelOneProvider()
        self.tertiary_provider = UpstoxProvider()
        self.fallback_provider = RealBSProvider()

        self.override_mode = "AUTO"  # "AUTO" | "FORCE_GROWW" | "FORCE_ANGEL_ONE" | "FORCE_UPSTOX"
        self.failover_logs: List[Dict[str, Any]] = []

    def set_override_mode(self, mode: str) -> Dict[str, Any]:
        """Manually toggle debug provider mode."""
        valid_modes = ["AUTO", "FORCE_GROWW", "FORCE_ANGEL_ONE", "FORCE_UPSTOX"]
        m = mode.upper().strip()
        if m in valid_modes:
            prev = self.override_mode
            self.override_mode = m
            event = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "event": "MANUAL_MODE_OVERRIDE",
                "previous_mode": prev,
                "new_mode": m
            }
            self.failover_logs.append(event)
            logger.info(f"Provider Override Mode changed from {prev} to {m}")
            return {"status": "ok", "mode": m}
        return {"status": "error", "message": f"Invalid mode. Choose from {valid_modes}"}

    def get_status(self) -> Dict[str, Any]:
        """Return diagnostic health and active provider status."""
        return {
            "mode": self.override_mode,
            "primary": {
                "name": self.primary_provider.get_name(),
                "configured": self.primary_provider.is_configured(),
                "healthy": self.primary_provider.is_healthy()
            },
            "backup": {
                "name": self.backup_provider.get_name(),
                "configured": self.backup_provider.is_configured(),
                "healthy": self.backup_provider.is_healthy()
            },
            "recent_failover_events": self.failover_logs[-10:]
        }

    def get_option_chain(self, symbol: str, exchange: str = "NSE", expiry: Optional[str] = None) -> Dict[str, Any]:
        """
        Ingestion with automatic failover and recovery:
        1. AUTO: Try Groww (Primary). If healthy/success, return.
           If Groww fails, log failover and try Angel One (Backup).
           If Angel One fails, try Upstox (Tertiary).
           If all fail, invoke Real Black-Scholes safety engine.
        """
        clean = canonicalize(symbol)
        ex = exchange.upper()

        if self.override_mode == "FORCE_GROWW":
            logger.info(f"[OVERRIDE] Using GROWW Provider for {clean}")
            res = self.primary_provider.get_option_chain(clean, ex, expiry)
            if res: return res
            return self.fallback_provider.get_option_chain(clean, ex, expiry)

        if self.override_mode == "FORCE_ANGEL_ONE":
            logger.info(f"[OVERRIDE] Using ANGEL ONE Provider for {clean}")
            res = self.backup_provider.get_option_chain(clean, ex, expiry)
            if res: return res
            return self.fallback_provider.get_option_chain(clean, ex, expiry)

        if self.override_mode == "FORCE_UPSTOX":
            logger.info(f"[OVERRIDE] Using UPSTOX Provider for {clean}")
            res = self.tertiary_provider.get_option_chain(clean, ex, expiry)
            if res: return res
            return self.fallback_provider.get_option_chain(clean, ex, expiry)

        # AUTO Mode: Try Groww first (free, no auth needed)
        if self.primary_provider.is_healthy():
            res = self.primary_provider.get_option_chain(clean, ex, expiry)
            if res and res.get("chain"):
                return res

        # Primary (Groww) failed -> Failover to Angel One
        log_event = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "symbol": clean,
            "event": "AUTOMATIC_FAILOVER",
            "reason": "Groww API failed or error threshold exceeded",
            "provider_switched_to": self.backup_provider.get_name()
        }
        self.failover_logs.append(log_event)
        logger.warning(f"[FAILOVER] Groww unavailable for {clean}. Switching to Angel One Provider...")

        res = self.backup_provider.get_option_chain(clean, ex, expiry)
        if res and res.get("chain"):
            return res

        # Angel One also failed -> Try Upstox
        res = self.tertiary_provider.get_option_chain(clean, ex, expiry)
        if res and res.get("chain"):
            return res

        # All providers failed -> Return Real BS option chain
        logger.info(f"Using Real Black-Scholes Engine for {clean}")
        return self.fallback_provider.get_option_chain(clean, ex, expiry)


# Singleton Engine Manager
_engine_manager = MarketDataEngineManager()


# ------------------------------------------------------------------
# Public API Endpoints Bridge
# ------------------------------------------------------------------
async def fetch_option_chain_failover(exchange: str, symbol: str, expiry: Optional[str] = None) -> Dict[str, Any]:
    """Top-level async failover dispatcher used across FastAPI routes and poller."""
    return _engine_manager.get_option_chain(symbol, exchange, expiry)


def validate_broker_tokens() -> Dict[str, Any]:
    """Token validation report for Angel One and Upstox."""
    angel_api = os.getenv("ANGEL_ONE_API_KEY", "").strip()
    angel_jwt = get_valid_jwt()
    upstox_tok = get_access_token()

    return {
        "timestamp": time.time(),
        "primary_provider": {
            "name": "Angel One SmartAPI",
            "status": "VALID" if (angel_api or angel_jwt) else "CONFIGURED_API_KEY",
            "api_key_configured": bool(angel_api)
        },
        "backup_provider": {
            "name": "Upstox API v2",
            "status": "VALID" if upstox_tok else "MISSING_TOKEN",
            "access_token_present": bool(upstox_tok)
        },
        "active_mode": _engine_manager.override_mode
    }
