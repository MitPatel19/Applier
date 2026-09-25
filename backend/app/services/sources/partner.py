"""Shared base for partner-only job boards (LinkedIn, Indeed).

Their public job-search APIs are restricted to approved partners, so a source is only usable
when (1) the deployment has partner access configured and (2) the user connected the provider
under Settings → Integrations. Until then ``status`` reports ``not_connected`` and ``search``
raises a friendly ``SourceError``. A real partner client can be dropped in by implementing
``PartnerClient`` and registering it with ``set_partner_client``.
"""

from __future__ import annotations

from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.crypto import decrypt_str
from app.models import Integration, User
from app.schemas.jobs import SearchFilters
from app.services.sources.base import RawPosting, SourceError, SourceStatus


class PartnerClient(Protocol):
    """A partner API client. ``access_token`` is the user's OAuth token for the provider."""

    def search_jobs(self, access_token: str, filters: SearchFilters, *, limit: int) -> list[dict[str, Any]]: ...


_CLIENTS: dict[str, PartnerClient] = {}


def set_partner_client(provider: str, client: PartnerClient | None) -> None:
    """Install (or remove) the partner API client for ``provider``."""
    if client is None:
        _CLIENTS.pop(provider, None)
    else:
        _CLIENTS[provider] = client


class PartnerJobBoard:
    """Adapter for a job board whose search API requires partner access plus a user connection."""

    key: str
    label: str
    access_setting: str  # name of the Settings flag that enables partner access

    def to_posting(self, item: dict[str, Any]) -> RawPosting:
        """Map one partner API result to a ``RawPosting``."""
        raise NotImplementedError

    def _integration(self, db: Session, user: User) -> Integration | None:
        return db.scalar(select(Integration).where(Integration.user_id == user.id, Integration.provider == self.key))

    def status(self, db: Session, user: User) -> SourceStatus:
        if not getattr(get_settings(), self.access_setting, False) or self.key not in _CLIENTS:
            return SourceStatus(self.key, self.label, "not_connected",
                                f"{self.label}'s job search API is only available to approved partners, so Applier "
                                f"can't search {self.label} directly yet.")
        integration = self._integration(db, user)
        if integration is None or integration.status != "connected":
            return SourceStatus(self.key, self.label, "not_connected",
                                f"Connect {self.label} in Settings → Integrations to search its postings.")
        return SourceStatus(self.key, self.label, "ready", None)

    def search(self, db: Session, user: User, filters: SearchFilters, *, limit: int = 100) -> list[RawPosting]:
        state = self.status(db, user)
        if state.status != "ready":
            raise SourceError(f"We couldn't search {self.label}: {state.note} You can continue with the other "
                              "job sources.", retryable=False)
        integration = self._integration(db, user)
        token = decrypt_str(integration.access_token_enc) if integration else None
        if not token:
            raise SourceError(f"Your {self.label} connection has expired. Please reconnect it in Settings → "
                              "Integrations.", retryable=False)
        try:
            items = _CLIENTS[self.key].search_jobs(token, filters, limit=limit)
        except SourceError:
            raise
        except Exception as exc:  # partner client failure must never break the agent run
            raise SourceError("We couldn't retrieve jobs from this source right now. You can retry or continue "
                              "with the other job sources.") from exc
        return [self.to_posting(item) for item in items]
