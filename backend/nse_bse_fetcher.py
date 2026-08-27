import os
import requests
import json
import time
import math
from datetime import datetime

GROWW_API_BASE = os.getenv("GROWW_API_BASE", "https://api.groww.in")
GROWW_TOKEN = os.getenv("GROWW_API_TOKEN", "")

# 1. Symbol Normalization Mapping (Frontend -> Groww F&O Underlying)
UNDERLYING_MAP = {
    "NIFTY 50": "NIFTY",
    "NIFTY": "NIFTY",
    "^NSEI": "NIFTY",
    "BANK NIFTY": "BANKNIFTY",
    "BANKNIFTY": "BANKNIFTY",
    "^NSEBANK": "BANKNIFTY",
    "FIN NIFTY": "FINNIFTY",
    "FINNIFTY": "FINNIFTY",
    "MIDCAP NIFTY": "MIDCPNIFTY",
    "MIDCPNIFTY": "MIDCPNIFTY",
    "SENSEX": "SENSEX",
    "BSE SENSEX": "SENSEX",
    "^BSESN": "SENSEX",
    "BANKEX": "BANKEX",
}

def normalize_underlying(symbol):
    """Normalize user/display symbol to official Groww F&O underlying"""
    s = symbol.strip().upper().replace('.NS', '').replace('.BO', '')
    return UNDERLYING_MAP.get(s, s)

def groww_headers():
    headers = {
        "Accept": "application/json",
        "X-API-VERSION": "1.0"
    }
    if GROWW_TOKEN:
        headers["Authorization"] = f"Bearer {GROWW_TOKEN}"
    return headers

def convert_expiry_to_iso(expiry_str):
    """Convert human DD-MMM-YYYY or DD-MM-YYYY to standard ISO YYYY-MM-DD for Groww API"""
    if not expiry_str:
        return None
    expiry_str = expiry_str.strip()
    if re_match := re_iso_match(expiry_str):
        return expiry_str
    
    # Try parsing DD-MMM-YYYY (e.g. 03-SEP-2026)
    for fmt in ('%d-%b-%Y', '%d-%B-%Y', '%d-%m-%Y', '%Y-%m-%d'):
        try:
            dt = datetime.strptime(expiry_str, fmt)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            pass
    return expiry_str

def re_iso_match(s):
    return len(s) == 10 and s[4] == '-' and s[7] == '-'

def calculate_max_pain(chain_rows):
    """
    Calculates Max Pain mathematically from actual Open Interest (CE & PE OI) across all returned strikes.
    Payout at candidate strike = Sum[ max(candidate - K, 0) * CE_OI + max(K - candidate, 0) * PE_OI ]
    Max Pain is the strike that minimizes total financial payout.
    """
    if not chain_rows:
        return None
    
    valid_rows = [r for r in chain_rows if r.get('strike') is not None]
    if not valid_rows:
        return None

    min_pain = float('inf')
    max_pain_strike = None

    for candidate in valid_rows:
        cand_strike = candidate['strike']
        total_pain = 0.0

        for r in valid_rows:
            k = r['strike']
            ce_oi = (r.get('ce') or {}).get('oi') or 0
            pe_oi = (r.get('pe') or {}).get('oi') or 0

            # Call buyers in the money when candidate > k
            if cand_strike > k:
                total_pain += (cand_strike - k) * ce_oi
            # Put buyers in the money when candidate < k
            if cand_strike < k:
                total_pain += (k - cand_strike) * pe_oi

        if total_pain < min_pain:
            min_pain = total_pain
            max_pain_strike = cand_strike

    return max_pain_strike

def fetch_groww_option_chain_api(exchange, underlying, expiry_date=None):
    """
    Call Groww Official Option Chain API:
    GET /v1/option-chain/exchange/{exchange}/underlying/{underlying}?expiry_date={expiry_date}
    """
    clean_underlying = normalize_underlying(underlying)
    ex = exchange.strip().upper()
    
    url = f"{GROWW_API_BASE}/v1/option-chain/exchange/{ex}/underlying/{clean_underlying}"
    params = {}
    if expiry_date:
        params["expiry_date"] = convert_expiry_to_iso(expiry_date)

    try:
        r = requests.get(url, params=params, headers=groww_headers(), timeout=5)
        if r.status_code == 200:
            res_json = r.json()
            if res_json.get("status") == "SUCCESS" and "payload" in res_json:
                return parse_groww_option_chain_payload(res_json["payload"], clean_underlying, ex)
    except Exception as e:
        print(f"Groww Option Chain API call error ({url}): {e}")
    
    return None

def parse_groww_option_chain_payload(payload, underlying, exchange):
    """
    Parses exact contract metadata, real LTP, real OI, real Volume, and real Greeks from Groww API response.
    Zero synthetic or fabricated data.
    """
    strikes_data = payload.get("strikes", {})
    if not strikes_data and isinstance(payload.get("data"), dict):
        strikes_data = payload.get("data")

    spot_price = payload.get("underlying_ltp") or payload.get("spot_price") or payload.get("underlying_value")
    if spot_price is not None:
        spot_price = float(spot_price)

    expiries = payload.get("expiries") or payload.get("expiry_dates") or []
    selected_expiry = payload.get("selected_expiry") or (expiries[0] if expiries else None)
    lot_size = payload.get("lot_size")
    data_timestamp = payload.get("last_trade_time") or payload.get("timestamp") or datetime.utcnow().isoformat()

    chain_rows = []
    total_ce_oi = 0
    total_pe_oi = 0

    for strike_key, contract_pair in strikes_data.items():
        try:
            strike = float(strike_key)
        except (ValueError, TypeError):
            continue

        ce = contract_pair.get("CE") or {}
        pe = contract_pair.get("PE") or {}

        # CE Data Mapping
        ce_symbol = ce.get("trading_symbol") or ce.get("tradingSymbol") or None
        ce_ltp = ce.get("ltp") or ce.get("last_price") or ce.get("lastPrice")
        ce_ltp = float(ce_ltp) if ce_ltp is not None else None
        ce_oi = ce.get("open_interest") or ce.get("openInterest") or ce.get("oi")
        ce_oi = int(ce_oi) if ce_oi is not None else 0
        ce_vol = ce.get("volume") or ce.get("totalTradedVolume")
        ce_vol = int(ce_vol) if ce_vol is not None else 0
        ce_chg = ce.get("day_change") or ce.get("change")
        ce_chg = float(ce_chg) if ce_chg is not None else None
        ce_chg_pct = ce.get("day_change_perc") or ce.get("pChange")
        ce_chg_pct = float(ce_chg_pct) if ce_chg_pct is not None else None

        ce_greeks = ce.get("greeks") or {}
        ce_iv = ce_greeks.get("iv") or ce.get("impliedVolatility") or ce.get("iv")
        ce_iv = float(ce_iv) if ce_iv is not None else None

        ce_bid = ce.get("bid_price") or ce.get("buyPrice")
        ce_bid = float(ce_bid) if ce_bid is not None else None
        ce_bid_qty = ce.get("bid_quantity") or ce.get("buyQty")
        ce_bid_qty = int(ce_bid_qty) if ce_bid_qty is not None else None
        ce_ask = ce.get("offer_price") or ce.get("ask_price") or ce.get("sellPrice")
        ce_ask = float(ce_ask) if ce_ask is not None else None
        ce_ask_qty = ce.get("offer_quantity") or ce.get("ask_quantity") or ce.get("sellQty")
        ce_ask_qty = int(ce_ask_qty) if ce_ask_qty is not None else None

        # PE Data Mapping
        pe_symbol = pe.get("trading_symbol") or pe.get("tradingSymbol") or None
        pe_ltp = pe.get("ltp") or pe.get("last_price") or pe.get("lastPrice")
        pe_ltp = float(pe_ltp) if pe_ltp is not None else None
        pe_oi = pe.get("open_interest") or pe.get("openInterest") or pe.get("oi")
        pe_oi = int(pe_oi) if pe_oi is not None else 0
        pe_vol = pe.get("volume") or pe.get("totalTradedVolume")
        pe_vol = int(pe_vol) if pe_vol is not None else 0
        pe_chg = pe.get("day_change") or pe.get("change")
        pe_chg = float(pe_chg) if pe_chg is not None else None
        pe_chg_pct = pe.get("day_change_perc") or pe.get("pChange")
        pe_chg_pct = float(pe_chg_pct) if pe_chg_pct is not None else None

        pe_greeks = pe.get("greeks") or {}
        pe_iv = pe_greeks.get("iv") or pe.get("impliedVolatility") or pe.get("iv")
        pe_iv = float(pe_iv) if pe_iv is not None else None

        pe_bid = pe.get("bid_price") or pe.get("buyPrice")
        pe_bid = float(pe_bid) if pe_bid is not None else None
        pe_bid_qty = pe.get("bid_quantity") or pe.get("buyQty")
        pe_bid_qty = int(pe_bid_qty) if pe_bid_qty is not None else None
        pe_ask = pe.get("offer_price") or pe.get("ask_price") or pe.get("sellPrice")
        pe_ask = float(pe_ask) if pe_ask is not None else None
        pe_ask_qty = pe.get("offer_quantity") or pe.get("ask_quantity") or pe.get("sellQty")
        pe_ask_qty = int(pe_ask_qty) if pe_ask_qty is not None else None

        total_ce_oi += ce_oi
        total_pe_oi += pe_oi

        is_atm = False
        if spot_price is not None:
            is_atm = abs(strike - spot_price) < 25.0

        chain_rows.append({
            "strike": strike,
            "is_atm": is_atm,
            "ce": {
                "symbol": ce_symbol,
                "ltp": ce_ltp,
                "change": ce_chg,
                "change_percent": ce_chg_pct,
                "oi": ce_oi,
                "volume": ce_vol,
                "iv": ce_iv,
                "bid_price": ce_bid,
                "bid_qty": ce_bid_qty,
                "ask_price": ce_ask,
                "ask_qty": ce_ask_qty,
                "delta": ce_greeks.get("delta"),
                "gamma": ce_greeks.get("gamma"),
                "theta": ce_greeks.get("theta"),
                "vega": ce_greeks.get("vega"),
                "rho": ce_greeks.get("rho"),
                "is_itm": (spot_price > strike) if spot_price is not None else False
            },
            "pe": {
                "symbol": pe_symbol,
                "ltp": pe_ltp,
                "change": pe_chg,
                "change_percent": pe_chg_pct,
                "oi": pe_oi,
                "volume": pe_vol,
                "iv": pe_iv,
                "bid_price": pe_bid,
                "bid_qty": pe_bid_qty,
                "ask_price": pe_ask,
                "ask_qty": pe_ask_qty,
                "delta": pe_greeks.get("delta"),
                "gamma": pe_greeks.get("gamma"),
                "theta": pe_greeks.get("theta"),
                "vega": pe_greeks.get("vega"),
                "rho": pe_greeks.get("rho"),
                "is_itm": (spot_price < strike) if spot_price is not None else False
            }
        })

    chain_rows.sort(key=lambda x: x["strike"])
    pcr = round(total_pe_oi / max(total_ce_oi, 1), 2) if total_ce_oi > 0 else None
    max_pain = calculate_max_pain(chain_rows)

    return {
        "status": "success",
        "data_source": "GROWW_API",
        "data_timestamp": data_timestamp,
        "symbol": underlying,
        "exchange": exchange,
        "spot_price": spot_price,
        "lot_size": lot_size,
        "expiries": expiries,
        "selected_expiry": selected_expiry,
        "pcr": pcr,
        "max_pain": max_pain,
        "chain": chain_rows
    }

def get_real_option_chain(symbol, exchange='NSE', expiry=None):
    """
    Main Option Chain Service:
    Returns the real Option Chain payload strictly from the authorized API.
    If unavailable, returns None (caller raises HTTP 503).
    """
    clean_underlying = normalize_underlying(symbol)
    return fetch_groww_option_chain_api(exchange, clean_underlying, expiry)
