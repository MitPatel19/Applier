"""Follow-up reminders: serialization, suggestions and follow-up email drafting."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Application, ApplicationStatus, FollowUp, Recruiter, User, utcnow
from app.schemas.common import GeneratedText
from app.schemas.tracking import FollowUpOut, FollowUpSuggestion
from app.services import taxonomy
from app.services.networking import polish_message
from app.services.profile_bundle import ProfileBundle, load_bundle
from app.services.templates_service import format_date, top_matching_skills

FOLLOW_UP_AFTER = timedelta(days=7)
# Statuses meaning "submitted, but no human response yet" (an automated confirmation isn't a response).
AWAITING_RESPONSE = (ApplicationStatus.applied, ApplicationStatus.confirmed)


def followups_out(db: Session, items: list[FollowUp]) -> list[FollowUpOut]:
    """Serialize follow-ups with company/job/contact names (two batched lookups, no N+1)."""
    app_ids = {f.application_id for f in items if f.application_id}
    rec_ids = {f.recruiter_id for f in items if f.recruiter_id}
    apps = {a.id: a for a in db.scalars(select(Application).where(Application.id.in_(app_ids)))} if app_ids else {}
    recs = {r.id: r for r in db.scalars(select(Recruiter).where(Recruiter.id.in_(rec_ids)))} if rec_ids else {}
    now = utcnow()
    out = []
    for f in items:
        app, rec = apps.get(f.application_id or 0), recs.get(f.recruiter_id or 0)
        item = FollowUpOut.model_validate(f)
        item.company_name = app.company_name if app else (rec.company if rec else None)
        item.job_title = app.job_title if app else None
        item.recruiter_name = rec.name if rec else None
        item.is_overdue = f.status == "pending" and f.due_at < now
        out.append(item)
    return out


def followup_out(db: Session, item: FollowUp) -> FollowUpOut:
    return followups_out(db, [item])[0]


def suggestions(db: Session, user: User) -> list[FollowUpSuggestion]:
    """Applications sent at least 7 days ago with no response and no pending follow-up."""
    cutoff = utcnow() - FOLLOW_UP_AFTER
    pending = select(FollowUp.application_id).where(FollowUp.user_id == user.id, FollowUp.status == "pending",
                                                    FollowUp.application_id.is_not(None))
    apps = db.scalars(select(Application).where(
        Application.user_id == user.id, Application.status.in_(AWAITING_RESPONSE),
        Application.applied_at.is_not(None), Application.applied_at <= cutoff, Application.id.not_in(pending),
    ).order_by(Application.applied_at))
    out = []
    for app in apps:
        assert app.applied_at is not None
        due = app.applied_at + FOLLOW_UP_AFTER
        out.append(FollowUpSuggestion(
            application_id=app.id, suggested_due_at=due,
            reason=(f"Applied {app.applied_at:%B} {app.applied_at.day} → follow up around {due:%B} {due.day}. "
                    f"No response from {app.company_name} yet for the {app.job_title} role."),
        ))
    return out


def strength_sentence(bundle: ProfileBundle, application: Application | None) -> str | None:
    """One relevant, true strength: a matching skill and where the user actually used it."""
    skills = top_matching_skills(bundle, application.job if application else None, limit=1)
    if not skills:
        return None
    skill = skills[0]
    for exp in bundle.experiences:
        if skill in taxonomy.normalize_set(exp.technologies or []):
            return (f"In my role as {exp.position} at {exp.company} I worked extensively with {skill}, which lines "
                    "up closely with what the posting describes.")
    for project in bundle.projects:
        if skill in taxonomy.normalize_set(project.technologies or []):
            return f"I recently used {skill} to build {project.name}, which is closely related to this role."
    return f"My background in {skill} matches a key part of what the posting describes."


def draft_follow_up(bundle: ProfileBundle, application: Application | None,
                    recruiter: Recruiter | None) -> GeneratedText:
    user = bundle.user
    greeting = f"Hi {recruiter.name.split()[0]}," if recruiter else "Hello,"
    if application:
        applied = f" on {format_date(application.applied_at)}" if application.applied_at else ""
        subject = f"Following up on my {application.job_title} application"
        opening = (f"I applied for the {application.job_title} position at {application.company_name}{applied} and "
                   "wanted to follow up. I'm still very interested in the role.")
        ask = ("If it would help, I'm happy to share more about my background or answer any questions. Could you "
               "let me know where things stand in the process?")
    else:
        subject = "Following up"
        opening = "I wanted to follow up on our recent conversation and thank you again for your time."
        ask = "Please let me know if there's anything I can send over, and I look forward to staying in touch."
    paragraphs = [opening, strength_sentence(bundle, application), ask]
    contact = " · ".join(x for x in [user.email, bundle.profile.phone] if x)
    body = (f"{greeting}\n\n" + "\n\n".join(p for p in paragraphs if p)
            + f"\n\nThank you for your time,\n{user.full_name}\n{contact}")
    return GeneratedText(subject=subject, body=body, generated_by="template")


def generate_message(db: Session, user: User, item: FollowUp) -> GeneratedText:
    """Draft (and save on the follow-up) a professional follow-up email. Caller commits."""
    application = db.get(Application, item.application_id) if item.application_id else None
    recruiter = db.get(Recruiter, item.recruiter_id) if item.recruiter_id else None
    if recruiter is None and application is not None:
        recruiter = application.recruiter
    bundle = load_bundle(db, user)
    message = polish_message(draft_follow_up(bundle, application, recruiter), bundle,
                             application.job if application else None)
    item.subject, item.message = message.subject, message.body
    return message
