"""Job source, email and calendar integrations (OAuth) and job-related email sync."""

from __future__ import annotations

from urllib.parse import urlencode

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from app.api.deps import DB, CurrentUser, get_current_user
from app.core.config import get_settings
from app.core.errors import AppError
from app.schemas.tracking import AgentTaskOut, ConnectOut, IntegrationOut
from app.services import email_sync
from app.services.integrations import oauth
from app.services.integrations.providers import get_provider

router = APIRouter(prefix="/integrations", tags=["integrations"])


def _settings_redirect(**params: str) -> RedirectResponse:
    query = urlencode({"tab": "integrations", **params})
    return RedirectResponse(f"{get_settings().frontend_url.rstrip('/')}/settings?{query}", status_code=302)


@router.get("", response_model=list[IntegrationOut])
def list_integrations(user: CurrentUser, db: DB) -> list[IntegrationOut]:
    return oauth.list_integrations(db, user)


@router.post("/email/sync", response_model=AgentTaskOut)
def sync_email(user: CurrentUser, db: DB) -> AgentTaskOut:
    return AgentTaskOut.model_validate(email_sync.run_email_sync(db, user))


@router.post("/{provider}/connect", response_model=ConnectOut)
def connect(provider: str, user: CurrentUser, db: DB) -> ConnectOut:
    return ConnectOut(authorize_url=oauth.start_connect(db, user, get_provider(provider)))


@router.get("/{provider}/callback")
def callback(provider: str, request: Request, db: DB, code: str | None = None, state: str | None = None,
             error: str | None = None) -> RedirectResponse:
    """OAuth redirect target. Always sends the browser back to the settings page with the outcome."""
    spec = get_provider(provider)
    try:
        user = get_current_user(request, db)
    except AppError:
        return _settings_redirect(provider=spec.key, error="session_expired")
    try:
        oauth.complete_callback(db, user, spec, code=code, state=state, error=error)
    except oauth.OAuthCallbackError as exc:
        return _settings_redirect(provider=spec.key, error=exc.code)
    return _settings_redirect(connected=spec.key)


@router.post("/{provider}/disconnect", response_model=IntegrationOut)
def disconnect(provider: str, user: CurrentUser, db: DB) -> IntegrationOut:
    return oauth.disconnect(db, user, get_provider(provider))
