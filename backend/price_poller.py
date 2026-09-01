"""
BullX Price Poller
==================
The ONLY piece of code allowed to call Upstox / Dhan / NSE / Groww /
Yahoo directly.

* Single background thread (started once at boot) — or a standalone
  process (poll_loop) when deployed with multiple gunicorn workers.
* Loops every 1-2 seconds, fetches fresh quotes, computes % change
  with the CORRECT formula, and writes ONE clean object per symbol
  into Redis via redis_cache.py.
* LTP and prev_close ALWAYS come from the SAME source in a single
  result (never mixed across APIs).
* A leader-lock keeps exactly ONE poller alive even if the Flask app
  is started by several gunicorn workers.
"""

import os
import time
import logging
import threading
from concurrent.futures import ThreadPoolExecutor

from symbol_mapper import get_symbol, canonicalize
import redis_cache as cache

logger = logging.getLogger("price_poller")
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s [POLLER] %(levelname)s: %(message)s"))
    logger.addHandler(handler)

# Reuse ONE requests.Session per source (connection pooling = no
# "new connection every call" slowness). Imported from groww_data so
# we share the same pool the app already uses.
from groww_data import HTTP_SESSION, fetch_groww_direct_quote, fetch_direct_quote

UPSTOX_TOKEN = os.getenv("UPSTOX_ACCESS_TOKEN", "")
UPSTOX_BASE = "https://api.upstox.com/v2"

POLL_INTERVAL_SECONDS = float(os.getenv("PRICE_POLL_INTERVAL", "1.8"))
MAX_WORKERS = int(os.getenv("PRICE_POLL_WORKERS", "20"))

# Symbols always kept fresh in Redis by the poller.
# (Catalog of supported stocks is loaded from groww_data.INDIAN_STOCKS.)
CORE_SYMBOLS = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "BHARTIARTL",
    "ITC", "TATAMOTORS", "LT", "MARUTI", "BAJFINANCE", "SUNPHARMA", "ASIANPAINT",
    "TITAN", "ZOMATO", "PAYTM", "SUZLON", "JIOFIN", "SWIGGY", "WIPRO", "HCLTECH",
    "ADANIENT", "ADANIPORTS", "POWERGRID", "NTPC", "COALINDIA", "ONGC", "TATASTEEL",
    "JSWSTEEL", "M&M", "EICHERMOT", "BAJAJ-AUTO", "CIPLA", "DIVISLAB", "DRREDDY",
    "VEDL", "TATAPOWER", "HAL", "BEL", "RVNL", "IRFC", "PFC", "REC", "CDSL", "BSE",
    "SBILIFE", "HDFCLIFE", "INDUSINDBK", "KOTAKBANK", "AXISBANK", "BAJAJFINSV",
    "ULTRACEMCO", "NESTLEIND", "HINDUNILVR", "ADANIGREEN", "ADANIPOWER", "TATACONSUM",
    "AXISBANK", "DRREDDYS", "HINDALCO", "GRASIM", "BRITANNIA", "HEROMOTOCO", "EICHERMOT",
]

# Dynamically-added symbols (when a user requests something not in the core
# list, the API route registers it so the poller keeps it warm).
_watchlist = set(CORE_SYMBOLS)
_watchlist_lock = threading.Lock()

# Leader lock: exactly one poller may run even with multiple workers.
_leader_lock = threading.Lock()
_local_leader = False


def _correct_pct(ltp, prev_close):
    """(current - previous close) / previous close * 100 — never Open."""
    try:
        ltp = float(ltp)
        prev_close = float(prev_close)
    except (TypeError, ValueError):
        return 0.0
    if not prev_close:
        return 0.0
    return round((ltp - prev_close) / prev_close * 100, 2)


# ------------------------------------------------------------------
# Same-source fetchers (each returns price + prev_close together)
# ------------------------------------------------------------------
def fetch_from_upstox(symbol):
    """Upstox v2 market-quote. Uses Upstox's own net_change so LTP and
    prev_close are both Upstox-consistent."""
    if not UPSTOX_TOKEN:
        return None
    try:
        instr = get_symbol(symbol, "upstox")
        resp = HTTP_SESSION.get(
            f"{UPSTOX_BASE}/market-quote/quotes",
            params={"instrument_key": instr},
            headers={"Authorization": f"Bearer {UPSTOX_TOKEN}", "Accept": "application/json"},
            timeout=2.5,
        )
        if resp.status_code != 200:
            return None
        body = resp.json()
        item = (body.get("data") or {}).get(instr)
        if not item:
            return None
        ltp = item.get("last_price")
        net_change = item.get("net_change") or item.get("change")
        if ltp is None:
            return None
        prev_close = float(ltp) - float(net_change) if net_change is not None else float(ltp)
        return {
            "price": round(float(ltp), 2),
            "prev_close": round(prev_close, 2),
            "change": round(float(ltp) - prev_close, 2),
            "change_percent": _correct_pct(ltp, prev_close),
            "source": "UPSTOX",
        }
    except Exception as e:
        logger.debug(f"upstox quote fail {symbol}: {e}")
        return None


def fetch_from_nse(symbol):
    """Free NSE fallback (nsepython). May be anti-bot blocked — returns None."""
    try:
        from nsepython import nse_eq
        nse_sym = get_symbol(symbol, "nse")
        data = nse_eq(nse_sym)
        pi = data.get("priceInfo") or {}
        ltp = pi.get("lastPrice")
        prev_close = pi.get("previousClose")
        if ltp is None or prev_close is None:
            return None
        return {
            "price": round(float(ltp), 2),
            "prev_close": round(float(prev_close), 2),
            "change": round(float(ltp) - float(prev_close), 2),
            "change_percent": _correct_pct(ltp, prev_close),
            "source": "NSE",
        }
    except Exception as e:
        logger.debug(f"nse quote fail {symbol}: {e}")
        return None


_bse_client = None

def get_bse_client():
    global _bse_client
    if _bse_client is None:
        try:
            from bsedata.bse import BSE
            _bse_client = BSE(update_codes=False)
        except Exception:
            _bse_client = False
    return _bse_client


def fetch_from_bse(symbol):
    """Direct BSE India quote fetcher via bsedata (for BSE stocks)."""
    try:
        bse = get_bse_client()
        if not bse:
            return None
        scrip_code = get_symbol(symbol, "bse")
        if not scrip_code or not str(scrip_code).isdigit():
            return None
        quote = bse.getQuote(str(scrip_code))
        if quote and quote.get("currentValue"):
            ltp = float(quote["currentValue"])
            prev_close = float(quote.get("previousClose") or ltp)
            chg = float(quote.get("change") or (ltp - prev_close))
            pct = float(quote.get("pChange") or _correct_pct(ltp, prev_close))
            return {
                "price": round(ltp, 2),
                "prev_close": round(prev_close, 2),
                "change": round(chg, 2),
                "change_percent": round(pct, 2),
                "source": "BSE",
            }
    except Exception as e:
        logger.debug(f"bse quote fail {symbol}: {e}")
    return None


def fetch_from_groww(symbol):
    """Groww Accord API — Groww returns ltp + dayChange + dayChangePerc together."""
    try:
        q = fetch_groww_direct_quote(symbol)
        if q and q.get("price"):
            ltp = float(q["price"])
            pct = float(q.get("change_percent") or 0.0)
            chg = float(q.get("change") or 0.0)
            prev_close = ltp - chg
            return {
                "price": round(ltp, 2),
                "prev_close": round(prev_close, 2),
                "change": round(chg, 2),
                "change_percent": round(pct, 2),
                "source": "GROWW",
            }
    except Exception as e:
        logger.debug(f"groww quote fail {symbol}: {e}")
    return None


def fetch_from_yahoo(symbol):
    """Yahoo Chart API — price + chartPreviousClose from the same result."""
    try:
        ysym = get_symbol(symbol, "yahoo")
        q = fetch_direct_quote(ysym)
        if q and q.get("price"):
            ltp = float(q["price"])
            prev_close = float(q.get("prev_close") or ltp)
            return {
                "price": round(ltp, 2),
                "prev_close": round(prev_close, 2),
                "change": round(ltp - prev_close, 2),
                "change_percent": _correct_pct(ltp, prev_close),
                "source": "YAHOO",
            }
    except Exception as e:
        logger.debug(f"yahoo quote fail {symbol}: {e}")
    return None


def fetch_one_symbol(symbol):
    """
    Priority: Upstox → NSE → BSE → Groww → Yahoo.
    First source that returns BOTH ltp & prev_close wins. Never mixed.
    """
    for fetcher in (fetch_from_upstox, fetch_from_nse, fetch_from_bse, fetch_from_groww, fetch_from_yahoo):
        data = fetcher(symbol)
        if data is not None and data.get("price"):
            return data
    return None


def register_symbol(symbol):
    """Add a symbol to the poller's warm set (called by API routes on a miss)."""
    s = canonicalize(symbol)
    if not s:
        return
    with _watchlist_lock:
        if s not in _watchlist:
            _watchlist.add(s)


# ------------------------------------------------------------------
# Leader election (multi-worker safe)
# ------------------------------------------------------------------
def _try_acquire_leader():
    """Use Redis SET NX with TTL as a mutex so only ONE gunicorn worker
    runs the poller. Falls back to a process-local flag when Redis is off."""
    global _local_leader
    client = cache.redis_manager.client if hasattr(cache.redis_manager, "client") else None
    if client is not None:
        try:
            # `set(key, val, nx=True, ex=...)` -> True only if key absent
            acquired = client.set("bullx:poller:leader", "1", nx=True, ex=30)
            return bool(acquired)
        except Exception as e:
            logger.warning(f"leader lock via redis failed: {e}")
            with _leader_lock:
                if not _local_leader:
                    _local_leader = True
                return _local_leader
    # No Redis -> one lock per process is all we can do
    with _leader_lock:
        if not _local_leader:
            _local_leader = True
        return _local_leader


def poll_loop():
    """Main loop — pair fetches with writes to Redis. Safe to run standalone."""
    logger.info("Poll loop started")
    while True:
        cycle_start = time.time()
        try:
            with _watchlist_lock:
                symbols = list(_watchlist)

            results = {}
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
                futures = {ex.submit(fetch_one_symbol, s): s for s in symbols}
                for fut in futures:
                    try:
                        sym = futures[fut]
                        data = fut.result()
                        if data:
                            results[sym] = data
                    except Exception:
                        continue

            for sym, data in results.items():
                cache.set_stock_price(sym, data)

            if results:
                logger.debug(f"poller updated {len(results)}/{len(symbols)} symbols")

            # Refresh index header ticker too
            try:
                from groww_data import get_index_data
                idx = get_index_data()
                if idx:
                    cache.set_indices(idx)
            except Exception as e:
                logger.debug(f"index poll fail: {e}")

        except Exception as e:
            logger.error(f"poll cycle error: {e}")

        elapsed = time.time() - cycle_start
        time.sleep(max(POLL_INTERVAL_SECONDS - elapsed, 0.2))


def start_background_poller():
    """
    Call ONCE when the Flask app boots. With multiple gunicorn workers
    each worker calls this — the leader lock keeps only one active.
    """
    if not _try_acquire_leader():
        logger.info("Not poller leader (another worker polls) — stand-by.")
        return False

    thread = threading.Thread(target=poll_loop, daemon=True)
    thread.start()
    logger.info("BullX price poller started (leader)")
    return True


def isolated_poller_entry():
    """For deployment as a separate process (recommended with -w >1)."""
    _local_leader = True
    poll_loop()