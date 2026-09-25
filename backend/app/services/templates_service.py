"""Reusable message templates: defaults, seeding and placeholder rendering."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Application, Job, Recruiter, Template, User, UserProfile
from app.services import taxonomy
from app.services.profile_bundle import ProfileBundle, load_bundle

PLACEHOLDERS = ("first_name", "full_name", "company", "job_title", "recruiter_name", "applied_date",
                "my_email", "my_phone", "top_skills")
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z_]+)\s*\}\}")

DEFAULT_TEMPLATES: list[dict[str, str | None]] = [
    {
        "kind": "cover_letter",
        "name": "Cover letter — professional",
        "subject": "Application for {{job_title}}",
        "question": None,
        "body": (
            "Dear Hiring Team at {{company}},\n\n"
            "I'm applying for the {{job_title}} role. The work described in the posting lines up closely with "
            "what I do best, particularly {{top_skills}}.\n\n"
            "[Add one or two sentences about a specific project or result that shows you can do this job.]\n\n"
            "[Add one sentence about why this team or company in particular appeals to you.]\n\n"
            "I'd welcome the chance to talk about how I could contribute. Thank you for your time and "
            "consideration.\n\n"
            "Sincerely,\n{{full_name}}\n{{my_email}} · {{my_phone}}"
        ),
    },
    {
        "kind": "cover_letter",
        "name": "Cover letter — short and direct",
        "subject": "{{job_title}} — {{full_name}}",
        "question": None,
        "body": (
            "Hello {{company}} team,\n\n"
            "I'd like to be considered for the {{job_title}} position. My recent work has centred on "
            "{{top_skills}}, and [add the one result you're proudest of].\n\n"
            "My resume is attached, and I'm happy to share code samples or walk through past projects.\n\n"
            "Thanks,\n{{full_name}}\n{{my_email}}"
        ),
    },
    {
        "kind": "question",
        "name": "Why this company?",
        "subject": None,
        "question": "Why do you want to work at {{company}}?",
        "body": (
            "What stood out to me about {{company}} is [something specific: a product, a value, a project]. "
            "The {{job_title}} role would let me build on my experience with {{top_skills}} while working on "
            "[the kind of problem the team solves]. I'm looking for a place where I can contribute from day one "
            "and keep growing, and this role fits that well."
        ),
    },
    {
        "kind": "question",
        "name": "Tell us about yourself",
        "subject": None,
        "question": "Tell us about yourself.",
        "body": (
            "I'm {{full_name}}. Most of my recent work has involved {{top_skills}}. [One sentence on your current "
            "or most recent role and what you delivered there.] [One sentence on a project you're proud of.] "
            "I'm now looking for a {{job_title}} role where I can [what you want to do next]."
        ),
    },
    {
        "kind": "question",
        "name": "Greatest strength",
        "subject": None,
        "question": "What is your greatest strength?",
        "body": (
            "My greatest strength is [strength — e.g. working through unfamiliar problems methodically]. "
            "For example, [a short, real situation where it made a difference, and the outcome]. "
            "In a {{job_title}} role, that would help me [how it applies to this job]."
        ),
    },
    {
        "kind": "follow_up",
        "name": "Follow-up after applying",
        "subject": "Following up on my {{job_title}} application",
        "question": None,
        "body": (
            "Hi {{recruiter_name}},\n\n"
            "I applied for the {{job_title}} position at {{company}} on {{applied_date}} and wanted to check in. "
            "I'm still very interested in the role, and my background in {{top_skills}} matches much of what the "
            "posting describes.\n\n"
            "If there's anything else I can send to help with your review, just let me know. Would you be able "
            "to share where things are in the process?\n\n"
            "Thank you,\n{{full_name}}\n{{my_email}} · {{my_phone}}"
        ),
    },
    {
        "kind": "follow_up",
        "name": "Check-in after an interview",
        "subject": "Checking in — {{job_title}}",
        "question": None,
        "body": (
            "Hi {{recruiter_name}},\n\n"
            "I hope your week is going well. I wanted to check in on the {{job_title}} role at {{company}}. "
            "I enjoyed our conversation and remain very interested.\n\n"
            "Is there an updated timeline for next steps? I'm glad to provide anything else you need.\n\n"
            "Best regards,\n{{full_name}}"
        ),
    },
    {
        "kind": "recruiter_message",
        "name": "Connection request to a recruiter",
        "subject": None,
        "question": None,
        "body": (
            "Hi {{recruiter_name}}, I noticed {{company}} is hiring for a {{job_title}}. I work mainly with "
            "{{top_skills}} and would appreciate connecting — I'd love to learn what the team looks for in this "
            "role. Thanks, {{first_name}}"
        ),
    },
    {
        "kind": "recruiter_message",
        "name": "Reply to recruiter outreach",
        "subject": "Re: {{job_title}} opportunity",
        "question": None,
        "body": (
            "Hi {{recruiter_name}},\n\n"
            "Thanks for reaching out about the {{job_title}} role at {{company}}. It sounds like a good fit for "
            "my experience with {{top_skills}}, and I'd be glad to learn more.\n\n"
            "I'm available [two or three time windows]. You can also reach me at {{my_phone}}.\n\n"
            "Best,\n{{full_name}}"
        ),
    },
    {
        "kind": "thank_you",
        "name": "Thank you after an interview",
        "subject": "Thank you — {{job_title}} interview",
        "question": None,
        "body": (
            "Hi {{recruiter_name}},\n\n"
            "Thank you for taking the time to speak with me about the {{job_title}} role. I especially enjoyed "
            "hearing about [a specific topic from the conversation], and it made me even more interested in "
            "joining {{company}}.\n\n"
            "[Optional: one sentence adding something you forgot to mention, or clarifying an answer.]\n\n"
            "I look forward to hearing about next steps.\n\n"
            "Best regards,\n{{full_name}}"
        ),
    },
]


def seed_defaults(db: Session, user_id: int) -> int:
    """Add the default templates for a user who has none. Returns how many were added. Caller commits."""
    if db.scalar(select(func.count(Template.id)).where(Template.user_id == user_id)):
        return 0
    for spec in DEFAULT_TEMPLATES:
        db.add(Template(user_id=user_id, is_default=True, **spec))
    db.flush()
    return len(DEFAULT_TEMPLATES)


@dataclass
class RenderContext:
    user: User
    profile: UserProfile | None
    application: Application | None = None
    job: Job | None = None
    recruiter: Recruiter | None = None


def top_matching_skills(bundle: ProfileBundle, job: Job | None, limit: int = 3) -> list[str]:
    """The user's skills that the job asks for (required first); otherwise their main technical skills."""
    mine = bundle.skill_names
    if job is not None:
        req = job.requirements or {}
        wanted = [*req.get("required_skills", []), *req.get("preferred_skills", []), *req.get("technologies", [])]
        matched = [s for s in dict.fromkeys(taxonomy.canonicalize(w) for w in wanted) if s in mine]
        if matched:
            return matched[:limit]
    technical = ("programming", "frameworks", "databases", "cloud", "devops")
    ordered = sorted((s for s in bundle.skills if s.category in technical), key=lambda s: technical.index(s.category))
    return list(dict.fromkeys(s.name for s in ordered))[:limit] or sorted(mine)[:limit]


def join_words(items: list[str]) -> str:
    """``a``, ``a and b``, ``a, b and c``."""
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _top_skills(db: Session, ctx: RenderContext) -> str | None:
    top = top_matching_skills(load_bundle(db, ctx.user), ctx.job)
    return join_words(top) if top else None


def format_date(value: date) -> str:
    """``September 24, 2026`` (accepts dates and datetimes)."""
    return f"{value:%B} {value.day}, {value.year}"


def _values(db: Session, ctx: RenderContext) -> dict[str, str | None]:
    app, job, rec = ctx.application, ctx.job, ctx.recruiter
    return {
        "first_name": ctx.user.full_name.split()[0] if ctx.user.full_name.strip() else None,
        "full_name": ctx.user.full_name or None,
        "company": ((app.company_name if app else None) or (job.company_name if job else None)
                    or (rec.company if rec else None)),
        "job_title": (app.job_title if app else None) or (job.title if job else None),
        "recruiter_name": rec.name.split()[0] if rec and rec.name else None,
        "applied_date": format_date(app.applied_at) if app and app.applied_at else None,
        "my_email": ctx.user.email,
        "my_phone": ctx.profile.phone if ctx.profile else None,
        "top_skills": _top_skills(db, ctx),
    }


def render_text(text: str | None, values: dict[str, str | None], unresolved: set[str]) -> str | None:
    if text is None:
        return None

    def sub(m: re.Match[str]) -> str:
        name = m.group(1)
        value = values.get(name)
        if not value:
            unresolved.add(name)
            return m.group(0)
        return value

    return _PLACEHOLDER_RE.sub(sub, text)


def render(db: Session, template: Template, ctx: RenderContext) -> tuple[str | None, str, list[str]]:
    """Fill placeholders. Returns (subject, body, unresolved placeholder names)."""
    if ctx.application is not None:
        ctx.job = ctx.job or ctx.application.job
        ctx.recruiter = ctx.recruiter or ctx.application.recruiter
    values = _values(db, ctx)
    unresolved: set[str] = set()
    subject = render_text(template.subject, values, unresolved)
    body = render_text(template.body, values, unresolved) or ""
    return subject, body, sorted(unresolved)
