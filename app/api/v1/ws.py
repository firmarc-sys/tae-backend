"""WebSocket ticket endpoint — replaces bare GID in WS connections."""
from fastapi import APIRouter, HTTPException, Request
from app.security import create_ws_ticket, verify_ws_ticket

router = APIRouter(tags=["websocket"])


@router.post("/ws/ticket")
async def create_ticket(request: Request):
    """Issue a short-lived WS ticket.

    Frontend calls this with its JWT, then connects to /ws?ticket=...
    """
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, detail="Authentication required")

    from app.security import decode_token
    payload = decode_token(auth[7:])
    if not payload:
        raise HTTPException(401, detail="Invalid or expired token")

    gid = payload.get("gid", payload["sub"])
    role = payload.get("role", "free")
    ticket = create_ws_ticket(gid, role)
    return {"ticket": ticket, "expires_in": 30}


def authenticate_ws_ticket(ticket: str) -> dict | None:
    """Verify a WS ticket from query params. Used by ws_manager."""
    return verify_ws_ticket(ticket)
