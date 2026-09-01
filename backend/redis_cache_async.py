"""
redis_cache_async.py
---------------------
Async version of redis_cache.py — for use inside FastAPI (async def routes
and the async WebSocket endpoints). Uses redis.asyncio so Redis calls never
block the event loop.

Includes automatic thread-safe in-memory fallback for local and zero-dependency deployments.
"""

import os
import json
import time
import threading
from typing import Optional, List, Dict, Any

try:
    import redis.asyncio as redis
    AIO_REDIS_AVAILABLE = True
except ImportError:
    AIO_REDIS_AVAILABLE = False

TTL_STOCK_PRICE = 2
TTL_OPTION_CHAIN = 2
TTL_INDEX = 5

class AsyncRedisLayer:
    def __init__(self):
        self.redis_url = os.getenv("REDIS_URL")
        self._pool = None
        self.r = None
        self._memory = {}
        self._lock = threading.Lock()
        self._init_done = False

    async def _init_redis(self):
        if not self._init_done:
            self._init_done = True
            if AIO_REDIS_AVAILABLE:
                if self.redis_url:
                    try:
                        self._pool = redis.ConnectionPool.from_url(
                            self.redis_url, decode_responses=True, socket_timeout=2
                        )
                        self.r = redis.Redis(connection_pool=self._pool)
                        await self.r.ping()
                    except Exception:
                        self.r = None
                elif os.getenv("REDIS_HOST"):
                    try:
                        self._pool = redis.ConnectionPool(
                            host=os.getenv("REDIS_HOST", "localhost"),
                            port=int(os.getenv("REDIS_PORT", 6379)),
                            password=os.getenv("REDIS_PASSWORD"),
                            db=0,
                            decode_responses=True,
                            socket_timeout=2
                        )
                        self.r = redis.Redis(connection_pool=self._pool)
                        await self.r.ping()
                    except Exception:
                        self.r = None

    def _key(self, kind: str, symbol: str) -> str:
        clean = symbol.strip().upper().replace(".NS", "").replace(".BO", "")
        return f"{kind}:{clean}"

    async def set_stock_price(self, symbol: str, data: dict):
        await self._init_redis()
        key = self._key("price", symbol)
        if self.r:
            try:
                await self.r.set(key, json.dumps(data), ex=TTL_STOCK_PRICE)
                return
            except Exception:
                pass
        with self._lock:
            self._memory[key] = (data, time.time() + TTL_STOCK_PRICE)

    async def get_stock_price(self, symbol: str) -> Optional[dict]:
        await self._init_redis()
        key = self._key("price", symbol)
        if self.r:
            try:
                raw = await self.r.get(key)
                if raw:
                    return json.loads(raw)
            except Exception:
                pass
        with self._lock:
            if key in self._memory:
                val, exp = self._memory[key]
                if time.time() < exp:
                    return val
                del self._memory[key]
        return None

    async def set_option_chain(self, symbol: str, data: dict):
        await self._init_redis()
        key = self._key("optionchain", symbol)
        if self.r:
            try:
                await self.r.set(key, json.dumps(data), ex=TTL_OPTION_CHAIN)
                return
            except Exception:
                pass
        with self._lock:
            self._memory[key] = (data, time.time() + TTL_OPTION_CHAIN)

    async def get_option_chain(self, symbol: str) -> Optional[dict]:
        await self._init_redis()
        key = self._key("optionchain", symbol)
        if self.r:
            try:
                raw = await self.r.get(key)
                if raw:
                    return json.loads(raw)
            except Exception:
                pass
        with self._lock:
            if key in self._memory:
                val, exp = self._memory[key]
                if time.time() < exp:
                    return val
                del self._memory[key]
        return None

    async def set_index(self, symbol: str, data: dict):
        await self._init_redis()
        key = self._key("index", symbol)
        if self.r:
            try:
                await self.r.set(key, json.dumps(data), ex=TTL_INDEX)
                return
            except Exception:
                pass
        with self._lock:
            self._memory[key] = (data, time.time() + TTL_INDEX)

    async def get_index(self, symbol: str) -> Optional[dict]:
        await self._init_redis()
        key = self._key("index", symbol)
        if self.r:
            try:
                raw = await self.r.get(key)
                if raw:
                    return json.loads(raw)
            except Exception:
                pass
        with self._lock:
            if key in self._memory:
                val, exp = self._memory[key]
                if time.time() < exp:
                    return val
                del self._memory[key]
        return None

    async def get_all_tracked_prices(self, symbols: List[str]) -> dict:
        """Used by the WebSocket loop to fetch several symbols in one go."""
        out = {}
        for symbol in symbols:
            data = await self.get_stock_price(symbol)
            if data:
                out[symbol] = data
        return out


# Global singleton instance
_async_cache = AsyncRedisLayer()

# Direct module-level functions
async def set_stock_price(symbol: str, data: dict):
    await _async_cache.set_stock_price(symbol, data)

async def get_stock_price(symbol: str) -> Optional[dict]:
    return await _async_cache.get_stock_price(symbol)

async def set_option_chain(symbol: str, data: dict):
    await _async_cache.set_option_chain(symbol, data)

async def get_option_chain(symbol: str) -> Optional[dict]:
    return await _async_cache.get_option_chain(symbol)

async def set_index(symbol: str, data: dict):
    await _async_cache.set_index(symbol, data)

async def get_index(symbol: str) -> Optional[dict]:
    return await _async_cache.get_index(symbol)

async def get_all_tracked_prices(symbols: List[str]) -> dict:
    return await _async_cache.get_all_tracked_prices(symbols)
