"""
Root app.py wrapper for Render/Heroku deployments.
Ensures app:app and app:wsgi_app resolve cleanly in every environment.
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

app = backend_app_mod.app

try:
    from a2wsgi import ASGIMiddleware
    wsgi_app = ASGIMiddleware(app)
except Exception:
    wsgi_app = app
