"""API v1 router — aggregates all v1 sub-routers."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_v1():
    return {"ok": True, "version": "v1", "service": "Agentic OR Runtime"}
