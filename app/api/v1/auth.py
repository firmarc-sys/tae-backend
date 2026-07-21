"""Auth endpoints — ported from Express src/routes/auth.js.

Same request/response shapes as the Node routes so the frontend
doesn't need changes during migration.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Request

from app.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(request: Request):
    """Register a new user or activate a whitelisted account."""
    body = await request.json()
    email = body.get("email", "").lower().strip()
    password = body.get("password", "")
    display_name = body.get("display_name")

    if not email or not password:
        raise HTTPException(400, detail="Email and password required")

    # TODO: Check existing user in DB (Phase 2 repo)
    # For now, return same shape as Express
    from app.services.gid import gid_service

    gid = gid_service.issue()
    password_hash = hash_password(password)
    # TODO: Persist user to DB

    access_token = create_access_token(gid, {"gid": gid, "role": "user"})
    refresh = create_refresh_token(gid)

    return {
        "access_token": access_token,
        "refresh_token": refresh,
        "user": {
            "id": str(uuid.uuid4()),
            "email": email,
            "display_name": display_name or email.split("@")[0],
            "gid": gid,
            "role": "user",
            "plan": "demo",
        },
    }


@router.post("/login")
async def login(request: Request):
    """Login with email + password."""
    body = await request.json()
    email = body.get("email", "").lower().strip()
    password = body.get("password", "")

    if not email or not password:
        raise HTTPException(400, detail="Email and password required")

    # TODO: Fetch user from DB, verify password
    raise HTTPException(501, detail="Login not yet wired to DB — use /auth/register")


@router.post("/refresh")
async def refresh_token(request: Request):
    """Exchange a refresh token for a new access token."""
    body = await request.json()
    token = body.get("refresh_token", "")
    payload = decode_token(token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(401, detail="Invalid refresh token")

    gid = payload["sub"]
    new_access = create_access_token(gid, {"gid": gid})
    return {"access_token": new_access}


@router.get("/me")
async def me(request: Request):
    """Get current user info from JWT."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, detail="Authentication required")
    payload = decode_token(auth[7:])
    if not payload:
        raise HTTPException(401, detail="Invalid or expired token")
    # TODO: Fetch full user from DB
    return {
        "id": payload["sub"],
        "gid": payload.get("gid", payload["sub"]),
        "role": payload.get("role", "user"),
        "plan": "demo",
    }


@router.post("/demo")
async def demo_session():
    """Create a demo session (same shape as Express)."""
    from app.services.gid import gid_service

    gid = gid_service.issue()
    access_token = create_access_token(gid, {"gid": gid, "role": "free"})
    return {
        "access_token": access_token,
        "user": {
            "id": str(uuid.uuid4()),
            "email": f"demo-{gid[:6]}@agentic-or.ai",
            "display_name": "Demo Operator",
            "gid": gid,
            "role": "free",
            "plan": "demo",
        },
    }
