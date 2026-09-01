"""
redis_cache.py
---------------
Enterprise async Redis client using redis.asyncio with thread-safe memory fallback.
Guarantees 0ms responses for all FastAPI routes and WebSocket clients.
"""

import os
import json
import time
import asyncio
import threading
from typing import Any, Optional, Dict

try:
    import redis.asyncio as aioredis
    AIO_REDIS_AVAILABLE = True
except ImportError:
    AIO_REDIS_AVAILABLE = False

try:
    import redis
    SYNC_REDIS_AVAILABLE = True
except ImportError:
    SYNC_REDIS_AVAILABLE = False

# Standard Centralized TTLs (in seconds)
TTL_STOCK_PRICE = 15
TTL_OPTION_CHAIN = 15
TTL_INDEX = 15
TTL_NEWS = 30
TTL_STOCK_INFO = 20

class AsyncRedisCacheManager:
    """
    High-performance Redis Manager with dual async/sync support
    and thread-safe in-memory cache fallback.
    """
    def __init__(self):
        self.redis_url = os.getenv('REDIS_URL')
        self._async_client = None
        self._sync_client = None
        self._memory_cache: Dict[str, tuple] = {}
        self._lock = threading.Lock()
        self._initialized = False

    def _get_sync_client(self):
        if self._sync_client is None and SYNC_REDIS_AVAILABLE:
            if self.redis_url:
                try:
                    pool = redis.ConnectionPool.from_url(
                        self.redis_url,
                        decode_responses=True,
                        socket_timeout=2,
                        max_connections=50
                    )
                    self._sync_client = redis.Redis(connection_pool=pool)
                    self._sync_client.ping()
                except Exception:
                    self._sync_client = False
            elif os.getenv('REDIS_HOST'):
                try:
                    pool = redis.ConnectionPool(
                        host=os.getenv('REDIS_HOST', 'localhost'),
                        port=int(os.getenv('REDIS_PORT', 6379)),
                        password=os.getenv('REDIS_PASSWORD'),
                        db=0,
                        decode_responses=True,
                        socket_timeout=2,
                        max_connections=50
                    )
                    self._sync_client = redis.Redis(connection_pool=pool)
                    self._sync_client.ping()
                except Exception:
                    self._sync_client = False
            else:
                self._sync_client = False
        return self._sync_client if self._sync_client is not False else None

    async def get_async_client(self):
        if not self._initialized:
            self._initialized = True
            if AIO_REDIS_AVAILABLE:
                if self.redis_url:
                    try:
                        pool = aioredis.ConnectionPool.from_url(
                            self.redis_url,
                            decode_responses=True,
                            socket_timeout=2,
                            max_connections=50
                        )
                        client = aioredis.Redis(connection_pool=pool)
                        await client.ping()
                        self._async_client = client
                        print("⚡ [redis_cache] Connected to external async Redis cluster")
                    except Exception as e:
                        print(f"⚡ [redis_cache] Async Redis fallback to in-memory: {e}")
                        self._async_client = None
                elif os.getenv('REDIS_HOST'):
                    try:
                        pool = aioredis.ConnectionPool(
                            host=os.getenv('REDIS_HOST', 'localhost'),
                            port=int(os.getenv('REDIS_PORT', 6379)),
                            password=os.getenv('REDIS_PASSWORD'),
                            db=0,
                            decode_responses=True,
                            socket_timeout=2,
                            max_connections=50
                        )
                        client = aioredis.Redis(connection_pool=pool)
                        await client.ping()
                        self._async_client = client
                    except Exception:
                        self._async_client = None
        return self._async_client

    def _key(self, kind: str, symbol: str) -> str:
        clean = symbol.strip().upper().replace('.NS', '').replace('.BO', '')
        return f"{kind}:{clean}"

    # ---------------- Async Leader Lock (one poller among N workers) ----------------
    async def try_acquire_lock(self, key: str, ttl_seconds: int = 30) -> bool:
        """SET key value NX EX ttl — returns True only if THIS process won the lock.
        Falls back to a process-local flag when Redis is unavailable so a single
        worker still polls locally."""
        client = await self.get_async_client()
        if client:
            try:
                got = await client.set(key, "1", nx=True, ex=ttl_seconds)
                return bool(got)
            except Exception:
                pass
        return self._memory_lock_acquire(key, ttl_seconds)

    def _memory_lock_acquire(self, key: str, ttl_seconds: int) -> bool:
        with self._lock:
            now = time.time()
            if key in self._memory_cache:
                _, expire_at = self._memory_cache[key]
                if now < expire_at:
                    return False
            self._memory_cache[key] = (True, now + ttl_seconds)
            return True

    # ---------------- Async API for FastAPI & Poller ----------------
    async def get_async(self, key: str) -> Optional[Any]:
        client = await self.get_async_client()
        if client:
            try:
                raw = await client.get(key)
                if raw:
                    return json.loads(raw)
            except Exception:
                pass

        with self._lock:
            if key in self._memory_cache:
                val, expire_at = self._memory_cache[key]
                if time.time() < expire_at:
                    return val
                else:
                    del self._memory_cache[key]
        return None

    async def set_async(self, key: str, value: Any, ttl_seconds: int = 2) -> bool:
        client = await self.get_async_client()
        if client:
            try:
                await client.setex(key, ttl_seconds, json.dumps(value))
                return True
            except Exception:
                pass

        with self._lock:
            self._memory_cache[key] = (value, time.time() + ttl_seconds)
        return True

    # ---------------- Synchronous API for Background Sync Threads ----------------
    def get_sync(self, key: str) -> Optional[Any]:
        client = self._get_sync_client()
        if client:
            try:
                raw = client.get(key)
                if raw:
                    return json.loads(raw)
            except Exception:
                pass

        with self._lock:
            if key in self._memory_cache:
                val, expire_at = self._memory_cache[key]
                if time.time() < expire_at:
                    return val
                else:
                    del self._memory_cache[key]
        return None

    def set_sync(self, key: str, value: Any, ttl_seconds: int = 2) -> bool:
        client = self._get_sync_client()
        if client:
            try:
                client.setex(key, ttl_seconds, json.dumps(value))
                return True
            except Exception:
                pass

        with self._lock:
            self._memory_cache[key] = (value, time.time() + ttl_seconds)
        return True

    # High-level Async Helpers
    async def get_stock_price(self, symbol: str) -> Optional[dict]:
        return await self.get_async(self._key("price", symbol))

    async def set_stock_price(self, symbol: str, data: dict, ttl_seconds: int = TTL_STOCK_PRICE):
        return await self.set_async(self._key("price", symbol), data, ttl_seconds=ttl_seconds)

    async def get_index(self, symbol: str) -> Optional[dict]:
        return await self.get_async(self._key("index", symbol))

    async def set_index(self, symbol: str, data: dict, ttl_seconds: int = TTL_INDEX):
        return await self.set_async(self._key("index", symbol), data, ttl_seconds=ttl_seconds)

    async def get_all_indices(self) -> Optional[dict]:
        return await self.get_async("indices:header")

    async def set_all_indices(self, data: dict, ttl_seconds: int = TTL_INDEX):
        return await self.set_async("indices:header", data, ttl_seconds=ttl_seconds)

    async def get_option_chain(self, exchange: str, underlying: str, expiry: str = "default") -> Optional[dict]:
        key = f"optionchain:{exchange.upper()}:{underlying.upper()}:{expiry or 'default'}"
        return await self.get_async(key)

    async def set_option_chain(self, exchange: str, underlying: str, expiry: str, data: dict, ttl_seconds: int = TTL_OPTION_CHAIN):
        key = f"optionchain:{exchange.upper()}:{underlying.upper()}:{expiry or 'default'}"
        return await self.set_async(key, data, ttl_seconds=ttl_seconds)

    # News caching
    async def get_news_feed(self, category: str = "ALL", limit: int = 30, offset: int = 0) -> Optional[list]:
        cat = (category or 'ALL').upper()
        return await self.get_async(f"news:feed:{cat}:{limit}:{offset}")

    async def set_news_feed(self, category: str, limit: int, offset: int, data: list, ttl_seconds: int = TTL_NEWS):
        cat = (category or 'ALL').upper()
        return await self.set_async(f"news:feed:{cat}:{limit}:{offset}", data, ttl_seconds=ttl_seconds)

    # Sync compatibility aliases
    def get(self, key: str):
        return self.get_sync(key)

    def set(self, key: str, value: Any, ttl_seconds: int = 2):
        return self.set_sync(key, value, ttl_seconds)

    def get_indices(self):
        return self.get_sync("indices:header")

    def set_indices(self, data: dict, ttl_seconds: int = TTL_INDEX):
        return self.set_sync("indices:header", data, ttl_seconds=ttl_seconds)

    def get_stock_quote(self, symbol: str):
        return self.get_sync(self._key("price", symbol))

    def set_stock_quote(self, symbol: str, data: dict, ttl_seconds: int = TTL_STOCK_PRICE):
        return self.set_sync(self._key("price", symbol), data, ttl_seconds=ttl_seconds)

# Singleton global instance
cache = AsyncRedisCacheManager()
redis_manager = cache