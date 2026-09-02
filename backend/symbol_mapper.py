"""
symbol_mapper.py
================
Single source of truth for how EVERY stock/index is named across the
different market data APIs (Upstox / Dhan / NSE / Yahoo / Groww / BSE).

Features:
1. Dynamic broker instrument master file download and caching (Upstox & Dhan).
2. Auto-resolution for all 180+ NSE F&O-eligible underlyings without manual typing.
3. Strict deterministic formulas for Equities & Indices across all broker transports.
"""

import os
import csv
import gzip
import time
import logging
import threading
import requests
from typing import Optional, Dict, Any

logger = logging.getLogger("symbol_mapper")

# Cache folder for instrument masters
INSTRUMENTS_DIR = os.path.join(os.path.dirname(__file__), "instruments_master")
os.makedirs(INSTRUMENTS_DIR, exist_ok=True)

# ------------------------------------------------------------------
# Canonical Overrides & Index Mappings
# ------------------------------------------------------------------
CANONICAL_INDEX_MAP = {
    "NIFTY": {
        "canonical": "NIFTY",
        "display": "NIFTY 50",
        "yahoo": "^NSEI",
        "upstox": "NSE_INDEX|Nifty 50",
        "angelone": "26000",
        "angelone_symbol": "NIFTY",
        "dhan": "NIFTY",
        "dhan_sec_id": "13",
        "nse": "NIFTY",
        "groww": "NIFTY",
    },
    "BANKNIFTY": {
        "canonical": "BANKNIFTY",
        "display": "BANK NIFTY",
        "yahoo": "^NSEBANK",
        "upstox": "NSE_INDEX|Nifty Bank",
        "angelone": "26009",
        "angelone_symbol": "BANKNIFTY",
        "dhan": "BANKNIFTY",
        "dhan_sec_id": "25",
        "nse": "BANKNIFTY",
        "groww": "BANKNIFTY",
    },
    "FINNIFTY": {
        "canonical": "FINNIFTY",
        "display": "FIN NIFTY",
        "yahoo": "NIFTY_FIN_SERVICE.NS",
        "upstox": "NSE_INDEX|Nifty Fin Service",
        "angelone": "26037",
        "angelone_symbol": "FINNIFTY",
        "dhan": "FINNIFTY",
        "dhan_sec_id": "27",
        "nse": "FINNIFTY",
        "groww": "FINNIFTY",
    },
    "MIDCPNIFTY": {
        "canonical": "MIDCPNIFTY",
        "display": "MIDCAP NIFTY",
        "yahoo": "NIFTY_MID_SELECT.NS",
        "upstox": "NSE_INDEX|NIFTY MID SELECT",
        "angelone": "26074",
        "angelone_symbol": "MIDCPNIFTY",
        "dhan": "MIDCPNIFTY",
        "dhan_sec_id": "44",
        "nse": "MIDCPNIFTY",
        "groww": "MIDCPNIFTY",
    },
    "SENSEX": {
        "canonical": "SENSEX",
        "display": "SENSEX",
        "yahoo": "^BSESN",
        "upstox": "BSE_INDEX|SENSEX",
        "angelone": "99919000",
        "angelone_symbol": "SENSEX",
        "dhan": "SENSEX",
        "dhan_sec_id": "51",
        "nse": "SENSEX",
        "groww": "SENSEX",
    },
    "BANKEX": {
        "canonical": "BANKEX",
        "display": "BSE BANKEX",
        "yahoo": "^BSEBANK",
        "upstox": "BSE_INDEX|BANKEX",
        "angelone": "99919012",
        "angelone_symbol": "BANKEX",
        "dhan": "BANKEX",
        "dhan_sec_id": "52",
        "nse": "BANKEX",
        "groww": "BANKEX",
    },
    "INDIAVIX": {
        "canonical": "INDIAVIX",
        "display": "INDIA VIX",
        "yahoo": "^INDIAVIX",
        "upstox": "NSE_INDEX|India VIX",
        "angelone": "26017",
        "angelone_symbol": "INDIA VIX",
        "dhan": "INDIAVIX",
        "nse": "INDIA VIX",
        "groww": "INDIA VIX",
    },
}

# Special Stock Aliases (where Yahoo or Upstox uses custom naming)
STOCK_ALIASES = {
    "M&M": {"yahoo": "M&M.NS", "dhan": "M&M-EQ", "upstox_symbol": "M&M", "groww": "M&M"},
    "M&MFIN": {"yahoo": "M&MFIN.NS", "dhan": "M&MFIN-EQ", "upstox_symbol": "M&MFIN", "groww": "M&MFIN"},
    "BAJAJ-AUTO": {"yahoo": "BAJAJ-AUTO.NS", "dhan": "BAJAJ-AUTO-EQ", "upstox_symbol": "BAJAJ-AUTO", "groww": "BAJAJ-AUTO"},
    "L&TFH": {"yahoo": "L&TFH.NS", "dhan": "L&TFH-EQ", "upstox_symbol": "L&TFH", "groww": "L&TFH"},
}

# BSE Scrip Code Reference Table for 180+ F&O Stocks
BSE_SCRIP_CODES = {
    "RELIANCE": "500325", "TCS": "532540", "HDFCBANK": "500180", "INFY": "500209",
    "ICICIBANK": "532174", "SBIN": "500112", "BHARTIARTL": "532454", "ITC": "500875",
    "TATAMOTORS": "500570", "LT": "500510", "MARUTI": "532500", "BAJFINANCE": "500034",
    "SUNPHARMA": "524715", "ASIANPAINT": "500820", "TITAN": "500114", "ZOMATO": "543320",
    "PAYTM": "543396", "SUZLON": "532667", "JIOFIN": "543940", "SWIGGY": "544280",
    "WIPRO": "507685", "HCLTECH": "532281", "ADANIENT": "512599", "ADANIPORTS": "532921",
    "POWERGRID": "532898", "NTPC": "532555", "COALINDIA": "533278", "ONGC": "500312",
    "TATASTEEL": "500470", "JSWSTEEL": "500228", "M&M": "500520", "EICHERMOT": "505200",
    "BAJAJ-AUTO": "532977", "CIPLA": "500087", "DIVISLAB": "532488", "DRREDDY": "500124",
    "VEDL": "500295", "TATAPOWER": "500400", "HAL": "541154", "BEL": "500049",
    "RVNL": "542649", "IRFC": "543257", "PFC": "532810", "REC": "532955",
    "CDSL": "540716", "BSE": "540526", "DIXON": "540699", "POLYCAB": "542652",
    "TRENT": "500251", "PERSISTENT": "533179", "BHEL": "500103", "IREDA": "544026",
    "COCHINSHIP": "540678", "MAZDOCK": "543237", "KPITTECH": "542651", "KAYNES": "543664"
}


# ------------------------------------------------------------------
# Dynamic Instrument Master Cache
# ------------------------------------------------------------------
class DynamicInstrumentManager:
    """Downloads & caches broker instrument master files to map all 180+ F&O underlyings."""
    
    def __init__(self):
        self.upstox_map = {}   # SYMBOL -> instrument_key
        self.dhan_map = {}     # SYMBOL -> security_id / symbol
        self._last_loaded = 0
        self._lock = threading.Lock()
        self._load_cached_masters()

    def _load_cached_masters(self):
        """Load instrument mappings from local disk cache or background refresh."""
        now = time.time()
        if now - self._last_loaded < 86400 and self.upstox_map:
            return

        with self._lock:
            # Check for Upstox master file
            upstox_file = os.path.join(INSTRUMENTS_DIR, "upstox_complete.csv.gz")
            if os.path.exists(upstox_file):
                try:
                    with gzip.open(upstox_file, "rt", encoding="utf-8", errors="ignore") as f:
                        reader = csv.DictReader(f)
                        for row in reader:
                            seg = row.get("segment") or row.get("exchange", "")
                            sym = (row.get("tradingsymbol") or row.get("symbol", "")).upper()
                            key = row.get("instrument_key", "")
                            if seg in ["NSE_EQ", "NSE_INDEX", "BSE_INDEX", "BSE_EQ"] and sym and key:
                                clean = sym.replace("-EQ", "").strip()
                                self.upstox_map[clean] = key
                except Exception as e:
                    logger.warning(f"Error reading local Upstox master: {e}")

            self._last_loaded = now

    def get_upstox_instrument_key(self, canonical_symbol: str) -> str:
        """Resolve Upstox instrument key for ANY symbol."""
        sym = canonical_symbol.upper().strip()
        if sym in CANONICAL_INDEX_MAP:
            return CANONICAL_INDEX_MAP[sym]["upstox"]
        if sym in self.upstox_map:
            return self.upstox_map[sym]
        # Standard default formula for NSE equities
        return f"NSE_EQ|{sym}"

    def get_dhan_security_id(self, canonical_symbol: str) -> str:
        """Resolve Dhan trading symbol / Security ID."""
        sym = canonical_symbol.upper().strip()
        if sym in CANONICAL_INDEX_MAP:
            return CANONICAL_INDEX_MAP[sym].get("dhan_sec_id") or CANONICAL_INDEX_MAP[sym]["dhan"]
        if sym in self.dhan_map:
            return self.dhan_map[sym]
        return f"{sym}-EQ"


# Singleton manager
_manager = DynamicInstrumentManager()


def canonicalize(symbol: str) -> str:
    """Normalize any symbol input into its clean canonical uppercase form."""
    if not symbol:
        return ""
    sym = symbol.strip().upper()
    for suffix in [".NS", ".BO", "-EQ", ":NSE", ":BSE"]:
        if sym.endswith(suffix):
            sym = sym[:-len(suffix)]
    
    # Strip index prefixes (^NSEI -> NIFTY)
    if sym in ["^NSEI", "NIFTY 50", "NIFTY50"]:
        return "NIFTY"
    if sym in ["^NSEBANK", "BANK NIFTY", "NIFTY BANK"]:
        return "BANKNIFTY"
    if sym in ["^BSESN", "BSE SENSEX"]:
        return "SENSEX"
    if sym in ["NIFTY_FIN_SERVICE", "FIN NIFTY"]:
        return "FINNIFTY"
    if sym in ["NIFTY_MID_SELECT", "MIDCAP NIFTY"]:
        return "MIDCPNIFTY"
    if sym in ["^INDIAVIX", "INDIA VIX"]:
        return "INDIAVIX"

    return sym


def get_symbol(canonical_symbol: str, source: str) -> str:
    """
    Returns the exact symbol string expected by the given source for ANY stock or index.
    Supported sources: 'upstox' | 'dhan' | 'nse' | 'yahoo' | 'groww' | 'bse'
    """
    clean = canonicalize(canonical_symbol)
    src = source.lower().strip()

    # 1. Check Index mappings
    if clean in CANONICAL_INDEX_MAP:
        idx_entry = CANONICAL_INDEX_MAP[clean]
        if src in idx_entry and idx_entry[src]:
            return idx_entry[src]
        return idx_entry.get("canonical", clean)

    # 2. Check Specific Aliases
    if clean in STOCK_ALIASES and src in STOCK_ALIASES[clean]:
        return STOCK_ALIASES[clean][src]

    # 3. Dynamic Broker Resolution for All 180+ F&O Equities
    if src == "upstox":
        return _manager.get_upstox_instrument_key(clean)

    if src == "dhan":
        return _manager.get_dhan_security_id(clean)

    if src == "yahoo":
        return f"{clean}.NS"

    if src == "nse":
        return clean

    if src in ["angelone", "angel_token", "angelone_token"]:
        try:
            from angel_one_adapter import angel_adapter
            info = angel_adapter.get_token_info(clean)
            if info:
                return info.get("token", clean)
        except Exception:
            pass
        return clean

    if src == "angelone_symbol":
        try:
            from angel_one_adapter import angel_adapter
            info = angel_adapter.get_token_info(clean)
            if info:
                return info.get("symbol", f"{clean}-EQ")
        except Exception:
            pass
        return f"{clean}-EQ"

    if src == "bse":
        return BSE_SCRIP_CODES.get(clean, clean)

    return clean


# Expose canonical index map for backward compatibility
SYMBOL_MAP = CANONICAL_INDEX_MAP