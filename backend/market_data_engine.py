"""
BullX Multi-Source Live Market Data Engine
==========================================
Tries each configured broker API in priority order.
Returns ONLY real exchange data — NEVER synthetic/calculated data.

Supported sources:
  1. Upstox API v2  (UPSTOX_ACCESS_TOKEN)
  2. DhanHQ API     (DHAN_CLIENT_ID + DHAN_ACCESS_TOKEN)
  3. Groww SDK       (GROWW_API_TOKEN)

If no API is configured or all fail, returns a clean error.
"""

import os
import json
import logging
from datetime import datetime

import requests

logger = logging.getLogger("market_data_engine")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(levelname)s: %(message)s"))
    logger.addHandler(handler)

# ============================================================
# Symbol normalization
# ============================================================
UNDERLYING_MAP = {
    "NIFTY 50": "NIFTY", "NIFTY": "NIFTY", "^NSEI": "NIFTY",
    "BANK NIFTY": "BANKNIFTY", "BANKNIFTY": "BANKNIFTY", "^NSEBANK": "BANKNIFTY",
    "FIN NIFTY": "FINNIFTY", "FINNIFTY": "FINNIFTY",
    "MIDCAP NIFTY": "MIDCPNIFTY", "MIDCPNIFTY": "MIDCPNIFTY",
    "SENSEX": "SENSEX", "BSE SENSEX": "SENSEX", "^BSESN": "SENSEX",
    "BANKEX": "BANKEX",
}

# DhanHQ uses numeric security IDs for underlying indices
DHAN_SECURITY_IDS = {
    "NIFTY": 13,
    "BANKNIFTY": 25,
    "FINNIFTY": 27,
    "MIDCPNIFTY": 442,
    "SENSEX": 51,
    "BANKEX": 54,
}

# Upstox instrument keys for underlying indices
UPSTOX_INSTRUMENT_KEYS = {
    "NIFTY": "NSE_INDEX|Nifty 50",
    "BANKNIFTY": "NSE_INDEX|Nifty Bank",
    "FINNIFTY": "NSE_INDEX|Nifty Fin Service",
    "MIDCPNIFTY": "NSE_INDEX|NIFTY MID SELECT",
    "SENSEX": "BSE_INDEX|SENSEX",
}

def normalize_underlying(symbol):
    s = symbol.strip().upper().replace('.NS', '').replace('.BO', '')
    return UNDERLYING_MAP.get(s, s)


# ============================================================
# Upstox Adapter
# ============================================================
class UpstoxAdapter:
    """Fetches option chain from Upstox API v2 (free, requires demat account)."""

    BASE = "https://api.upstox.com/v2"

    def __init__(self):
        self.token = os.getenv("UPSTOX_ACCESS_TOKEN", "")

    def is_configured(self):
        return bool(self.token)

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
        }

    def get_option_chain(self, underlying, exchange="NSE", expiry=None):
        """
        GET /v2/option/chain?instrument_key=...&expiry_date=...
        Returns normalized chain dict or None on failure.
        """
        inst_key = UPSTOX_INSTRUMENT_KEYS.get(underlying)
        if not inst_key:
            # For equities: NSE_EQ|{symbol}
            inst_key = f"NSE_EQ|{underlying}"

        params = {"instrument_key": inst_key}
        if expiry:
            params["expiry_date"] = self._normalize_expiry(expiry)

        try:
            logger.info(f"========== UPSTOX OPTION CHAIN ==========")
            logger.info(f"  underlying={underlying}, instrument_key={inst_key}, expiry={expiry}")

            r = requests.get(
                f"{self.BASE}/option/chain",
                params=params,
                headers=self._headers(),
                timeout=8
            )

            logger.info(f"  Upstox HTTP {r.status_code}")

            if r.status_code == 401:
                logger.error("  Upstox: ACCESS_TOKEN expired or invalid")
                return None
            if r.status_code != 200:
                logger.error(f"  Upstox error: {r.text[:300]}")
                return None

            data = r.json()
            if data.get("status") != "success" or not data.get("data"):
                logger.error(f"  Upstox: non-success response: {json.dumps(data)[:300]}")
                return None

            return self._normalize(data["data"], underlying, exchange, expiry)

        except Exception as e:
            logger.error(f"  Upstox exception: {e}")
            return None

    def _normalize(self, raw_data, underlying, exchange, expiry):
        """Parse Upstox v2 option chain response into unified format."""
        rows = []
        spot_price = None
        total_ce_oi = 0
        total_pe_oi = 0
        expiries_set = set()

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

            ce = self._parse_leg(ce_raw, "CE", spot_price, strike)
            pe = self._parse_leg(pe_raw, "PE", spot_price, strike)

            if ce:
                total_ce_oi += (ce["oi"] or 0)
            if pe:
                total_pe_oi += (pe["oi"] or 0)

            rows.append({"strike": strike, "ce": ce, "pe": pe})

        rows.sort(key=lambda x: x["strike"])

        # ATM
        if spot_price and rows:
            atm = min(rows, key=lambda x: abs(x["strike"] - spot_price))
            for r in rows:
                r["is_atm"] = (r["strike"] == atm["strike"])
        else:
            for r in rows:
                r["is_atm"] = False

        pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else None
        max_pain = self._calc_max_pain(rows)

        return {
            "status": "success",
            "data_source": "UPSTOX_API",
            "symbol": underlying,
            "exchange": exchange,
            "spot_price": spot_price,
            "expiries": sorted(expiries_set),
            "selected_expiry": expiry or (sorted(expiries_set)[0] if expiries_set else None),
            "lot_size": 25 if (spot_price or 0) > 10000 else 250,
            "pcr": pcr,
            "max_pain": max_pain,
            "chain": rows,
            "received_at": datetime.utcnow().isoformat() + "Z",
        }

    def _parse_leg(self, raw, side, spot, strike):
        if not raw:
            return None
        md = raw.get("market_data") or {}
        greeks = raw.get("option_greeks") or {}
        inst_key = raw.get("instrument_key")
        return {
            "symbol": inst_key,
            "ltp": md.get("ltp"),
            "oi": md.get("oi"),
            "volume": md.get("volume"),
            "iv": greeks.get("iv"),
            "delta": greeks.get("delta"),
            "gamma": greeks.get("gamma"),
            "theta": greeks.get("theta"),
            "vega": greeks.get("vega"),
            "bid_price": md.get("bid_price"),
            "ask_price": md.get("ask_price"),
            "bid_quantity": md.get("bid_qty"),
            "ask_quantity": md.get("ask_qty"),
            "is_itm": (spot > strike) if side == "CE" and spot else (spot < strike) if side == "PE" and spot else False,
        }

    def _normalize_expiry(self, exp):
        if not exp:
            return None
        exp = exp.strip()
        if len(exp) == 10 and exp[4] == '-':
            return exp
        from datetime import datetime as dt
        for fmt in ('%d-%b-%Y', '%d-%B-%Y', '%d-%m-%Y'):
            try:
                return dt.strptime(exp, fmt).strftime('%Y-%m-%d')
            except ValueError:
                pass
        return exp

    def _calc_max_pain(self, rows):
        if not rows:
            return None
        min_pain = float('inf')
        mp_strike = None
        for cand in rows:
            ck = cand["strike"]
            total = 0.0
            for r in rows:
                k = r["strike"]
                c_oi = (r["ce"]["oi"] if r["ce"] else 0) or 0
                p_oi = (r["pe"]["oi"] if r["pe"] else 0) or 0
                if ck > k:
                    total += (ck - k) * c_oi
                if ck < k:
                    total += (k - ck) * p_oi
            if total < min_pain:
                min_pain = total
                mp_strike = ck
        return mp_strike


# ============================================================
# DhanHQ Adapter
# ============================================================
class DhanAdapter:
    """Fetches option chain from DhanHQ API (free, requires demat account)."""

    BASE = "https://api.dhan.co/v2"

    def __init__(self):
        self.client_id = os.getenv("DHAN_CLIENT_ID", "")
        self.token = os.getenv("DHAN_ACCESS_TOKEN", "")

    def is_configured(self):
        return bool(self.client_id and self.token)

    def _headers(self):
        return {
            "access-token": self.token,
            "client-id": self.client_id,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def get_option_chain(self, underlying, exchange="NSE", expiry=None):
        sec_id = DHAN_SECURITY_IDS.get(underlying)
        underlying_seg = "IDX_I"

        if not sec_id:
            # For equities, we'd need the scrip master lookup
            underlying_seg = "EQ"
            # Use underlying as security_id string
            sec_id = underlying
            logger.warning(f"DhanHQ: No security_id mapping for {underlying}, trying as equity")

        body = {
            "UnderlyingScrip": sec_id,
            "UnderlyingSeg": underlying_seg,
        }
        if expiry:
            body["Expiry"] = self._normalize_expiry(expiry)

        try:
            logger.info(f"========== DHAN OPTION CHAIN ==========")
            logger.info(f"  underlying={underlying}, sec_id={sec_id}, expiry={expiry}")

            r = requests.post(
                f"{self.BASE}/optionchain",
                json=body,
                headers=self._headers(),
                timeout=8
            )

            logger.info(f"  DhanHQ HTTP {r.status_code}")

            if r.status_code == 401:
                logger.error("  DhanHQ: Authentication failed")
                return None
            if r.status_code != 200:
                logger.error(f"  DhanHQ error: {r.text[:300]}")
                return None

            data = r.json()
            if not data.get("data"):
                logger.error(f"  DhanHQ: no data in response: {json.dumps(data)[:300]}")
                return None

            return self._normalize(data["data"], underlying, exchange, expiry)

        except Exception as e:
            logger.error(f"  DhanHQ exception: {e}")
            return None

    def _normalize(self, raw_data, underlying, exchange, expiry):
        spot_price = raw_data.get("last_price")
        if spot_price is not None:
            spot_price = float(spot_price)

        oc = raw_data.get("oc", {})
        rows = []
        total_ce_oi = 0
        total_pe_oi = 0

        for strike_key, contract in oc.items():
            try:
                strike = float(strike_key)
            except (ValueError, TypeError):
                continue

            ce_raw = contract.get("ce") or {}
            pe_raw = contract.get("pe") or {}

            ce = self._parse_leg(ce_raw, "CE", spot_price, strike)
            pe = self._parse_leg(pe_raw, "PE", spot_price, strike)

            if ce:
                total_ce_oi += (ce["oi"] or 0)
            if pe:
                total_pe_oi += (pe["oi"] or 0)

            rows.append({"strike": strike, "ce": ce, "pe": pe})

        rows.sort(key=lambda x: x["strike"])

        if spot_price and rows:
            atm = min(rows, key=lambda x: abs(x["strike"] - spot_price))
            for r in rows:
                r["is_atm"] = (r["strike"] == atm["strike"])
        else:
            for r in rows:
                r["is_atm"] = False

        pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else None
        max_pain = self._calc_max_pain(rows)

        return {
            "status": "success",
            "data_source": "DHAN_API",
            "symbol": underlying,
            "exchange": exchange,
            "spot_price": spot_price,
            "expiries": [],
            "selected_expiry": expiry,
            "lot_size": 25 if (spot_price or 0) > 10000 else 250,
            "pcr": pcr,
            "max_pain": max_pain,
            "chain": rows,
            "received_at": datetime.utcnow().isoformat() + "Z",
        }

    def _parse_leg(self, raw, side, spot, strike):
        if not raw:
            return None
        greeks = raw.get("greeks") or {}
        return {
            "symbol": raw.get("security_id"),
            "ltp": raw.get("last_price"),
            "oi": raw.get("oi") or raw.get("open_interest"),
            "volume": raw.get("volume"),
            "iv": raw.get("implied_volatility") or greeks.get("iv"),
            "delta": greeks.get("delta"),
            "gamma": greeks.get("gamma"),
            "theta": greeks.get("theta"),
            "vega": greeks.get("vega"),
            "bid_price": raw.get("bid_price"),
            "ask_price": raw.get("ask_price"),
            "bid_quantity": raw.get("bid_qty"),
            "ask_quantity": raw.get("ask_qty"),
            "is_itm": (spot > strike) if side == "CE" and spot else (spot < strike) if side == "PE" and spot else False,
        }

    def _normalize_expiry(self, exp):
        if not exp:
            return None
        exp = exp.strip()
        if len(exp) == 10 and exp[4] == '-':
            return exp
        from datetime import datetime as dt
        for fmt in ('%d-%b-%Y', '%d-%B-%Y', '%d-%m-%Y'):
            try:
                return dt.strptime(exp, fmt).strftime('%Y-%m-%d')
            except ValueError:
                pass
        return exp

    def _calc_max_pain(self, rows):
        if not rows:
            return None
        min_pain = float('inf')
        mp_strike = None
        for cand in rows:
            ck = cand["strike"]
            total = 0.0
            for r in rows:
                k = r["strike"]
                c_oi = (r["ce"]["oi"] if r["ce"] else 0) or 0
                p_oi = (r["pe"]["oi"] if r["pe"] else 0) or 0
                if ck > k:
                    total += (ck - k) * c_oi
                if ck < k:
                    total += (k - ck) * p_oi
            if total < min_pain:
                min_pain = total
                mp_strike = ck
        return mp_strike


# ============================================================
# Groww SDK Adapter (existing, kept as fallback)
# ============================================================
class GrowwAdapter:
    """Fetches option chain from Groww Trade API SDK (requires paid token)."""

    def __init__(self):
        self.token = os.getenv("GROWW_API_TOKEN", "")

    def is_configured(self):
        return bool(self.token)

    def get_option_chain(self, underlying, exchange="NSE", expiry=None):
        try:
            logger.info(f"========== GROWW SDK OPTION CHAIN ==========")
            logger.info(f"  underlying={underlying}, exchange={exchange}, expiry={expiry}")

            from real_option_chain import get_live_groww_option_chain
            data = get_live_groww_option_chain(underlying, exchange, expiry)

            if data and data.get("chain"):
                logger.info(f"  Groww SDK: {len(data['chain'])} strikes returned")
                return data
            else:
                logger.warning("  Groww SDK: no chain data returned")
                return None

        except Exception as e:
            logger.error(f"  Groww SDK exception: {e}")
            return None


# ============================================================
# Groww Free API Adapter (existing REST API, no SDK)
# ============================================================
class GrowwFreeAdapter:
    """Fetches option chain from Groww's free REST API (may return stale data)."""

    def __init__(self):
        self.token = os.getenv("GROWW_API_TOKEN", "")

    def is_configured(self):
        # Always available as last resort (may work without token for some endpoints)
        return True

    def get_option_chain(self, underlying, exchange="NSE", expiry=None):
        try:
            logger.info(f"========== GROWW FREE API OPTION CHAIN ==========")
            logger.info(f"  underlying={underlying}, exchange={exchange}, expiry={expiry}")

            from nse_bse_fetcher import fetch_groww_option_chain_api
            data = fetch_groww_option_chain_api(exchange, underlying, expiry)

            if data and data.get("chain"):
                logger.info(f"  Groww Free API: {len(data['chain'])} strikes returned")
                return data
            else:
                logger.warning("  Groww Free API: no chain data returned")
                return None

        except Exception as e:
            logger.error(f"  Groww Free API exception: {e}")
            return None


# ============================================================
# Main Engine — Multi-Source with Automatic Failover
# ============================================================
class MarketDataEngine:
    """
    Unified market data engine with automatic failover.

    Priority order:
      1. Upstox  (if UPSTOX_ACCESS_TOKEN is set)
      2. DhanHQ  (if DHAN_CLIENT_ID + DHAN_ACCESS_TOKEN are set)
      3. Groww SDK (if GROWW_API_TOKEN is set)
      4. Groww Free API (last resort)

    NEVER returns synthetic / Black-Scholes calculated data.
    """

    def __init__(self):
        self.adapters = []

        upstox = UpstoxAdapter()
        if upstox.is_configured():
            self.adapters.append(("UPSTOX", upstox))
            logger.info("MarketDataEngine: Upstox adapter ENABLED")

        dhan = DhanAdapter()
        if dhan.is_configured():
            self.adapters.append(("DHAN", dhan))
            logger.info("MarketDataEngine: DhanHQ adapter ENABLED")

        groww_sdk = GrowwAdapter()
        if groww_sdk.is_configured():
            self.adapters.append(("GROWW_SDK", groww_sdk))
            logger.info("MarketDataEngine: Groww SDK adapter ENABLED")

        groww_free = GrowwFreeAdapter()
        self.adapters.append(("GROWW_FREE", groww_free))
        logger.info("MarketDataEngine: Groww Free API adapter ENABLED (fallback)")

        if not self.adapters:
            logger.error("MarketDataEngine: NO data sources configured!")

    def get_configured_sources(self):
        """Return list of configured source names."""
        return [name for name, _ in self.adapters]

    def get_option_chain(self, symbol, exchange="NSE", expiry=None):
        """
        Fetch option chain from the first available source.
        Returns dict with chain data, or error dict.
        NEVER returns synthetic data.
        """
        clean = normalize_underlying(symbol)
        ex = exchange.strip().upper()
        errors = []

        for name, adapter in self.adapters:
            try:
                logger.info(f"MarketDataEngine: Trying {name} for {clean}...")
                result = adapter.get_option_chain(clean, ex, expiry)
                if result and result.get("chain"):
                    logger.info(f"MarketDataEngine: SUCCESS from {name} — {len(result['chain'])} strikes")
                    result["data_source"] = result.get("data_source", name)
                    return result
                else:
                    msg = f"{name}: returned empty chain"
                    logger.warning(f"MarketDataEngine: {msg}")
                    errors.append(msg)
            except Exception as e:
                msg = f"{name}: {str(e)}"
                logger.error(f"MarketDataEngine: {msg}")
                errors.append(msg)

        # ALL sources failed — return error, NEVER fake data
        logger.error(f"MarketDataEngine: ALL sources failed for {clean}: {errors}")
        return {
            "status": "error",
            "error": f"All data sources failed for {clean} on {ex}",
            "sources_tried": [name for name, _ in self.adapters],
            "errors": errors,
        }


# Singleton instance
_engine = None

def get_engine():
    global _engine
    if _engine is None:
        _engine = MarketDataEngine()
    return _engine
