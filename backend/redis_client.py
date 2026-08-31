import os
import json
import time
import threading

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

class RedisManager:
    """
    Enterprise-grade Redis Client with automatic in-memory fallback.
    Caches Option Chains with 1-2s TTL for ultra-low latency & fresh ticks.
    """
    def __init__(self):
        self.redis_url = os.getenv('REDIS_URL')
        self.client = None
        self._memory_cache = {}
        self._lock = threading.Lock()
        
        if REDIS_AVAILABLE and self.redis_url:
            try:
                self.client = redis.from_url(self.redis_url, decode_responses=True, socket_timeout=2)
                self.client.ping()
                print("Connected to Redis server successfully!")
            except Exception as e:
                print(f"Redis connection failed ({e}), falling back to thread-safe memory cache.")
                self.client = None
        else:
            print("Running with in-memory cache layer (Set REDIS_URL to enable external Redis cluster).")

    def get(self, key):
        if self.client:
            try:
                val = self.client.get(key)
                if val:
                    return json.loads(val)
            except Exception:
                pass
        
        with self._lock:
            if key in self._memory_cache:
                data, expire_at = self._memory_cache[key]
                if time.time() < expire_at:
                    return data
                else:
                    del self._memory_cache[key]
        return None

    def set(self, key, value, ttl_seconds=2):
        if self.client:
            try:
                self.client.setex(key, ttl_seconds, json.dumps(value))
                return True
            except Exception:
                pass
        
        with self._lock:
            self._memory_cache[key] = (value, time.time() + ttl_seconds)
        return True

    def get_option_chain(self, exchange, underlying, expiry):
        key = f"option_chain:{exchange.upper()}:{underlying.upper()}:{expiry or 'default'}"
        return self.get(key)

    def set_option_chain(self, exchange, underlying, expiry, data, ttl_seconds=2):
        key = f"option_chain:{exchange.upper()}:{underlying.upper()}:{expiry or 'default'}"
        return self.set(key, data, ttl_seconds)

    def get_quote(self, exchange, segment, symbol):
        key = f"quote:{exchange.upper()}:{segment.upper()}:{symbol.upper()}"
        return self.get(key)

    def set_quote(self, exchange, segment, symbol, data, ttl_seconds=2):
        key = f"quote:{exchange.upper()}:{segment.upper()}:{symbol.upper()}"
        return self.set(key, data, ttl_seconds)

    def get_indices(self):
        return self.get("indices:header")

    def set_indices(self, data, ttl_seconds=2):
        return self.set("indices:header", data, ttl_seconds)

    def get_news_feed(self, category=None, limit=30, offset=0):
        cat = (category or 'ALL').upper()
        key = f"news:feed:{cat}:{limit}:{offset}"
        return self.get(key)

    def set_news_feed(self, category, limit, offset, data, ttl_seconds=30):
        cat = (category or 'ALL').upper()
        key = f"news:feed:{cat}:{limit}:{offset}"
        return self.set(key, data, ttl_seconds)

    def get_stock_news(self, symbol):
        key = f"news:stock:{symbol.upper()}"
        return self.get(key)

    def set_stock_news(self, symbol, data, ttl_seconds=60):
        key = f"news:stock:{symbol.upper()}"
        return self.set(key, data, ttl_seconds)

# Singleton global instance
redis_manager = RedisManager()
