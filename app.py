"""
Root app.py wrapper for Render/Heroku deployments.
Exports native FastAPI ASGI application for uvicorn / gunicorn.
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

# Export the raw FastAPI ASGI application
app = getattr(backend_app_mod, "fastapi_app", backend_app_mod.app)
asgi_app = app
