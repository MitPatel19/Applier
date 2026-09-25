"""OAuth 2.0 authorization-code flow for integrations.

Tokens are encrypted with ``app.core.crypto`` before they are stored and are decrypted only
in memory when a request to the provider is made. The ``state`` parameter is a random,
single-use value bound to the user's integration row.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_str, encrypt_str
from app.core.errors import AppError
from app.models import Integration, User, utcnow
from app.schemas.tracking import IntegrationOut
from app.services import audit
from app.services.integrations.providers import PROVIDERS, Provider, client_credentials, is_available, redirect_uri

log = logging.getLogger("applier.integrations")

HTTP_TIMEOUT = 15.0


class OAuthCallbackError(Exception):
    """Callback failure; ``code`` is a short, URL-safe reason passed back to the settings page."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class TokenSet:
    access_token: str
    refresh_token: str | None
    expires_in: int | None
    scopes: list[str]


def get_integration(db: Session, user_id: int, provider_key: str) -> Integration | None:
    return db.scalar(select(Integration).where(Integration.user_id == user_id, Integration.provider == provider_key))


def integration_out(provider: Provider, row: Integration | None) -> IntegrationOut:
    available = is_available(provider)
    status = row.status if row else "disconnected"
    if not available and status != "connected":
        status = "unavailable"
    return IntegrationOut(
        provider=provider.key, name=provider.name, category=provider.category, description=provider.description,
        status=status, available=available, availability_note=provider.availability_note,
        account_label=row.account_label if row else None,
        scopes=list(provider.scopes), scope_explanations=list(provider.scope_explanations),
        connected_at=row.connected_at if row else None, last_sync_at=row.last_sync_at if row else None,
        last_error=row.last_error if row else None,
    )


def list_integrations(db: Session, user: User) -> list[IntegrationOut]:
    rows = {r.provider: r for r in db.scalars(select(Integration).where(Integration.user_id == user.id))}
    return [integration_out(p, rows.get(key)) for key, p in PROVIDERS.items()]


def start_connect(db: Session, user: User, provider: Provider) -> str:
    """Create a pending integration with a fresh ``state`` and return the provider's authorize URL."""
    client_id, _ = client_credentials(provider)
    if not is_available(provider) or not client_id:
        raise AppError(
            f"{provider.name} isn't set up on this server yet. An administrator needs to add {provider.name} "
            "OAuth credentials before you can connect it.",
            code="integration_unavailable",
        )
    row = get_integration(db, user.id, provider.key) or Integration(user_id=user.id, provider=provider.key)
    if row.status != "connected":
        row.status = "pending"
    row.oauth_state = secrets.token_urlsafe(32)
    row.scopes = list(provider.scopes)
    db.add(row)
    db.commit()
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri(provider),
        "scope": " ".join(provider.scopes),
        "state": row.oauth_state,
        **provider.extra_authorize_params,
    }
    return f"{provider.authorize_url}?{urlencode(params)}"


def _token_request(provider: Provider, data: dict[str, str]) -> TokenSet:
    client_id, client_secret = client_credentials(provider)
    payload = {**data, "client_id": client_id or "", "client_secret": client_secret or ""}
    try:
        resp = httpx.post(provider.token_url, data=payload, headers={"Accept": "application/json"},
                          timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        body = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("%s token request failed: %s", provider.key, type(exc).__name__)
        raise OAuthCallbackError("token_exchange_failed") from exc
    if not body.get("access_token"):
        raise OAuthCallbackError("token_exchange_failed")
    scope = body.get("scope") or ""
    return TokenSet(access_token=body["access_token"], refresh_token=body.get("refresh_token"),
                    expires_in=int(body["expires_in"]) if body.get("expires_in") else None,
                    scopes=scope.replace(",", " ").split())


def exchange_code(provider: Provider, code: str) -> TokenSet:
    return _token_request(provider, {"grant_type": "authorization_code", "code": code,
                                     "redirect_uri": redirect_uri(provider)})


def fetch_account_label(provider: Provider, access_token: str) -> str | None:
    """Best-effort account label (e.g. the email address); never fails the connection."""
    if not provider.profile_url or not provider.profile_field:
        return None
    try:
        resp = httpx.get(provider.profile_url, headers={"Authorization": f"Bearer {access_token}"},
                         timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        value = resp.json().get(provider.profile_field)
    except (httpx.HTTPError, ValueError):
        return None
    return str(value)[:320] if value else None


def _store_tokens(row: Integration, tokens: TokenSet) -> None:
    row.access_token_enc = encrypt_str(tokens.access_token)
    if tokens.refresh_token:
        row.refresh_token_enc = encrypt_str(tokens.refresh_token)
    row.token_expires_at = utcnow() + timedelta(seconds=tokens.expires_in) if tokens.expires_in else None


def complete_callback(db: Session, user: User, provider: Provider, *, code: str | None, state: str | None,
                      error: str | None) -> None:
    """Validate ``state``, exchange the code and store encrypted tokens. Raises ``OAuthCallbackError``."""
    row = get_integration(db, user.id, provider.key)
    if row is None or not row.oauth_state or not state or not secrets.compare_digest(row.oauth_state, state):
        raise OAuthCallbackError("state_mismatch")
    row.oauth_state = None  # single use
    if error or not code:
        row.status = "connected" if row.access_token_enc else "disconnected"
        db.commit()
        raise OAuthCallbackError("access_denied" if error == "access_denied" else "authorization_failed")
    try:
        tokens = exchange_code(provider, code)
    except OAuthCallbackError:
        row.status, row.last_error = "error", "We couldn't finish connecting. Please try again."
        db.commit()
        raise
    _store_tokens(row, tokens)
    row.scopes = tokens.scopes or list(provider.scopes)
    row.account_label = fetch_account_label(provider, tokens.access_token)
    row.status, row.last_error, row.connected_at = "connected", None, utcnow()
    audit.record(db, user.id, "integration.connected",
                 f"Connected {provider.name}" + (f" ({row.account_label})" if row.account_label else ""),
                 entity_type="integration", entity_id=row.id, details={"scopes": row.scopes})
    db.commit()


def access_token(db: Session, row: Integration) -> str:
    """Decrypted access token, refreshed first when it has expired (or is about to)."""
    provider = PROVIDERS[row.provider]
    expiring = row.token_expires_at is not None and row.token_expires_at <= utcnow() + timedelta(seconds=60)
    refresh = decrypt_str(row.refresh_token_enc)
    if expiring and refresh:
        _store_tokens(row, _token_request(provider, {"grant_type": "refresh_token", "refresh_token": refresh}))
        db.commit()
    token = decrypt_str(row.access_token_enc)
    if not token:
        raise AppError(f"Your {provider.name} connection has expired. Please reconnect it in Settings.",
                       code="integration_expired")
    return token


def _revoke(provider: Provider, row: Integration) -> None:
    token = decrypt_str(row.refresh_token_enc) or decrypt_str(row.access_token_enc)
    if not provider.revoke_url or not token:
        return
    try:
        httpx.post(provider.revoke_url, data={"token": token}, timeout=HTTP_TIMEOUT)
    except httpx.HTTPError:
        log.info("Token revocation for %s failed; tokens are deleted locally regardless", provider.key)


def disconnect(db: Session, user: User, provider: Provider) -> IntegrationOut:
    row = get_integration(db, user.id, provider.key)
    if row is not None:
        _revoke(provider, row)
        row.access_token_enc = row.refresh_token_enc = row.oauth_state = None
        row.token_expires_at = row.connected_at = None
        row.account_label, row.last_error, row.status = None, None, "disconnected"
        audit.record(db, user.id, "integration.disconnected",
                     f"Disconnected {provider.name} and deleted its access tokens",
                     entity_type="integration", entity_id=row.id)
        db.commit()
    return integration_out(provider, row)
