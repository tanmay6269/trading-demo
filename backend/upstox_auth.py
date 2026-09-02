"""
upstox_auth.py
==============
Automated Upstox OAuth 2.0 Token Generation & Lifecycle Manager for BullX.

Endpoints handled:
- GET /api/admin/upstox/login -> Redirects user to official Upstox OAuth dialog
- GET /api/admin/upstox/callback -> Exchanges authorization code for daily Access Token
"""

import os
import time
import logging
from typing import Optional, Dict, Any
import requests

logger = logging.getLogger("upstox_auth")

UPSTOX_API_KEY = os.getenv("UPSTOX_API_KEY", "99aaeda7-3321-45d5-b04d-14694992cb1d")
UPSTOX_API_SECRET = os.getenv("UPSTOX_API_SECRET", "a27403lm4b")
UPSTOX_REDIRECT_URI = os.getenv("UPSTOX_REDIRECT_URI", "https://trading-demo-backend.onrender.com/api/admin/upstox/callback")

_cached_token = os.getenv("UPSTOX_ACCESS_TOKEN", "")
_token_expiry = 0


def get_login_url() -> str:
    """Generate the official Upstox OAuth authorization dialog URL."""
    api_key = os.getenv("UPSTOX_API_KEY", UPSTOX_API_KEY)
    redirect_uri = os.getenv("UPSTOX_REDIRECT_URI", UPSTOX_REDIRECT_URI)
    return f"https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id={api_key}&redirect_uri={requests.utils.quote(redirect_uri)}"


def exchange_code_for_token(code: str) -> Dict[str, Any]:
    """Exchange authorization code for daily OAuth access token."""
    global _cached_token, _token_expiry
    api_key = os.getenv("UPSTOX_API_KEY", UPSTOX_API_KEY)
    api_secret = os.getenv("UPSTOX_API_SECRET", UPSTOX_API_SECRET)
    redirect_uri = os.getenv("UPSTOX_REDIRECT_URI", UPSTOX_REDIRECT_URI)

    url = "https://api.upstox.com/v2/login/authorization/token"
    headers = {
        "accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    payload = {
        "code": code,
        "client_id": api_key,
        "client_secret": api_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }

    try:
        r = requests.post(url, data=payload, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            token = data.get("access_token")
            user_name = data.get("user_name", "Upstox User")
            user_id = data.get("user_id", "")
            
            if token:
                _cached_token = token
                _token_expiry = time.time() + 86400  # 24 hour validity
                os.environ["UPSTOX_ACCESS_TOKEN"] = token
                logger.info(f"✅ Successfully authorized Upstox Access Token for {user_name} ({user_id})")
                
                # Save to redis if available
                try:
                    import redis
                    r_client = redis.Redis(host=os.getenv("REDIS_HOST", "localhost"), port=6379, db=0, decode_responses=True)
                    r_client.set("UPSTOX_ACCESS_TOKEN", token, ex=86400)
                except Exception:
                    pass

                return {
                    "status": "success",
                    "user_name": user_name,
                    "user_id": user_id,
                    "access_token": token,
                    "expires_in": "24 hours"
                }
        return {
            "status": "error",
            "code": r.status_code,
            "error": r.text
        }
    except Exception as e:
        logger.error(f"Upstox Token Exchange Error: {e}")
        return {"status": "error", "message": str(e)}


def get_access_token() -> str:
    """Retrieve current valid Upstox access token from memory, env, or Redis."""
    global _cached_token
    if _cached_token:
        return _cached_token
    token = os.getenv("UPSTOX_ACCESS_TOKEN", "")
    if token:
        _cached_token = token
        return token
    try:
        import redis
        r_client = redis.Redis(host=os.getenv("REDIS_HOST", "localhost"), port=6379, db=0, decode_responses=True)
        t = r_client.get("UPSTOX_ACCESS_TOKEN")
        if t:
            _cached_token = t
            return t
    except Exception:
        pass
    return ""
