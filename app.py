"""
Root app.py wrapper for Render/Heroku deployments.
Provides UniversalCallable supporting both WSGI ('gunicorn app:app') and ASGI ('uvicorn app:app').
"""

import sys
import os
import importlib.util

backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Load the FastAPI app from backend/app.py
spec = importlib.util.spec_from_file_location("backend_app_module", os.path.join(backend_path, "app.py"))
backend_app_mod = importlib.util.module_from_spec(spec)
sys.modules["backend_app_module"] = backend_app_mod
spec.loader.exec_module(backend_app_mod)

# Use the pure FastAPI ASGI application instance
asgi_app = getattr(backend_app_mod, "fastapi_app", backend_app_mod.app)


class UniversalCallable:
    """Universal dispatcher supporting both WSGI (gunicorn sync) and ASGI (uvicorn)."""
    def __init__(self, target_asgi_app):
        self.asgi_app = target_asgi_app
        try:
            from a2wsgi import ASGIMiddleware
            self.wsgi_app = ASGIMiddleware(target_asgi_app)
        except Exception:
            self.wsgi_app = target_asgi_app

    def __call__(self, scope, receive=None, send=None):
        if send is None:
            # WSGI: called synchronously by gunicorn sync worker with (environ, start_response)
            return self.wsgi_app(scope, receive)
        # ASGI: called asynchronously by uvicorn worker with (scope, receive, send)
        return self.asgi_app(scope, receive, send)


app = UniversalCallable(asgi_app)
wsgi_app = app
