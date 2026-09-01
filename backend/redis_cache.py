"""
BullX Redis Cache Layer
=======================
The ONLY way Flask routes should touch market-data cache.
Routes NEVER call Upstox/Dhan/NSE/Yahoo directly — the background
poller (price_poller.py) writes here and routes read here.

Reuses the existing redis_manager (external Redis when REDIS_URL is
set, thread-safe fallback otherwise). TTLs are centralized here.
"""

import json
import time

from redis_client import redis_manager

# Fixed TTLs (seconds) — single place to tune freshness vs. rate limits
TTL_STOCK_PRICE = 2      # live ticks while market open
TTL_INDEX = 2
TTL_ALL_STOCKS = 5
TTL_OPTION_CHAIN = 2
TTL_STOCK_INFO = 15
TTL_NEWS = 30

KEY_STOCK_PRICE = "quote:stock:{SYM}"
KEY_INDICES = "indices:header"
KEY_ALL_STOCKS = "all_stocks:catalog"
KEY_STOCK_INFO = "stock_info:{SYM}"


# ------------------------------------------------------------------
# Stock quotes
# ------------------------------------------------------------------
def set_stock_price(symbol, data):
    """data: {price, prev_close, change, change_percent, source, ts}"""
    clean = (symbol or "").strip().upper().replace(".NS", "").replace(".BO", "")
    if not clean:
        return False
    payload = dict(data)
    payload["ts"] = payload.get("ts", time.time())
    return redis_manager.set(KEY_STOCK_PRICE.format(SYM=clean), payload, TTL_STOCK_PRICE)


def get_stock_price(symbol):
    clean = (symbol or "").strip().upper().replace(".NS", "").replace(".BO", "")
    if not clean:
        return None
    return redis_manager.get(KEY_STOCK_PRICE.format(SYM=clean))


def get_many_stock_prices(symbols):
    """Batch read — returns dict symbol -> quote for whatever is cached."""
    out = {}
    for s in symbols or []:
        q = get_stock_price(s)
        if q and q.get("price"):
            out[s.strip().upper()] = q
    return out


# ------------------------------------------------------------------
# Indices header ticker
# ------------------------------------------------------------------
def set_indices(indices):
    return redis_manager.set(KEY_INDICES, indices, TTL_INDEX)


def get_indices():
    return redis_manager.get(KEY_INDICES)


# ------------------------------------------------------------------
# All-stocks catalog (search / explore page)
# ------------------------------------------------------------------
def set_all_stocks_catalog(data):
    return redis_manager.set(KEY_ALL_STOCKS, data, TTL_ALL_STOCKS)


def get_all_stocks_catalog():
    return redis_manager.get(KEY_ALL_STOCKS)


# ------------------------------------------------------------------
# Option chain
# ------------------------------------------------------------------
def set_option_chain(exchange, under, expiry, data):
    return redis_manager.set_option_chain(exchange, under, expiry, data, TTL_OPTION_CHAIN)


def get_option_chain(exchange, under, expiry):
    return redis_manager.get_option_chain(exchange, under, expiry)


# ------------------------------------------------------------------
# Stock info (fundamentals)
# ------------------------------------------------------------------
def set_stock_info(symbol, data):
    clean = (symbol or "").strip().upper().replace(".NS", "").replace(".BO", "")
    if not clean:
        return False
    return redis_manager.set(KEY_STOCK_INFO.format(SYM=clean), data, TTL_STOCK_INFO)


def get_stock_info(symbol):
    clean = (symbol or "").strip().upper().replace(".NS", "").replace(".BO", "")
    if not clean:
        return None
    return redis_manager.get(KEY_STOCK_INFO.format(SYM=clean))