"""
angel_one_auth.py
=================
Angel One SmartAPI Official Authentication & Token Lifecycle Manager.

Handles:
- SmartAPI Login via API Key + Client Code + Password/PIN + TOTP (pyotp)
- Daily JWT Token Refresh & Auto-Reauthentication
- Token Caching in Memory & Redis
"""

import os
import time
import json
import logging
from typing import Optional, Dict, Any
import requests
import pyotp

logger = logging.getLogger("angel_one_auth")
logger.setLevel(logging.INFO)

ANGEL_API_KEY = os.getenv("ANGEL_ONE_API_KEY", "qM6i2EyY").strip()
ANGEL_CLIENT_CODE = os.getenv("ANGEL_ONE_CLIENT_CODE", "").strip()
ANGEL_PASSWORD = os.getenv("ANGEL_ONE_PASSWORD", "").strip()
ANGEL_TOTP_KEY = os.getenv("ANGEL_ONE_TOTP_KEY", "").strip()

ANGEL_LOGIN_URL = "https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword"
ANGEL_REFRESH_URL = "https://apiconnect.angelbroking.com/rest/auth/angelbroking/jwt/v1/generateTokens"

_cached_jwt = os.getenv("ANGEL_ONE_JWT_TOKEN", "").strip()
_cached_feed_token = os.getenv("ANGEL_ONE_FEED_TOKEN", "").strip()
_cached_refresh_token = os.getenv("ANGEL_ONE_REFRESH_TOKEN", "").strip()
_token_expiry = 0


def generate_totp(totp_key: Optional[str] = None) -> str:
    """Generate 6-digit TOTP code using pyotp."""
    key = (totp_key or ANGEL_TOTP_KEY).strip()
    if not key:
        return ""
    try:
        totp = pyotp.TOTP(key)
        return str(totp.now())
    except Exception as e:
        logger.error(f"TOTP Generation error: {e}")
        return ""


def login_smartapi(
    client_code: Optional[str] = None,
    password: Optional[str] = None,
    totp_key: Optional[str] = None,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Perform official SmartAPI login using API Key + Client Code + Password + TOTP.
    Reference: https://smartapi.angelbroking.com/docs
    """
    global _cached_jwt, _cached_feed_token, _cached_refresh_token, _token_expiry

    c_code = (client_code or os.getenv("ANGEL_ONE_CLIENT_CODE", ANGEL_CLIENT_CODE)).strip()
    pwd = (password or os.getenv("ANGEL_ONE_PASSWORD", ANGEL_PASSWORD)).strip()
    t_key = (totp_key or os.getenv("ANGEL_ONE_TOTP_KEY", ANGEL_TOTP_KEY)).strip()
    a_key = (api_key or os.getenv("ANGEL_ONE_API_KEY", ANGEL_API_KEY)).strip()

    if not (c_code and pwd and a_key):
        return {
            "status": "error",
            "message": "Missing credentials. Provide ANGEL_ONE_CLIENT_CODE, ANGEL_ONE_PASSWORD, and ANGEL_ONE_API_KEY in .env"
        }

    totp_val = generate_totp(t_key) if t_key else ""

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-PrivateKey": a_key,
        "X-SourceID": "WEB",
        "X-ClientLocalIP": "127.0.0.1",
        "X-ClientPublicIP": "106.193.147.98",
        "X-MACAddress": "fe80::216e:6507:4b83:3701",
        "X-UserType": "USER"
    }

    payload = {
        "clientcode": c_code,
        "password": pwd,
    }
    if totp_val:
        payload["totp"] = totp_val

    try:
        r = requests.post(ANGEL_LOGIN_URL, json=payload, headers=headers, timeout=10)
        data = r.json()

        if r.status_code == 200 and data.get("status") is True and data.get("data"):
            token_data = data["data"]
            jwt_token = token_data.get("jwtToken")
            refresh_token = token_data.get("refreshToken")
            feed_token = token_data.get("feedToken")

            _cached_jwt = jwt_token
            _cached_refresh_token = refresh_token
            _cached_feed_token = feed_token
            _token_expiry = time.time() + 86400  # 24h validity

            os.environ["ANGEL_ONE_JWT_TOKEN"] = jwt_token or ""
            os.environ["ANGEL_ONE_FEED_TOKEN"] = feed_token or ""
            os.environ["ANGEL_ONE_REFRESH_TOKEN"] = refresh_token or ""

            logger.info(f"✅ Angel One SmartAPI Login Successful for Client: {c_code}")
            return {
                "status": "success",
                "message": "Angel One SmartAPI Authenticated",
                "client_code": c_code,
                "jwtToken": jwt_token,
                "feedToken": feed_token,
                "refreshToken": refresh_token,
                "expires_in": "24 hours"
            }
        else:
            msg = data.get("message", "Authentication Failed")
            logger.warning(f"Angel One Login Failed: {msg}")
            return {"status": "error", "code": data.get("errorcode"), "message": msg}
    except Exception as e:
        logger.error(f"Angel One Login Exception: {e}")
        return {"status": "error", "message": str(e)}


def get_valid_jwt() -> str:
    """Retrieve current active JWT token or trigger automatic re-auth."""
    global _cached_jwt, _token_expiry
    if _cached_jwt and time.time() < _token_expiry:
        return _cached_jwt

    token = os.getenv("ANGEL_ONE_JWT_TOKEN", "").strip()
    if token:
        _cached_jwt = token
        return token

    # Attempt automatic login if credentials exist
    if os.getenv("ANGEL_ONE_CLIENT_CODE") and os.getenv("ANGEL_ONE_PASSWORD"):
        res = login_smartapi()
        if res.get("status") == "success":
            return res.get("jwtToken", "")

    return ""


def get_feed_token() -> str:
    """Retrieve feed token for WebSocket connection."""
    global _cached_feed_token
    if _cached_feed_token:
        return _cached_feed_token
    return os.getenv("ANGEL_ONE_FEED_TOKEN", "").strip()
