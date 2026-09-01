"""
fo_analytics.py
---------------
Option Chain Analytics & Chart Aggregations Engine for BullX.

Provides clean, frontend-ready JSON for:
1. OI Buildup Chart (/api/option-chain/{symbol}/oi-buildup)
2. Put-Call Ratio History (/api/option-chain/{symbol}/pcr-history)
3. IV Skew & Volatility Smile (/api/option-chain/{symbol}/iv-skew)
"""

import time
from typing import Dict, Any, List, Optional


def calculate_oi_buildup(option_chain_data: dict) -> Dict[str, Any]:
    """
    Computes CE/PE Open Interest distribution across all strikes,
    along with Total OI, Put-Call Ratio (PCR), and Max Pain Strike.
    """
    if not option_chain_data:
        return {"strikes": [], "total_ce_oi": 0, "total_pe_oi": 0, "pcr": 1.0, "max_pain": 0}

    raw_strikes = option_chain_data.get("chain") or option_chain_data.get("strikes", [])
    spot_price = float(option_chain_data.get("spot_price") or option_chain_data.get("underlyingValue") or 0.0)

    buildup_rows = []
    total_ce_oi = 0
    total_pe_oi = 0
    strike_pnl_map = {}

    for row in raw_strikes:
        strike = float(row.get("strike") or row.get("strike_price") or row.get("strikePrice") or 0.0)
        if strike <= 0:
            continue

        ce = row.get("ce") or row.get("call_options") or row.get("CE") or {}
        pe = row.get("pe") or row.get("put_options") or row.get("PE") or {}

        ce_oi = int(ce.get("open_interest") or ce.get("openInterest") or ce.get("oi") or 0)
        ce_oi_chg = int(ce.get("change_in_open_interest") or ce.get("changeinOpenInterest") or 0)
        ce_ltp = float(ce.get("ltp") or ce.get("last_price") or ce.get("lastPrice") or 0.0)

        pe_oi = int(pe.get("open_interest") or pe.get("openInterest") or pe.get("oi") or 0)
        pe_oi_chg = int(pe.get("change_in_open_interest") or pe.get("changeinOpenInterest") or 0)
        pe_ltp = float(pe.get("ltp") or pe.get("last_price") or pe.get("lastPrice") or 0.0)

        total_ce_oi += ce_oi
        total_pe_oi += pe_oi

        buildup_rows.append({
            "strike": strike,
            "ce_oi": ce_oi,
            "ce_oi_change": ce_oi_chg,
            "ce_ltp": ce_ltp,
            "pe_oi": pe_oi,
            "pe_oi_change": pe_oi_chg,
            "pe_ltp": pe_ltp,
            "is_atm": abs(strike - spot_price) < 50.0 if spot_price > 0 else False
        })

    # Sort strikes ascending
    buildup_rows.sort(key=lambda x: x["strike"])

    # Calculate Max Pain level
    all_strikes = [r["strike"] for r in buildup_rows]
    for expiry_strike in all_strikes:
        loss = 0.0
        for r in buildup_rows:
            # Loss for Call Sellers if market expires at expiry_strike
            if expiry_strike > r["strike"]:
                loss += (expiry_strike - r["strike"]) * r["ce_oi"]
            # Loss for Put Sellers if market expires at expiry_strike
            elif expiry_strike < r["strike"]:
                loss += (r["strike"] - expiry_strike) * r["pe_oi"]
        strike_pnl_map[expiry_strike] = loss

    max_pain_strike = min(strike_pnl_map, key=strike_pnl_map.get) if strike_pnl_map else (spot_price or 0.0)
    pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else 1.0

    return {
        "symbol": option_chain_data.get("symbol", ""),
        "spot_price": spot_price,
        "pcr": pcr,
        "max_pain": max_pain_strike,
        "total_ce_oi": total_ce_oi,
        "total_pe_oi": total_pe_oi,
        "strikes": buildup_rows,
        "timestamp": time.time()
    }


def calculate_iv_skew(option_chain_data: dict) -> Dict[str, Any]:
    """
    Computes Implied Volatility (IV) smile/skew across strikes for the given option chain.
    """
    if not option_chain_data:
        return {"strikes": [], "atm_iv": 0.0, "timestamp": time.time()}

    raw_strikes = option_chain_data.get("chain") or option_chain_data.get("strikes", [])
    spot_price = float(option_chain_data.get("spot_price") or option_chain_data.get("underlyingValue") or 0.0)

    skew_rows = []
    atm_iv = 0.0
    min_dist = 999999.0

    for row in raw_strikes:
        strike = float(row.get("strike") or row.get("strike_price") or row.get("strikePrice") or 0.0)
        if strike <= 0:
            continue

        ce = row.get("ce") or row.get("call_options") or row.get("CE") or {}
        pe = row.get("pe") or row.get("put_options") or row.get("PE") or {}

        ce_iv = float(ce.get("iv") or ce.get("implied_volatility") or ce.get("impliedVolatility") or 0.0)
        pe_iv = float(pe.get("iv") or pe.get("implied_volatility") or pe.get("impliedVolatility") or 0.0)

        dist = abs(strike - spot_price)
        if dist < min_dist:
            min_dist = dist
            atm_iv = ce_iv or pe_iv or 14.5

        if ce_iv > 0 or pe_iv > 0:
            skew_rows.append({
                "strike": strike,
                "ce_iv": round(ce_iv, 2),
                "pe_iv": round(pe_iv, 2),
                "composite_iv": round((ce_iv + pe_iv) / 2.0, 2) if (ce_iv and pe_iv) else (ce_iv or pe_iv)
            })

    skew_rows.sort(key=lambda x: x["strike"])

    return {
        "symbol": option_chain_data.get("symbol", ""),
        "spot_price": spot_price,
        "atm_iv": round(atm_iv, 2),
        "strikes": skew_rows,
        "timestamp": time.time()
    }
