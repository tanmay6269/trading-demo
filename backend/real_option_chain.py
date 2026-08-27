import os
from datetime import datetime

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
    s = symbol.strip().upper().replace('.NS', '').replace('.BO', '')
    return UNDERLYING_MAP.get(s, s)

def normalize_option_chain(raw_response, exchange, underlying, expiry):
    if not raw_response:
        raise RuntimeError("Empty Groww option-chain response")

    payload = raw_response.get("payload")
    if not payload:
        raise RuntimeError(f"Groww returned no payload: {raw_response}")

    underlying_ltp = payload.get("underlying_ltp")
    if underlying_ltp is None:
        raise RuntimeError("Groww option-chain did not return underlying_ltp")

    strikes = payload.get("strikes", {})
    expiries = payload.get("expiries") or payload.get("expiry_dates") or []
    selected_expiry = payload.get("selected_expiry") or expiry
    lot_size = payload.get("lot_size", 25)

    rows = []
    for strike_string, strike_data in strikes.items():
        strike = float(strike_string)
        ce_raw = strike_data.get("CE")
        pe_raw = strike_data.get("PE")

        ce = None
        pe = None

        if ce_raw:
            greeks = ce_raw.get("greeks") or {}
            ce = {
                "symbol": ce_raw.get("trading_symbol"),
                "ltp": ce_raw.get("ltp"),
                "oi": ce_raw.get("open_interest"),
                "volume": ce_raw.get("volume"),
                "iv": greeks.get("iv"),
                "delta": greeks.get("delta"),
                "gamma": greeks.get("gamma"),
                "theta": greeks.get("theta"),
                "vega": greeks.get("vega"),
                "rho": greeks.get("rho"),
                "bid_price": ce_raw.get("bid_price"),
                "ask_price": ce_raw.get("offer_price") or ce_raw.get("ask_price"),
                "bid_quantity": ce_raw.get("bid_quantity"),
                "ask_quantity": ce_raw.get("offer_quantity") or ce_raw.get("ask_quantity")
            }

        if pe_raw:
            greeks = pe_raw.get("greeks") or {}
            pe = {
                "symbol": pe_raw.get("trading_symbol"),
                "ltp": pe_raw.get("ltp"),
                "oi": pe_raw.get("open_interest"),
                "volume": pe_raw.get("volume"),
                "iv": greeks.get("iv"),
                "delta": greeks.get("delta"),
                "gamma": greeks.get("gamma"),
                "theta": greeks.get("theta"),
                "vega": greeks.get("vega"),
                "rho": greeks.get("rho"),
                "bid_price": pe_raw.get("bid_price"),
                "ask_price": pe_raw.get("offer_price") or pe_raw.get("ask_price"),
                "bid_quantity": pe_raw.get("bid_quantity"),
                "ask_quantity": pe_raw.get("offer_quantity") or pe_raw.get("ask_quantity")
            }

        rows.append({
            "strike": strike,
            "ce": ce,
            "pe": pe
        })

    rows.sort(key=lambda x: x["strike"])

    # Find ATM from REAL underlying LTP
    atm_row = None
    if rows:
        atm_row = min(rows, key=lambda x: abs(x["strike"] - float(underlying_ltp)))
    atm_strike = atm_row["strike"] if atm_row else None

    for row in rows:
        row["is_atm"] = (row["strike"] == atm_strike)
        if row["ce"]:
            row["ce"]["is_itm"] = (float(underlying_ltp) > row["strike"])
        if row["pe"]:
            row["pe"]["is_itm"] = (float(underlying_ltp) < row["strike"])

    total_ce_oi = sum((row["ce"]["oi"] or 0) for row in rows if row["ce"])
    total_pe_oi = sum((row["pe"]["oi"] or 0) for row in rows if row["pe"])
    pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else None

    # Calculate Max Pain from actual OI across strikes
    min_pain = float('inf')
    max_pain_strike = None
    for candidate in rows:
        c_k = candidate["strike"]
        total_p = 0.0
        for r in rows:
            k = r["strike"]
            c_oi = (r["ce"]["oi"] if r["ce"] else 0) or 0
            p_oi = (r["pe"]["oi"] if r["pe"] else 0) or 0
            if c_k > k:
                total_p += (c_k - k) * c_oi
            if c_k < k:
                total_p += (k - c_k) * p_oi
        if total_p < min_pain:
            min_pain = total_p
            max_pain_strike = c_k

    return {
        "status": "success",
        "data_source": "GROWW_TRADE_API",
        "exchange": exchange,
        "symbol": underlying,
        "spot_price": underlying_ltp,
        "lot_size": lot_size,
        "expiries": expiries,
        "selected_expiry": selected_expiry,
        "pcr": pcr,
        "max_pain": max_pain_strike,
        "chain": rows,
        "received_at": datetime.utcnow().isoformat() + "Z"
    }

def get_live_groww_option_chain(symbol, exchange='NSE', expiry=None):
    from groww_market_data import GrowwMarketData
    clean_u = normalize_underlying(symbol)
    ex = exchange.strip().upper()

    market = GrowwMarketData()
    raw = market.get_option_chain(
        exchange=ex,
        underlying=clean_u,
        expiry_date=expiry
    )
    return normalize_option_chain(raw, ex, clean_u, expiry)
