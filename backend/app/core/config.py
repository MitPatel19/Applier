"""Application settings, loaded from environment variables (prefix ``APPLIER_``)."""

from __future__ import annotations

import os
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APPLIER_", env_file=".env", extra="ignore")

    app_name: str = "Applier"
    environment: str = "development"  # development | test | production
    api_prefix: str = "/api"

    # PostgreSQL in production, e.g. postgresql+psycopg://user:pass@host/applier
    # Also read from plain DATABASE_URL, which Railway/Heroku-style Postgres add-ons provide.
    database_url: str = Field(
        default=f"sqlite:///{BASE_DIR / 'data' / 'applier.db'}",
        validation_alias=AliasChoices("APPLIER_DATABASE_URL", "DATABASE_URL"),
    )

    # Signing key for session JWTs. MUST be set explicitly in production.
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    # Fernet key (urlsafe base64, 32 bytes) used for encryption at rest of tokens and documents.
    encryption_key: str | None = None

    access_token_ttl_minutes: int = 60 * 12
    session_cookie_name: str = "applier_session"
    # Secure (HTTPS-only) session cookie. Defaults to True whenever the frontend URL is https.
    cookie_secure: bool | None = None
    csrf_header: str = "X-Requested-With"

    cors_origins: list[str] = ["http://localhost:3000"]
    frontend_url: str = "http://localhost:3000"

    storage_dir: Path = BASE_DIR / "data" / "storage"
    # Where uploaded/generated documents are kept (always encrypted):
    # "database" (PostgreSQL — no disk volume needed), "filesystem" (storage_dir), or
    # "auto" = database unless the database is SQLite.
    storage_backend: str = "auto"
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

    # LinkedIn / Indeed job-search APIs are only available to approved partners. Set these once the
    # deployment has partner access (and a partner client is installed); otherwise those sources are
    # "not connected" (served by sample data in demo mode).
    linkedin_partner_access: bool = False
    indeed_partner_access: bool = False

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, url: str) -> str:
        """``postgres://`` / ``postgresql://`` URLs from hosting providers -> SQLAlchemy + psycopg 3."""
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url

    @model_validator(mode="after")
    def _platform_defaults(self) -> Settings:
        """Sensible defaults on hosting platforms, so only secrets need to be configured.

        On Railway the public domain is provided as ``RAILWAY_PUBLIC_DOMAIN``; the web app and
        API share it (the web server proxies ``/api``), so it is also the OAuth/CORS origin.
        """
        domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN")
        if domain and "APPLIER_FRONTEND_URL" not in os.environ:
            self.frontend_url = f"https://{domain}"
        if self.cookie_secure is None:
            self.cookie_secure = self.frontend_url.startswith("https://")
        origin = self.frontend_url.rstrip("/")
        if origin not in self.cors_origins:
            self.cors_origins = [*self.cors_origins, origin]
        return self

    @property
    def uses_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.is_production:
        if "APPLIER_SECRET_KEY" not in os.environ:
            raise RuntimeError("APPLIER_SECRET_KEY must be set in production")
        if not s.encryption_key:
            raise RuntimeError("APPLIER_ENCRYPTION_KEY must be set in production")
    return s
