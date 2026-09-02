import os

# gunicorn.conf.py for Render & Production Deployments
port = os.getenv("PORT", "10000")
bind = f"0.0.0.0:{port}"
worker_class = "uvicorn.workers.UvicornWorker"
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
timeout = 120
keepalive = 5
graceful_timeout = 30
accesslog = "-"
errorlog = "-"
