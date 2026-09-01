"""
BullX Symbol Mapper
===================
Single source of truth for how one stock/index is named across the
different market data APIs (Upstox / Dhan / NSE / Yahoo / Groww).

Fixes the "wrong stock's data shown under right name" bug caused by
name mismatches between APIs (Upstox=RELIANCE, Yahoo=RELIANCE.NS, ...).

Rules
-----
* canonical symbols (the ones the whole BullX app uses) are the plain
  equity symbols: RELIANCE, TCS, HDFCBANK, NIFTY, BANKNIFTY, ...
* every adapter maps a canonical symbol to the exact string that its
  API expects via get_symbol().
* deterministic defaults exist for equities (Yahoo=.NS / Upstox=NSE_EQ|SYM /
  Groww=SYM / Dhan=SYM-EQ) so you only override the special cases below.
"""

# ------------------------------------------------------------------
# Special-case overrides (indices + tickers Yahoo names differently).
# One entry per stock that needs a NON-default name in any API.
# ------------------------------------------------------------------
SYMBOL_MAP = {
    # ------- Indices -------
    "NIFTY": {
        "canonical": "NIFTY",
        "yahoo": "^NSEI",
        "upstox": "NSE_INDEX|Nifty 50",
        "dhan": "",           # handled via DHAN_SECURITY_IDS elsewhere
        "nse": "NIFTY",
        "groww": "NIFTY",
    },
    "BANKNIFTY": {
        "canonical": "BANKNIFTY",
        "yahoo": "^NSEBANK",
        "upstox": "NSE_INDEX|Nifty Bank",
        "nse": "BANKNIFTY",
    },
    "FINNIFTY": {
        "canonical": "FINNIFTY",
        "yahoo": "NIFTY_FIN_SERVICE.NS",
        "upstox": "NSE_INDEX|Nifty Fin Service",
        "nse": "FINNIFTY",
    },
    "MIDCPNIFTY": {
        "canonical": "MIDCPNIFTY",
        "yahoo": "NIFTY_MID_SELECT.NS",
        "upstox": "NSE_INDEX|NIFTY MID SELECT",
        "nse": "MIDCPNIFTY",
    },
    "SENSEX": {
        "canonical": "SENSEX",
        "yahoo": "^BSESN",
        "upstox": "BSE_INDEX|SENSEX",
        "nse": "SENSEX",
    },
    "INDIAVIX": {
        "canonical": "INDIAVIX",
        "yahoo": "^INDIAVIX",
    },
    "BANKEX": {
        "canonical": "BANKEX",
        "yahoo": "BSE-BANK.BO",
        "upstox": "BSE_INDEX|BANKEX",
    },
    "BSE MIDCAP": {
        "canonical": "BSE MIDCAP",
        "yahoo": "BSE-MIDCAP.BO",
    },
    "BSE SMALLCAP": {
        "canonical": "BSE SMALLCAP",
        "yahoo": "BSE-SMLCAP.BO",
    },

    # ------- Equities with Yahoo non-default names -------
    "TATAMOTORS": {
        "canonical": "TATAMOTORS",
        "yahoo": "TMPV.NS",
    },
}

# Aliases -> canonical (so "NIFTY 50", "Nifty", "^NSEI" all resolve to NIFTY)
ALIASES = {
    "NIFTY 50": "NIFTY", "NIFTY50": "NIFTY", "^NSEI": "NIFTY",
    "BANK NIFTY": "BANKNIFTY", "NIFTY BANK": "BANKNIFTY", "^NSEBANK": "BANKNIFTY",
    "FIN NIFTY": "FINNIFTY", "NIFTY FINANCIAL SERVICES": "FINNIFTY",
    "MIDCAP NIFTY": "MIDCPNIFTY", "MIDCPNIFTY": "MIDCPNIFTY",
    "BSE SENSEX": "SENSEX", "^BSESN": "SENSEX",
    "INDIA VIX": "INDIAVIX", "VIX": "INDIAVIX", "^INDIAVIX": "INDIAVIX",
    "BSE BANKEX": "BANKEX",
}


def canonicalize(symbol):
    """Map any user/API spelling to BullX's canonical symbol."""
    if not symbol:
        return symbol
    clean = symbol.strip().upper().replace(".NS", "").replace(".BO", "")
    clean = ALIASES.get(clean, clean)
    return clean


# BSE Scrip Codes Mapping for BSE Equities
BSE_SCRIP_CODES = {
    "RELIANCE": "500325",
    "TCS": "532540",
    "HDFCBANK": "500180",
    "INFY": "500209",
    "ICICIBANK": "532174",
    "SBIN": "500112",
    "BHARTIARTL": "532454",
    "ITC": "500875",
    "TATAMOTORS": "500570",
    "LT": "500510",
    "MARUTI": "532500",
    "BAJFINANCE": "500034",
    "SUNPHARMA": "524715",
    "ASIANPAINT": "500820",
    "TITAN": "500114",
    "ZOMATO": "543320",
    "PAYTM": "543396",
    "SUZLON": "532667",
    "JIOFIN": "543940",
    "SWIGGY": "544285",
    "WIPRO": "507685",
    "HCLTECH": "532281",
    "ADANIENT": "512599",
    "ADANIPORTS": "532921",
    "POWERGRID": "532898",
    "NTPC": "532555",
    "COALINDIA": "533278",
    "ONGC": "500312",
    "TATASTEEL": "500470",
    "JSWSTEEL": "500228",
    "M&M": "500520",
    "EICHERMOT": "505200",
    "BAJAJ-AUTO": "532977",
    "CIPLA": "500087",
    "DIVISLAB": "532488",
    "DRREDDY": "500124",
    "VEDL": "500295",
    "TATAPOWER": "500400",
    "HAL": "541154",
    "BEL": "500049",
    "RVNL": "542649",
    "IRFC": "543257",
    "PFC": "532810",
    "REC": "532955",
    "CDSL": "540575",
    "BSE": "540776",
}

def get_symbol(canonical_symbol, source):
    """
    Return the exact symbol string that `source` expects for a canonical
    BullX symbol.
    source: "upstox" | "dhan" | "nse" | "bse" | "yahoo" | "groww"
    """
    sym = canonical_symbol.strip().upper()
    entry = SYMBOL_MAP.get(sym)

    if entry and entry.get(source):
        return entry[source]

    # Deterministic defaults for equities
    if source == "yahoo":
        return f"{sym}.NS"
    if source == "upstox":
        return f"NSE_EQ|{sym}"
    if source == "dhan":
        return f"{sym}-EQ"
    if source == "bse":
        return BSE_SCRIP_CODES.get(sym, sym)
    if source in ("nse", "groww", "canonical"):
        return sym

    raise KeyError(f"'{canonical_symbol}' has no mapping for source '{source}'")


def upstox_instrument_key(symbol):
    """Convenience helper (indices vs equities)."""
    return get_symbol(symbol, "upstox")