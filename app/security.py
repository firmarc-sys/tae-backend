"""Security: JWT (HS256 for now, RS256 later), password hashing, WS tickets."""
import time
import secrets
import json
import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

from passlib.context import CryptContext
from jose import jwt, JWTError

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, extra: dict | None = None) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload: dict[str, Any] = {"sub": subject, "exp": expire, "type": "access"}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expire_days)
    payload = {"sub": subject, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


# ── WS Ticket Auth ──
# Short-lived signed ticket replaces bare GID in WS connections.
# POST /api/v1/ws/ticket → ?ticket=... on the WebSocket URL.

def create_ws_ticket(gid: str, role: str = "free") -> str:
    """Create a short-lived (30s) signed WS ticket."""
    settings = get_settings()
    payload = {"gid": gid, "role": role, "exp": time.time() + 30}
    raw = json.dumps(payload, separators=(",", ":"))
    sig = hmac.new(settings.jwt_secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def verify_ws_ticket(ticket: str) -> dict | None:
    """Verify a WS ticket. Returns {gid, role} or None."""
    settings = get_settings()
    try:
        raw, sig = ticket.rsplit(".", 1)
        expected_sig = hmac.new(settings.jwt_secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return None
        payload = json.loads(raw)
        if payload.get("exp", 0) < time.time():
            return None
        return {"gid": payload["gid"], "role": payload.get("role", "free")}
    except Exception:
        return None
