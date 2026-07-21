"""FastAPI application factory.

Mounts existing routers unchanged under /api and /api/v1.
The v1 router is registered FIRST so its specific paths win
over the legacy catch-all SPA fallback in routes.py.
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

    # ── v1 namespace (mounted FIRST — specific paths before catch-all) ──
    from app.api.v1 import router as v1_router
    app.include_router(v1_router, prefix="/api/v1")

    # ── Mount existing legacy routes ──
    # The legacy router at /api serves the current frontend.
    # Its catch-all /{path:path} SPA fallback must come AFTER /api/v1/*.
    from routes import create_app as _create_legacy_app

    legacy = _create_legacy_app("./dist-live")
    for route in legacy.routes:
        app.router.routes.append(route)

    return app


# ASGI entrypoint
asgi = create_application()
