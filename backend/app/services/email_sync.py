"""Job-related email detection.

Privacy rules enforced here:
* Mailboxes are queried with a narrow, job-focused search; only metadata (sender, subject,
  date) and the provider's short snippet are read — never full bodies or attachments.
* Only messages classified as job-related are stored (``EmailMessage``); everything else
  is discarded in memory.
* Status changes are made only for high-confidence confirmations and rejections; interview
  invitations, recruiter messages and offers become notifications for the user to act on.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parseaddr

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import (
    AgentTask,
    AgentTaskStatus,
    Application,
    ApplicationStatus,
    EmailMessage,
    Integration,
    User,
    utcnow,
)
from app.services import audit
from app.services.integrations import oauth
from app.services.integrations.providers import EMAIL_PROVIDERS, GMAIL_JOB_QUERY, PROVIDERS
from app.services.notifications import notify

log = logging.getLogger("applier.email_sync")

MAX_MESSAGES = 50
HIGH_CONFIDENCE = 0.75
JOB_CATEGORIES = ("confirmation", "interview_invite", "recruiter", "rejection", "offer")
ATS_DOMAINS = ("greenhouse.io", "lever.co", "myworkday.com", "workday.com", "ashbyhq.com", "smartrecruiters.com",
               "icims.com", "taleo.net", "bamboohr.com", "jobvite.com")
_TERMINAL = {ApplicationStatus.rejected, ApplicationStatus.withdrawn, ApplicationStatus.closed, ApplicationStatus.offer}


def _rules(*pairs: tuple[str, float]) -> list[tuple[re.Pattern[str], float]]:
    return [(re.compile(p, re.IGNORECASE), w) for p, w in pairs]


# Weighted phrase rules. Rejection and offer phrases are weighted heavily because those emails
# usually also contain confirmation or interview wording ("thank you for applying…", "after your interview…").
RULES: dict[str, list[tuple[re.Pattern[str], float]]] = {
    "confirmation": _rules(
        (r"thank(s| you) for (applying|your application|your interest)", 2),
        (r"(we('ve| have)? )?received your application", 3),
        (r"application (has been )?(received|submitted)", 3),
        (r"application confirmation", 3),
        (r"successfully (submitted|applied)", 3),
        (r"your application for", 1),
        (r"(we will|we'll|will be) review(ing)?", 1),
    ),
    "interview_invite": _rules(
        (r"\binterview", 2),
        (r"schedule (a|an|your|the) (call|chat|interview|time|meeting)", 3),
        (r"phone screen", 3),
        (r"(book|select|pick) a time|calendly", 2),
        (r"your availability|available times?", 2),
        (r"would (like|love) to (speak|meet|chat|talk)", 2),
        (r"invite you", 2),
        (r"next steps?", 1),
    ),
    "rejection": _rules(
        (r"unfortunately", 2),
        (r"not (be )?(moving|proceeding) forward", 3),
        (r"decided (to )?(move|proceed|go) forward with other", 3),
        (r"(pursue|proceed with) other candidates", 3),
        (r"other candidates", 2),
        (r"(were|was|have) not (been )?selected", 3),
        (r"regret to inform", 3),
        (r"position has been filled", 3),
        (r"no longer (under consideration|being considered)", 3),
    ),
    "offer": _rules(
        (r"offer letter", 3),
        (r"pleased to (offer|extend)", 3),
        (r"\bjob offer\b|offer of employment", 3),
        (r"extend (you )?an offer", 3),
        (r"compensation package|start date", 1),
    ),
    "recruiter": _rules(
        (r"came across your (profile|resume|background)", 3),
        (r"would you be (interested|open)", 2),
        (r"open to (new )?(opportunities|roles)", 2),
        (r"talent acquisition|technical recruiter|\brecruiter\b", 1.5),
        (r"reaching out", 1),
        (r"opportunity", 1),
    ),
}
_MIN_SCORE = 2.0


def classify(subject: str, sender: str, snippet: str) -> tuple[str, float]:
    """Classify an email as confirmation / interview_invite / recruiter / rejection / offer / other.

    Returns ``(category, confidence)`` where confidence is 0–1 and reflects both the strength of
    the evidence and the margin over the next most likely category.
    """
    text = f"{subject}\n{snippet}"
    scores = {cat: sum(w for pattern, w in rules if pattern.search(text)) for cat, rules in RULES.items()}
    if _sender_domain(sender).endswith(ATS_DOMAINS):
        scores["confirmation"] += 1  # applicant-tracking systems mostly send confirmations
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    (best, best_score), (_, runner_up) = ranked[0], ranked[1]
    if best_score < _MIN_SCORE:
        return "other", 0.0
    strength = 1 - 0.5 ** (best_score / 2)
    margin = (best_score - runner_up) / best_score
    return best, round(strength * (0.5 + 0.5 * margin), 2)


def _sender_domain(sender: str) -> str:
    address = parseaddr(sender)[1] or sender
    return address.rsplit("@", 1)[-1].lower().strip("> ")


def _squash(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


_COMPANY_SUFFIXES = re.compile(r"\b(inc|ltd|llc|corp|corporation|co|company|limited|group)\b\.?", re.IGNORECASE)


def match_application(applications: list[Application], sender: str, subject: str, snippet: str) -> Application | None:
    """Best application for an email: company in the sender's domain, or named in the subject/snippet."""
    domain = _squash(_sender_domain(sender).rsplit(".", 1)[0])
    text = _squash(f"{subject} {snippet}")
    best: tuple[int, datetime, Application] | None = None
    for app in applications:
        name = _squash(_COMPANY_SUFFIXES.sub("", app.company_name))
        if len(name) < 3:
            continue
        score = 2 if name in domain else 1 if name in text else 0
        if not score:
            continue
        key = (score, app.applied_at or app.created_at, app)
        if best is None or key[:2] > best[:2]:
            best = key
    return best[2] if best else None


# ---------------------------------------------------------------------------
# Mailbox fetchers (metadata + snippet only)
# ---------------------------------------------------------------------------


@dataclass
class FetchedEmail:
    provider_message_id: str
    from_address: str
    subject: str
    snippet: str
    received_at: datetime


def _get_json(url: str, token: str, params: dict[str, str | int | list[str]] | None = None) -> dict:
    resp = httpx.get(url, params=params, headers={"Authorization": f"Bearer {token}"}, timeout=oauth.HTTP_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def fetch_gmail(token: str) -> list[FetchedEmail]:
    base = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    listing = _get_json(base, token, {"q": GMAIL_JOB_QUERY, "maxResults": MAX_MESSAGES})
    out: list[FetchedEmail] = []
    for ref in listing.get("messages", []):
        msg = _get_json(f"{base}/{ref['id']}", token,
                        {"format": "metadata", "metadataHeaders": ["From", "Subject"]})
        headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
        received = datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, UTC).replace(tzinfo=None)
        out.append(FetchedEmail(provider_message_id=f"gmail:{msg['id']}", from_address=headers.get("from", ""),
                                subject=headers.get("subject", ""), snippet=msg.get("snippet", ""),
                                received_at=received))
    return out


def fetch_outlook(token: str) -> list[FetchedEmail]:
    since = (utcnow() - timedelta(days=30)).date().isoformat()
    search = (f'"(subject:application OR subject:interview OR subject:offer OR subject:\\"thank you for applying\\") '
              f'AND received>={since}"')
    data = _get_json("https://graph.microsoft.com/v1.0/me/messages", token, {
        "$search": search, "$top": MAX_MESSAGES, "$select": "id,subject,from,bodyPreview,receivedDateTime"})
    out: list[FetchedEmail] = []
    for msg in data.get("value", []):
        sender = msg.get("from", {}).get("emailAddress", {})
        received = datetime.fromisoformat(msg["receivedDateTime"].replace("Z", "+00:00")).astimezone(UTC)
        out.append(FetchedEmail(provider_message_id=f"outlook:{msg['id']}",
                                from_address=f"{sender.get('name', '')} <{sender.get('address', '')}>",
                                subject=msg.get("subject") or "", snippet=(msg.get("bodyPreview") or "")[:300],
                                received_at=received.replace(tzinfo=None)))
    return out


_FETCHERS = {"gmail": fetch_gmail, "outlook": fetch_outlook}


def _domain_for(company: str) -> str:
    return (_squash(_COMPANY_SUFFIXES.sub("", company)) or "company") + ".example.com"


def demo_emails(applications: list[Application]) -> list[FetchedEmail]:
    """A stable sample mailbox for demo applications (used in demo mode when no mailbox is connected).

    The three most recently submitted demo applications receive, in order, a confirmation, an
    interview invitation and a recruiter message, so repeated syncs see the same messages.
    """
    recent = sorted((a for a in applications if a.is_demo and a.applied_at), key=lambda a: a.applied_at, reverse=True)
    now = utcnow()
    makers = [
        lambda a: FetchedEmail(
            f"demo:{a.id}:confirmation", f"{a.company_name} Careers <no-reply@{_domain_for(a.company_name)}>",
            f"Thank you for applying to {a.company_name}",
            f"Hi, we have received your application for the {a.job_title} position. Our team will review it "
            "and contact you if your background matches our needs.", now - timedelta(hours=6)),
        lambda a: FetchedEmail(
            f"demo:{a.id}:interview", f"Talent Team <talent@{_domain_for(a.company_name)}>",
            f"{a.job_title}: let's schedule an interview",
            "Thanks for your interest! We'd like to schedule a 30-minute phone screen. Please share your "
            "availability for later this week.", now - timedelta(hours=3)),
        lambda a: FetchedEmail(
            f"demo:{a.id}:recruiter", f"Sarah Lindqvist <sarah@{_domain_for(a.company_name)}>",
            f"Quick question about the {a.job_title} role",
            f"Hi, I'm a technical recruiter at {a.company_name}. I came across your application. Would you be open "
            "to a quick chat about the team?", now - timedelta(hours=1)),
    ]
    return [make(app) for make, app in zip(makers, recent, strict=False)]


# ---------------------------------------------------------------------------
# Sync task
# ---------------------------------------------------------------------------

_STEPS = [
    ("connect", "Connecting to your mailbox"),
    ("fetch", "Searching for job-related emails"),
    ("classify", "Classifying messages"),
    ("match", "Matching emails to your applications"),
    ("update", "Updating your tracker"),
]


class _Progress:
    def __init__(self, db: Session, task: AgentTask):
        self.db, self.task = db, task

    def done(self, key: str, detail: str, count: int | None = None) -> None:
        now = utcnow().isoformat()
        self.task.steps = [
            {**s, "status": "done", "detail": detail, "count": count, "started_at": s.get("started_at") or now,
             "finished_at": now} if s["key"] == key else s
            for s in self.task.steps
        ]
        self.db.flush()

    def fail(self, message: str) -> None:
        """Mark the first unfinished step failed, skip the rest and fail the task."""
        failed = False
        steps = []
        for s in self.task.steps:
            if s["status"] != "done":
                s = {**s, "status": "skipped" if failed else "failed", "detail": None if failed else message}
                failed = True
            steps.append(s)
        self.task.steps = steps
        self.task.status, self.task.error, self.task.finished_at = AgentTaskStatus.failed, message, utcnow()


def _mailbox(db: Session, user: User) -> Integration | None:
    return db.scalar(select(Integration).where(Integration.user_id == user.id, Integration.status == "connected",
                                               Integration.provider.in_(EMAIL_PROVIDERS)))


def _change_status(db: Session, app: Application, status: ApplicationStatus, note: str) -> None:
    from app.services.application_status import change_status

    change_status(db, app, status, actor="email", note=note)


def _act_on(db: Session, user: User, msg: EmailMessage, app: Application | None) -> str | None:
    """Apply the email's effect. Returns a short description of what was done, or None."""
    company = app.company_name if app else (parseaddr(msg.from_address)[0] or "A company")
    link = f"/applications/{app.id}" if app else "/applications"
    if msg.category == "confirmation" and app and msg.confidence >= HIGH_CONFIDENCE \
            and app.status == ApplicationStatus.applied:
        _change_status(db, app, ApplicationStatus.confirmed, f"Confirmation email: “{msg.subject}”")
        return "status_confirmed"
    if msg.category == "rejection" and app and msg.confidence >= HIGH_CONFIDENCE and app.status not in _TERMINAL:
        _change_status(db, app, ApplicationStatus.rejected, f"Rejection email: “{msg.subject}”")
        return "status_rejected"
    if msg.category == "interview_invite":
        notify(db, user.id, "interview", f"{company} may want to schedule an interview",
               f"An email looks like an interview invitation: “{msg.subject}”. Reply from your inbox, then add the "
               "interview here so Applier can prepare you.", link=link, priority="high")
        return "notified"
    if msg.category == "offer":
        notify(db, user.id, "status_change", f"Possible offer from {company}",
               f"An email looks like a job offer: “{msg.subject}”. Review it, then update the application status "
               "if it's confirmed.", link=link, priority="high")
        return "notified"
    if msg.category == "recruiter":
        notify(db, user.id, "recruiter_response", f"Recruiter message from {company}",
               f"“{msg.subject}” — consider replying within a day or two.", link=link)
        return "notified"
    return None


def _process(db: Session, user: User, emails: list[FetchedEmail], progress: _Progress) -> dict[str, int]:
    seen = set(db.scalars(select(EmailMessage.provider_message_id).where(EmailMessage.user_id == user.id)))
    fresh = [e for e in emails if e.provider_message_id not in seen]
    classified = [(e, *classify(e.subject, e.from_address, e.snippet)) for e in fresh]
    job_related = [(e, cat, conf) for e, cat, conf in classified if cat in JOB_CATEGORIES]
    progress.done("classify", f"{len(job_related)} of {len(fresh)} new messages are job-related", len(job_related))

    applications = list(db.scalars(select(Application).where(Application.user_id == user.id)))
    stats = {"stored": 0, "matched": 0, "status_updates": 0, "notifications": 0}
    stored: list[tuple[EmailMessage, Application | None]] = []
    for email, category, confidence in job_related:
        app = match_application(applications, email.from_address, email.subject, email.snippet)
        msg = EmailMessage(user_id=user.id, application_id=app.id if app else None,
                           provider_message_id=email.provider_message_id, from_address=email.from_address[:320],
                           subject=email.subject[:500], snippet=email.snippet[:500], category=category,
                           confidence=confidence, received_at=email.received_at)
        db.add(msg)
        stored.append((msg, app))
        stats["stored"] += 1
        stats["matched"] += app is not None
    db.flush()
    progress.done("match", f"{stats['matched']} matched to applications", stats["matched"])

    for msg, app in stored:
        action = _act_on(db, user, msg, app)
        msg.processed = action is not None
        stats["status_updates"] += action in ("status_confirmed", "status_rejected")
        stats["notifications"] += action == "notified"
    progress.done("update", f"{stats['status_updates']} statuses updated, {stats['notifications']} notifications",
                  stats["status_updates"] + stats["notifications"])
    return stats


def _load_emails(db: Session, user: User, mailbox: Integration | None, progress: _Progress) -> list[FetchedEmail]:
    if mailbox is None:
        progress.done("connect", "Demo mailbox with sample emails (no mailbox connected)")
        applications = list(db.scalars(select(Application).where(Application.user_id == user.id)))
        emails = demo_emails(applications)
    else:
        provider = PROVIDERS[mailbox.provider]
        token = oauth.access_token(db, mailbox)
        progress.done("connect", f"{provider.name}" + (f" ({mailbox.account_label})" if mailbox.account_label else ""))
        emails = _FETCHERS[mailbox.provider](token)
    progress.done("fetch", f"{len(emails)} messages matched the job-related search", len(emails))
    return emails


def run_email_sync(db: Session, user: User) -> AgentTask:
    """Sync job-related emails into the tracker, recording progress on an ``email_sync`` agent task."""
    mailbox = _mailbox(db, user)
    if mailbox is None and not get_settings().demo_mode:
        raise AppError("Connect Gmail or Outlook in Settings → Integrations to sync job-related emails.",
                       code="no_mailbox")
    now = utcnow()
    task = AgentTask(user_id=user.id, kind="email_sync", title="Checking email for application updates",
                     status=AgentTaskStatus.running, trigger="user", started_at=now,
                     steps=[{"key": k, "label": label, "status": "pending", "detail": None, "count": None,
                             "started_at": None, "finished_at": None} for k, label in _STEPS])
    db.add(task)
    db.flush()
    progress = _Progress(db, task)
    try:
        emails = _load_emails(db, user, mailbox, progress)
        stats = _process(db, user, emails, progress)
    except (AppError, httpx.HTTPError, oauth.OAuthCallbackError) as exc:
        message = exc.message if isinstance(exc, AppError) else "We couldn't reach your mailbox. Please try again."
        log.warning("Email sync failed for user %s: %s", user.id, type(exc).__name__)
        progress.fail(message)
        if mailbox is not None:
            mailbox.last_error = message
        db.commit()
        return task
    task.status, task.finished_at, task.result = AgentTaskStatus.completed, utcnow(), stats
    if mailbox is not None:
        mailbox.last_sync_at, mailbox.last_error = task.finished_at, None
    audit.record(db, user.id, "email.synced",
                 f"Checked email: {stats['stored']} job-related messages found, {stats['status_updates']} application "
                 f"statuses updated", actor="agent", entity_type="agent_task", entity_id=task.id, details=stats)
    db.commit()
    return task
