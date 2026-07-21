"""Centralized configuration via pydantic-settings."""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── Core ──
    app_name: str = "Agentic OR Runtime"
    debug: bool = False
    cors_origins: list[str] = ["*"]

    # ── Database ──
    database_url: str = "postgresql://localhost:5432/tae"
    sios_enable_db: bool = True  # DB required in prod, in-memory fallback for dev

    # ── JWT / Auth ──
    jwt_secret: str = "CHANGE-ME-IN-PROD"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60
    jwt_refresh_expire_days: int = 30

    # ── OpenAI ──
    openai_api_key: str = ""

    # ── Anthropic (fallback) ──
    anthropic_api_key: str = ""

    # ── Stripe ──
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_starter: str = ""
    stripe_price_pro: str = ""

    # ── Frontend ──
    frontend_url: str = "http://localhost:5173"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
