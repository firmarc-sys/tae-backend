"""TAE command endpoints — v1 namespace.

Wires to the new orchestrator with multi-turn context.
"""
from fastapi import APIRouter, HTTPException, Request

from app.services.orchestrator import run_tae_command_v2
from app.services.usage import usage_service
from app.security import decode_token

router = APIRouter(prefix="/tae", tags=["tae"])


@router.post("/command")
async def tae_command(request: Request):
    """Send a command to the TAE orchestrator."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, detail="Authentication required")

    payload = decode_token(auth[7:])
    if not payload:
        raise HTTPException(401, detail="Invalid or expired token")

    body = await request.json()
    command = body.get("command", "")
    gid = payload.get("gid", payload["sub"])
    role = payload.get("role", "free")
    name = payload.get("name", "Operator")
    history = body.get("history", [])

    # Check usage limits
    allowed, remaining = usage_service.check_limit(gid, payload.get("plan", "demo"))
    if not allowed:
        raise HTTPException(429, detail="Token limit reached. Upgrade your plan to continue.")

    result = await run_tae_command_v2(
        command=command, gid=gid, role=role, name=name,
        history=history,
    )

    # Meter tokens
    usage_service.record(gid, result.get("tokens", 0))

    return {
        "response": result["response"],
        "tools_used": result.get("tools_used", []),
        "tokens_used": result.get("tokens", 0),
        "tokens_remaining": remaining - result.get("tokens", 0),
    }
