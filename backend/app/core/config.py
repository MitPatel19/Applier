"""Application settings, loaded from environment variables (prefix ``APPLIER_``)."""

from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APPLIER_", env_file=".env", extra="ignore")

    app_name: str = "Applier"
    environment: str = "development"  # development | test | production
    api_prefix: str = "/api"

    # PostgreSQL in production, e.g. postgresql+psycopg://user:pass@host/applier
    database_url: str = f"sqlite:///{BASE_DIR / 'data' / 'applier.db'}"

    # Signing key for session JWTs. MUST be set explicitly in production.
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    # Fernet key (urlsafe base64, 32 bytes) used for encryption at rest of tokens and documents.
    encryption_key: str | None = None

    access_token_ttl_minutes: int = 60 * 12
    session_cookie_name: str = "applier_session"
    cookie_secure: bool = False  # set True behind HTTPS
    csrf_header: str = "X-Requested-With"

    cors_origins: list[str] = ["http://localhost:3000"]
    frontend_url: str = "http://localhost:3000"

    storage_dir: Path = BASE_DIR / "data" / "storage"
    max_upload_mb: int = 10

    # Demo mode seeds sample data and enables the clearly-labelled demo job source.
    demo_mode: bool = True

    # Optional AI writing assistance. When unset, deterministic templates are used.
    anthropic_api_key: str | None = None
    llm_model: str = "claude-opus-5"

    # Background scheduler for saved searches.
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 300

    # OAuth client credentials for integrations (only providers with credentials can connect).
    linkedin_client_id: str | None = None
    linkedin_client_secret: str | None = None
    indeed_client_id: str | None = None
    indeed_client_secret: str | None = None
    google_client_id: str | None = None
    google_client_secret: str | None = None
    microsoft_client_id: str | None = None
    microsoft_client_secret: str | None = None

    # Public employer ATS boards to search (company slugs). e.g. {"greenhouse": ["shopify"], "lever": ["..."]}
    employer_boards: dict[str, list[str]] = {}

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.is_production:
        if "APPLIER_SECRET_KEY" not in __import__("os").environ:
            raise RuntimeError("APPLIER_SECRET_KEY must be set in production")
        if not s.encryption_key:
            raise RuntimeError("APPLIER_ENCRYPTION_KEY must be set in production")
    return s
