"""Networking messages written from real context: the contact, the role and the user's matching skills."""

from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import Application, Job, Recruiter, User
from app.schemas.common import GeneratedText
from app.services import llm, taxonomy
from app.services.profile_bundle import ProfileBundle, load_bundle
from app.services.templates_service import format_date, join_words, top_matching_skills

PURPOSE_LABELS = {
    "introduction": "introduction",
    "follow_up": "follow-up",
    "thank_you": "thank-you",
    "referral_request": "referral request",
    "informational_interview": "informational interview request",
}


@dataclass
class MessageContext:
    first_name: str
    full_name: str
    contact_first: str
    contact_title: str | None
    company: str | None
    role: str | None
    applied_on: str | None
    skills: list[str]
    background: str | None
    extra: str | None


def _background(bundle: ProfileBundle) -> str | None:
    if bundle.experiences:
        latest = bundle.experiences[0]
        verb = "I'm" if latest.end_date is None else "I was most recently"
        return f"{verb} a {latest.position} at {latest.company}"
    if bundle.profile.headline:
        return f"I'm a {bundle.profile.headline.split('·')[0].strip()}"
    return None


def build_context(bundle: ProfileBundle, recruiter: Recruiter, application: Application | None, job: Job | None,
                  extra: str | None) -> MessageContext:
    job = job or (application.job if application else None)
    user: User = bundle.user
    return MessageContext(
        first_name=user.full_name.split()[0] if user.full_name.strip() else user.full_name,
        full_name=user.full_name,
        contact_first=recruiter.name.split()[0],
        contact_title=recruiter.title,
        company=(recruiter.company or (application.company_name if application else None)
                 or (job.company_name if job else None)),
        role=(application.job_title if application else None) or (job.title if job else None),
        applied_on=format_date(application.applied_at) if application and application.applied_at else None,
        skills=top_matching_skills(bundle, job),
        background=_background(bundle),
        extra=extra.strip() if extra and extra.strip() else None,
    )


def _skills_line(ctx: MessageContext) -> str:
    return f"most of my recent work has been with {join_words(ctx.skills)}" if ctx.skills else ""


def _intro_sentence(ctx: MessageContext) -> str:
    parts = [p for p in (ctx.background, _skills_line(ctx)) if p]
    if not parts:
        return ""
    sentence = ", and ".join(parts) if len(parts) == 2 else parts[0]
    return sentence[0].upper() + sentence[1:] + "."


def _role_phrase(ctx: MessageContext) -> str:
    if ctx.role and ctx.company:
        return f"the {ctx.role} role at {ctx.company}"
    if ctx.role:
        return f"the {ctx.role} role"
    return f"opportunities at {ctx.company}" if ctx.company else "opportunities on your team"


def _compose(ctx: MessageContext, purpose: str) -> tuple[str | None, list[str]]:
    role = _role_phrase(ctx)
    intro = _intro_sentence(ctx)
    if purpose == "introduction":
        return (f"Introduction — {ctx.role}" if ctx.role else "Introduction"), [
            f"I came across {role} and wanted to introduce myself. {intro}".strip(),
            "If you're the right person to talk to about it, I'd appreciate a few minutes of your time. If not, "
            "I'd be grateful if you could point me to the right person.",
        ]
    if purpose == "follow_up":
        applied = f", which I applied for on {ctx.applied_on}" if ctx.applied_on else ""
        strength = (f" My background in {join_words(ctx.skills[:2])} lines up well with what the team needs."
                    if ctx.skills else "")
        return (f"Following up — {ctx.role}" if ctx.role else "Following up"), [
            f"I wanted to follow up on {role}{applied}. I'm still very interested.{strength}",
            "Is there any update you can share on the timeline or next steps? Happy to send anything that would help.",
        ]
    if purpose == "thank_you":
        return "Thank you for your time", [
            f"Thank you for taking the time to talk with me about {role}. I enjoyed the conversation, and it "
            "made me even more interested in the position.",
            "Please let me know if there's anything else I can provide. I look forward to hearing about next steps.",
        ]
    if purpose == "referral_request":
        where = f" at {ctx.company}" if ctx.company else ""
        return (f"Referral for {ctx.role}?" if ctx.role else "Quick question"), [
            f"I'm interested in {role}. {intro}".strip(),
            f"Since you know the team{where}, would you be comfortable referring me, or sharing what they look for "
            "in candidates? I'm happy to send my resume and a short summary to make it easy. No pressure at all if "
            "it's not a fit.",
        ]
    title = f"{ctx.contact_title} " if ctx.contact_title else ""
    where = f" at {ctx.company}" if ctx.company else ""
    return "Would you be open to a short chat?", [
        f"I'm exploring {role} and would value your perspective. {intro}".strip(),
        f"Would you be open to a 15–20 minute call in the next couple of weeks? I'd like to hear how you approach "
        f"your {title}work{where} and what the team values most. I'll keep it brief and work around your schedule.",
    ]


def template_message(ctx: MessageContext, purpose: str) -> GeneratedText:
    subject, paragraphs = _compose(ctx, purpose)
    if ctx.extra:
        paragraphs.insert(1, ctx.extra)
    body = f"Hi {ctx.contact_first},\n\n" + "\n\n".join(paragraphs) + f"\n\nThanks,\n{ctx.full_name}"
    return GeneratedText(subject=subject, body=body, generated_by="template")


def _numbers(text: str) -> set[str]:
    return set(re.findall(r"\d+(?:\.\d+)?", text))


def polish_message(draft: GeneratedText, bundle: ProfileBundle, job: Job | None) -> GeneratedText:
    """Optional Claude rewording; discarded if it adds skills or numbers that aren't in the draft."""
    if not llm.available():
        return draft
    job_skills = taxonomy.normalize_set([*(job.requirements or {}).get("required_skills", [])]) if job else set()
    text = llm.generate(
        "You edit short professional messages (networking and follow-up emails) for a job seeker.",
        "Improve the flow of this message while keeping it concise (no longer than the original), warm and "
        "specific. Keep the greeting and sign-off, keep every fact exactly as written and add no new facts. "
        f"Return only the message body.\n\n{draft.body}",
        max_tokens=800,
    )
    if (not text or not _numbers(text) <= _numbers(draft.body)
            or llm.unsupported_claims(text, bundle.skill_names, job_skills)):
        return draft
    return GeneratedText(subject=draft.subject, body=text.strip(), generated_by="ai")


def generate_message(db: Session, user: User, recruiter: Recruiter, purpose: str, *,
                     application: Application | None = None, job: Job | None = None,
                     extra_context: str | None = None) -> GeneratedText:
    bundle = load_bundle(db, user)
    ctx = build_context(bundle, recruiter, application, job, extra_context)
    return polish_message(template_message(ctx, purpose), bundle, job or (application.job if application else None))
