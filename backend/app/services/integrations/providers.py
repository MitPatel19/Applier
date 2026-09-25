"""Catalog of supported integrations and the minimum OAuth scopes each one requests.

Every scope comes with a plain-language explanation that is shown to the user before
they connect. A provider is ``available`` only when the server has OAuth client
credentials for it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.core.config import get_settings
from app.core.errors import NotFound

GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke"
MICROSOFT_AUTHORIZE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
MICROSOFT_TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token"

GMAIL_JOB_QUERY = (
    'newer_than:30d (subject:(application OR interview OR offer OR "thank you for applying") '
    "OR from:(greenhouse.io OR lever.co OR myworkday.com))"
)


@dataclass(frozen=True)
class Provider:
    key: str
    name: str
    category: Literal["job_source", "email", "calendar"]
    description: str
    credentials: Literal["linkedin", "indeed", "google", "microsoft"]
    authorize_url: str
    token_url: str
    scopes: tuple[str, ...]
    scope_explanations: tuple[str, ...]
    availability_note: str | None = None
    extra_authorize_params: dict[str, str] = field(default_factory=dict)
    revoke_url: str | None = None
    # Endpoint + JSON field used to label the connected account (only where granted scopes allow it).
    profile_url: str | None = None
    profile_field: str | None = None


_GOOGLE_OFFLINE = {"access_type": "offline", "prompt": "consent", "include_granted_scopes": "true"}

PROVIDERS: dict[str, Provider] = {
    "linkedin": Provider(
        key="linkedin", name="LinkedIn", category="job_source",
        description="Sign in with LinkedIn to link your LinkedIn identity to Applier.",
        credentials="linkedin",
        authorize_url="https://www.linkedin.com/oauth/v2/authorization",
        token_url="https://www.linkedin.com/oauth/v2/accessToken",
        scopes=("openid", "profile", "email"),
        scope_explanations=(
            "Confirm your identity with LinkedIn (OpenID Connect).",
            "Read your name and profile photo.",
            "Read the email address on your LinkedIn account.",
        ),
        availability_note=(
            "LinkedIn only offers job search APIs to approved partners. Connecting links your identity; "
            "LinkedIn job results appear only when the server has LinkedIn partner access."
        ),
        profile_url="https://api.linkedin.com/v2/userinfo", profile_field="email",
    ),
    "indeed": Provider(
        key="indeed", name="Indeed", category="job_source",
        description="Link your Indeed account for Indeed job results.",
        credentials="indeed",
        authorize_url="https://secure.indeed.com/oauth/v2/authorize",
        token_url="https://apis.indeed.com/oauth/v2/tokens",
        scopes=("email", "offline_access"),
        scope_explanations=(
            "Read the email address on your Indeed account.",
            "Stay connected without asking you to sign in again each hour.",
        ),
        availability_note=(
            "Indeed job data is available only through the Indeed partner program. Results appear when the "
            "server has partner access."
        ),
    ),
    "gmail": Provider(
        key="gmail", name="Gmail", category="email",
        description="Detect application confirmations, interview invitations, recruiter replies and rejections.",
        credentials="google",
        authorize_url=GOOGLE_AUTHORIZE, token_url=GOOGLE_TOKEN,
        scopes=("https://www.googleapis.com/auth/gmail.readonly",),
        scope_explanations=(
            "Read-only access to Gmail. Applier never sends, deletes or changes email. It only runs a narrow "
            "search for job-related messages (application, interview and offer subjects, or senders such as "
            "Greenhouse, Lever and Workday), reads just the sender, subject and a short snippet, and stores only "
            "the messages it recognizes as job-related.",
        ),
        extra_authorize_params=_GOOGLE_OFFLINE,
        revoke_url=GOOGLE_REVOKE,
        profile_url="https://gmail.googleapis.com/gmail/v1/users/me/profile", profile_field="emailAddress",
    ),
    "outlook": Provider(
        key="outlook", name="Outlook", category="email",
        description="Detect job-related emails in your Outlook or Microsoft 365 mailbox.",
        credentials="microsoft",
        authorize_url=MICROSOFT_AUTHORIZE, token_url=MICROSOFT_TOKEN,
        scopes=("Mail.Read", "offline_access"),
        scope_explanations=(
            "Read-only access to your mail. Applier only searches for job-related messages, reads the sender, "
            "subject and a short preview, and stores only messages it recognizes as job-related.",
            "Stay connected without asking you to sign in again each hour.",
        ),
    ),
    "google_calendar": Provider(
        key="google_calendar", name="Google Calendar", category="calendar",
        description="Add scheduled interviews to your Google Calendar.",
        credentials="google",
        authorize_url=GOOGLE_AUTHORIZE, token_url=GOOGLE_TOKEN,
        scopes=("https://www.googleapis.com/auth/calendar.events",),
        scope_explanations=(
            "Create and update calendar events for interviews you schedule in Applier. It does not read your "
            "calendar settings or share your calendar.",
        ),
        extra_authorize_params=_GOOGLE_OFFLINE,
        revoke_url=GOOGLE_REVOKE,
    ),
    "microsoft_calendar": Provider(
        key="microsoft_calendar", name="Outlook Calendar", category="calendar",
        description="Add scheduled interviews to your Outlook or Microsoft 365 calendar.",
        credentials="microsoft",
        authorize_url=MICROSOFT_AUTHORIZE, token_url=MICROSOFT_TOKEN,
        scopes=("Calendars.ReadWrite", "offline_access"),
        scope_explanations=(
            "Create and update calendar events for interviews you schedule in Applier.",
            "Stay connected without asking you to sign in again each hour.",
        ),
    ),
}

EMAIL_PROVIDERS = ("gmail", "outlook")


def get_provider(key: str) -> Provider:
    provider = PROVIDERS.get(key)
    if provider is None:
        raise NotFound("integration")
    return provider


def client_credentials(provider: Provider) -> tuple[str | None, str | None]:
    s = get_settings()
    return (getattr(s, f"{provider.credentials}_client_id"), getattr(s, f"{provider.credentials}_client_secret"))


def is_available(provider: Provider) -> bool:
    client_id, client_secret = client_credentials(provider)
    return bool(client_id and client_secret)


def redirect_uri(provider: Provider) -> str:
    """OAuth callback. The frontend proxies ``/api`` to the backend, so this is same-origin for the browser."""
    s = get_settings()
    return f"{s.frontend_url.rstrip('/')}{s.api_prefix}/integrations/{provider.key}/callback"
