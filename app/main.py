"""FastAPI application factory.

Mounts existing routers unchanged under /api and /api/v1.
During migration, /api/* proxies to the same handlers so the
deployed frontend keeps working.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings


def create_application() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.8.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Mount existing routes unchanged ──
    # The compatibility router at /api serves the current frontend.
    from routes import create_app as _create_legacy_app

    legacy = _create_legacy_app("./dist-live")
    # Mount legacy sub-routers under /api (keeping existing shapes)
    for route in legacy.routes:
        app.router.routes.append(route)

    # ── v1 namespace (new endpoints land here) ──
    from app.api.v1 import router as v1_router
    app.include_router(v1_router, prefix="/api/v1")

    return app


# ASGI entrypoint
asgi = create_application()
