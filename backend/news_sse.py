"""
BullX Server-Sent Events (SSE) News Broadcaster
=================================================
Provides real-time news delivery to all connected BullX frontends.
No page refresh needed — new articles stream in automatically.
"""

import json
import time
import queue
import logging
import threading

logger = logging.getLogger("news_sse")


class SSEBroadcaster:
    """
    Thread-safe SSE broadcaster.
    
    Usage:
        broadcaster = SSEBroadcaster()
        
        # In a Flask route:
        @app.route('/api/news/stream')
        def stream():
            return Response(broadcaster.subscribe(), mimetype='text/event-stream')
        
        # When new articles arrive:
        broadcaster.broadcast(article_dict)
    """

    def __init__(self):
        self._clients = []
        self._lock = threading.Lock()
        self._heartbeat_interval = 30  # seconds

    def subscribe(self):
        """
        Generator that yields SSE events for a single client.
        Call this in a Flask route returning text/event-stream.
        """
        client_queue = queue.Queue(maxsize=50)

        with self._lock:
            self._clients.append(client_queue)
            client_id = len(self._clients)
            logger.info(f"SSE client #{client_id} connected (total: {len(self._clients)})")

        try:
            # Send initial connection event
            yield self._format_event("connected", json.dumps({
                "status": "connected",
                "timestamp": time.time(),
            }))

            last_heartbeat = time.time()

            while True:
                try:
                    # Wait for new data with timeout for heartbeat
                    data = client_queue.get(timeout=self._heartbeat_interval)
                    yield data
                except queue.Empty:
                    # Send heartbeat to keep connection alive
                    yield self._format_event("heartbeat", json.dumps({
                        "timestamp": time.time(),
                    }))
                    last_heartbeat = time.time()

        except GeneratorExit:
            pass
        finally:
            with self._lock:
                try:
                    self._clients.remove(client_queue)
                    logger.info(f"SSE client disconnected (remaining: {len(self._clients)})")
                except ValueError:
                    pass

    def broadcast(self, article_dict):
        """
        Broadcast a new article to all connected clients.
        article_dict should be a JSON-serializable dict.
        """
        event_data = self._format_event("NEW_NEWS", json.dumps(article_dict, default=str))

        disconnected = []
        with self._lock:
            for client_queue in self._clients:
                try:
                    client_queue.put_nowait(event_data)
                except queue.Full:
                    disconnected.append(client_queue)
                    logger.warning("SSE client queue full — dropping client")

            # Clean up disconnected clients
            for q in disconnected:
                try:
                    self._clients.remove(q)
                except ValueError:
                    pass

        if self._clients:
            logger.debug(f"SSE broadcast to {len(self._clients)} clients: {article_dict.get('title', '')[:60]}")

    def get_client_count(self):
        """Return number of connected SSE clients."""
        with self._lock:
            return len(self._clients)

    def _format_event(self, event_type, data):
        """Format data as SSE event string."""
        lines = []
        lines.append(f"event: {event_type}")
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
