"""Admin endpoints — owner-only operations."""
from fastapi import APIRouter, HTTPException, Request

from app.security import decode_token

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_owner(request: Request) -> dict:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, detail="Authentication required")
    payload = decode_token(auth[7:])
    if not payload or payload.get("role") != "owner":
        raise HTTPException(403, detail="Owner access required")
    return payload


@router.get("/users")
async def list_users(request: Request):
    """List all users (owner only)."""
    _require_owner(request)
    # TODO: Query users from DB
    return {"users": [], "total": 0}


@router.post("/whitelist")
async def add_to_whitelist(request: Request):
    """Add email to whitelist (owner only)."""
    _require_owner(request)
    body = await request.json()
    email = body.get("email", "")
    # TODO: Add to whitelist in DB
    return {"email": email, "whitelisted": True}


@router.get("/stats")
async def system_stats(request: Request):
    """System statistics (owner only)."""
    _require_owner(request)
    from app.services.runtime import session_manager
    from app.services.usage import usage_service
    return {
        "active_sessions": len(session_manager.all_gids()),
        "gids": session_manager.all_gids(),
    }
