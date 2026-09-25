"""FastAPI application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import (
    agent,
    analytics,
    application_answers,
    applications,
    audit,
    auth,
    companies,
    cover_letters,
    demo,
    follow_ups,
    integrations,
    interviews,
    job_matches,
    job_searches,
    jobs,
    notifications,
    profile,
    recruiters,
    resumes,
    templates,
    users,
)
from app.core.config import get_settings
from app.core.crypto import check_keys
from app.core.errors import register_error_handlers
from app.db import init_db
from app.services.agent.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

ROUTERS = [
    auth, users, profile, resumes, cover_letters, jobs, job_searches, job_matches, companies, applications,
    application_answers, interviews, recruiters, follow_ups, notifications, integrations, agent, analytics,
    templates, audit, demo,
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    check_keys()
    settings = get_settings()
    if settings.scheduler_enabled and settings.environment != "test":
        await start_scheduler()
    yield
    await stop_scheduler()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=f"{settings.app_name} API",
        version="1.0.0",
        description="Personal AI career agent: discover, analyze, customize, review, confirm, apply, track.",
        lifespan=lifespan,
        docs_url=f"{settings.api_prefix}/docs",
        openapi_url=f"{settings.api_prefix}/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Authorization", settings.csrf_header],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.url.path.startswith(settings.api_prefix) and "docs" not in request.url.path:
            response.headers.setdefault("Cache-Control", "no-store")
        if settings.cookie_secure:
            response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
        return response

    register_error_handlers(app)
    for module in ROUTERS:
        app.include_router(module.router, prefix=settings.api_prefix)

    @app.get(f"{settings.api_prefix}/health", tags=["health"])
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
