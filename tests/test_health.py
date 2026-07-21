"""Basic health check test."""
from fastapi.testclient import TestClient


def test_v1_health():
    """The v1 health endpoint should return ok."""
    from app.api.v1 import router
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    client = TestClient(app)
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
