"""Application submission strategies (always gated behind explicit per-application approval)."""

from __future__ import annotations

from app.models import Application, JobSource
from app.services.submission.base import SubmissionOutcome, SubmissionStep, Submitter
from app.services.submission.browser import BrowserAssistSubmitter, close_session
from app.services.submission.external import ExternalLinkSubmitter

__all__ = ["SubmissionOutcome", "SubmissionStep", "Submitter", "choose_submitter", "primary_source", "release"]


def primary_source(app: Application) -> JobSource | None:
    """The posting the application goes through: the one matching the apply URL, else the first."""
    sources = app.job.sources if app.job else []
    return next((s for s in sources if s.apply_url and s.apply_url == app.apply_url), sources[0] if sources else None)


def choose_submitter(app: Application) -> Submitter:
    if BrowserAssistSubmitter.supports(app, primary_source(app)):
        return BrowserAssistSubmitter()
    return ExternalLinkSubmitter()


def release(app: Application) -> None:
    """Free any browser window/temp files held for the application (no-op for the external flow)."""
    close_session(app.id)
