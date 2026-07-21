"""API v1 router — aggregates all v1 sub-routers."""
from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.ws import router as ws_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(ws_router)


@router.get("/health")
async def health_v1():
    return {"ok": True, "version": "v1", "service": "Agentic OR Runtime"}
