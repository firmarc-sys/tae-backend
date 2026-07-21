"""API v1 router — aggregates all v1 sub-routers."""
from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.ws import router as ws_router
from app.api.v1.billing import router as billing_router
from app.api.v1.tae import router as tae_router
from app.api.v1.admin import router as admin_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(ws_router)
router.include_router(billing_router)
router.include_router(tae_router)
router.include_router(admin_router)


@router.get("/health")
async def health_v1():
    return {"ok": True, "version": "v1", "service": "Agentic OR Runtime"}
