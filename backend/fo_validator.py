"""
fo_validator.py
---------------
Option Chain Cross-Check Validation Engine & Data Health Monitor for BullX.

1. Runs every 60s in background to sample-check primary source (Upstox/Dhan)
   against official NSE public option chain data.
2. Checks LTP tolerance (drift > 2.0%) and OI tolerance (drift > 5.0%).
3. Logs warnings and stores health statistics for /api/admin/data-health.
"""

import time
import asyncio
import logging
from typing import Dict, Any, List

logger = logging.getLogger("fo_validator")

# Global health metrics dictionary (per-symbol status)
DATA_HEALTH_REGISTRY: Dict[str, Dict[str, Any]] = {}


class FODataValidator:
    def __init__(self, ltp_tolerance_pct: float = 2.0, oi_tolerance_pct: float = 5.0):
        self.ltp_tol = ltp_tolerance_pct
        self.oi_tol = oi_tolerance_pct
        self.last_run = 0

    def record_health(self, symbol: str, source: str, status: str, ltp_drift: float = 0.0, oi_drift: float = 0.0, message: str = "OK"):
        DATA_HEALTH_REGISTRY[symbol.upper()] = {
            "symbol": symbol.upper(),
            "source": source,
            "status": status,  # "HEALTHY" | "DRIFT_WARNING" | "FALLBACK_ACTIVE" | "OFFLINE"
            "last_validated_at": time.time(),
            "last_validated_time": time.strftime("%Y-%m-%d %H:%M:%S IST", time.localtime()),
            "max_ltp_drift_pct": round(ltp_drift, 2),
            "max_oi_drift_pct": round(oi_drift, 2),
            "message": message
        }

    async def validate_sample_symbol(self, symbol: str, primary_chain: dict):
        """Cross-check primary option chain snapshot against NSE public data."""
        rows = (primary_chain or {}).get("chain") or []
        if not rows:
            return

        try:
            from nsepython import nse_optionchain_scrapper
            from symbol_mapper import get_symbol

            nse_sym = get_symbol(symbol, "nse")
            nse_data = await asyncio.to_thread(nse_optionchain_scrapper, nse_sym)
            if not nse_data or "records" not in nse_data:
                return

            nse_records = {r.get("strikePrice"): r for r in nse_data["records"].get("data", [])}

            max_ltp_drift = 0.0
            max_oi_drift = 0.0
            drift_details = []

            # Compare near ATM strikes
            for row in rows[:15]:
                strike = float(row.get("strike") or 0)
                if strike in nse_records:
                    nse_row = nse_records[strike]
                    p_ce = row.get("ce") or {}

                    # CE Comparison
                    n_ce = nse_row.get("CE") or {}

                    p_ltp = float(p_ce.get("ltp") or p_ce.get("last_price") or 0)
                    n_ltp = float(n_ce.get("lastPrice") or 0)
                    if p_ltp > 5 and n_ltp > 5:
                        drift = abs(p_ltp - n_ltp) / n_ltp * 100.0
                        if drift > max_ltp_drift:
                            max_ltp_drift = drift
                        if drift > self.ltp_tol:
                            drift_details.append(f"Strike {strike} CE LTP diff {drift:.1f}% (Primary: {p_ltp}, NSE: {n_ltp})")

                    p_oi = float(p_ce.get("oi") or p_ce.get("open_interest") or 0)
                    n_oi = float(n_ce.get("openInterest") or 0)
                    if p_oi > 500 and n_oi > 500:
                        drift = abs(p_oi - n_oi) / n_oi * 100.0
                        if drift > max_oi_drift:
                            max_oi_drift = drift
                        if drift > self.oi_tol:
                            drift_details.append(f"Strike {strike} CE OI diff {drift:.1f}% (Primary: {p_oi}, NSE: {n_oi})")

            src = (primary_chain or {}).get("data_source", "primary")
            if max_ltp_drift > self.ltp_tol or max_oi_drift > self.oi_tol:
                msg = f"Data Drift Detected: {', '.join(drift_details[:3])}"
                logger.warning(f"[DATA VALIDATION WARNING] {symbol}: {msg}")
                self.record_health(symbol, src, "DRIFT_WARNING", max_ltp_drift, max_oi_drift, msg)
            else:
                self.record_health(symbol, src, "HEALTHY", max_ltp_drift, max_oi_drift, "100% In Tolerance")

        except Exception as e:
            logger.debug(f"Validation comparison skipped for {symbol}: {e}")


# Singleton validator instance
validator = FODataValidator()


def get_data_health_report() -> Dict[str, Any]:
    """Return administrative health metrics across all monitored F&O symbols."""
    items = list(DATA_HEALTH_REGISTRY.values())
    total = len(items)
    healthy = sum(1 for i in items if i.get("status") == "HEALTHY")
    warnings = sum(1 for i in items if i.get("status") == "DRIFT_WARNING")
    
    return {
        "status": "ok",
        "timestamp": time.time(),
        "total_monitored": total,
        "healthy_count": healthy,
        "warning_count": warnings,
        "reliability_score_pct": round((healthy / total * 100), 1) if total > 0 else 100.0,
        "symbols": items
    }
