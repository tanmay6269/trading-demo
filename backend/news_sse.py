"""
BullX Server-Sent Events (SSE) News Broadcaster
=================================================
Provides real-time news delivery to all connected BullX frontends.
No page refresh needed — new articles stream in automatically.

AsyncIO-native implementation for FastAPI (no threading locks needed).
"""

import json
import time
import asyncio
import logging

logger = logging.getLogger("news_sse")


class SSEBroadcaster:
    """
    Async SSE broadcaster compatible with FastAPI / asyncio event loop.

    Usage:
        broadcaster = SSEBroadcaster()

        # In a FastAPI route:
        @app.get('/api/news/stream')
        async def stream():
            return StreamingResponse(broadcaster.subscribe(), media_type='text/event-stream')

        # When new articles arrive (from background threads via news scheduler):
        broadcaster.broadcast(article_dict)
    """

    def __init__(self):
        # List of asyncio.Queue objects, one per connected client
        self._queues: list = []
        self._heartbeat_interval = 30  # seconds

    async def subscribe(self):
        """
        Async generator that yields SSE events for a single client.
        Use directly as a FastAPI StreamingResponse content generator.
        """
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._queues.append(q)
        client_num = len(self._queues)
        logger.info(f"SSE client #{client_num} connected (total: {len(self._queues)})")

        try:
            # Send initial connection confirmation event
            yield self._format_event("connected", json.dumps({
                "status": "connected",
                "timestamp": time.time(),
            }))

            while True:
                try:
                    # Wait for data with heartbeat timeout
                    data = await asyncio.wait_for(q.get(), timeout=self._heartbeat_interval)
                    yield data
                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield self._format_event("heartbeat", json.dumps({
                        "timestamp": time.time(),
                    }))

        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            try:
                self._queues.remove(q)
                logger.info(f"SSE client disconnected (remaining: {len(self._queues)})")
            except ValueError:
                pass

    def broadcast(self, article_dict):
        """
        Broadcast a new article to all connected SSE clients.
        Thread-safe: can be called from background threads (news scheduler).
        Uses put_nowait so it never blocks.
        """
        event_data = self._format_event("NEW_NEWS", json.dumps(article_dict, default=str))

        dead = []
        for q in list(self._queues):
            try:
                q.put_nowait(event_data)
            except asyncio.QueueFull:
                dead.append(q)
                logger.warning("SSE client queue full — dropping stale client")

        for q in dead:
            try:
                self._queues.remove(q)
            except ValueError:
                pass

        if self._queues:
            logger.debug(f"SSE broadcast to {len(self._queues)} clients: {article_dict.get('title', '')[:60]}")

    def get_client_count(self):
        """Return number of connected SSE clients."""
        return len(self._queues)

    def _format_event(self, event_type, data):
        """Format data as SSE event string."""
        lines = [f"event: {event_type}"]
        for line in data.split("\n"):
            lines.append(f"data: {line}")
        lines.append("")
        lines.append("")
        return "\n".join(lines)


# Singleton
_broadcaster = None


def get_broadcaster():
    global _broadcaster
    if _broadcaster is None:
        _broadcaster = SSEBroadcaster()
    return _broadcaster
