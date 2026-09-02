"""
Root app.py wrapper for Render/Heroku deployments.
Safely loads backend/app.py and re-exports all symbols and the FastAPI application.
"""

import sys
import os
import importlib.util

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

backend_app_path = os.path.join(backend_dir, "app.py")
spec = importlib.util.spec_from_file_location("backend_app_module", backend_app_path)
backend_mod = importlib.util.module_from_spec(spec)
sys.modules["backend_app_module"] = backend_mod
sys.modules["app"] = backend_mod
spec.loader.exec_module(backend_mod)

for _attr in dir(backend_mod):
    if not _attr.startswith("__"):
        globals()[_attr] = getattr(backend_mod, _attr)

app = backend_mod.app
fastapi_app = getattr(backend_mod, "fastapi_app", app)
asgi_app = getattr(backend_mod, "asgi_app", app)
