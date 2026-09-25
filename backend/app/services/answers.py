"""Prepare application question answers from profile facts.

Answers with legal or factual weight (work authorization, sponsorship, salary, relocation,
estimated years of experience) are flagged ``needs_confirmation`` so the user must confirm
them explicitly. Unknown facts are left blank — never guessed. Answers the user edited
(``source == "user"``) are always kept.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Application, ApplicationAnswer, Company, Job, Template
from app.services import taxonomy
from app.services.cover_letter import company_hook, fill_placeholders, placeholder_values
from app.services.profile_bundle import ProfileBundle
from app.services.resume_tailor import job_terms

_FUZZY_THRESHOLD = 0.62
_TOP_SKILLS = 3


@dataclass
class AnswerDraft:
    question: str
    answer: str = ""
    field_type: str = "text"
    options: list[str] = field(default_factory=list)
    required: bool = False
    source: str = "profile"
    needs_confirmation: bool = False


def normalize_question(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


def similarity(a: str, b: str) -> float:
    na, nb = normalize_question(a), normalize_question(b)
    ratio = SequenceMatcher(None, na, nb).ratio()
    wa, wb = set(na.split()), set(nb.split())
    jaccard = len(wa & wb) / len(wa | wb) if wa | wb else 0.0
    return max(ratio, jaccard)


def job_country(job: Job, bundle: ProfileBundle) -> str | None:
    if job.country:
        return job.country
    location = (job.location or "").lower()
    for country in ("Canada", "United States", "USA", "United Kingdom"):
        if country.lower() in location:
            return country
    return bundle.profile.country


def _authorization_answer(bundle: ProfileBundle, country: str | None) -> str:
    if not country:
        return ""
    target = country.lower()
    countries = [c.lower() for c in bundle.profile.authorized_countries or []]
    if countries:
        return "Yes" if target in countries else "No"
    if target in (bundle.profile.work_authorization or "").lower():
        return "Yes"
    return ""


def _format_years(value: float) -> str:
    return str(int(value)) if value == int(value) else f"{value:.1f}"


def _explicit_skill_years(bundle: ProfileBundle, skill: str) -> bool:
    return any(taxonomy.canonicalize(s.name) == skill and s.years is not None for s in bundle.skills)


def salary_text(bundle: ProfileBundle, application: Application) -> str:
    if application.salary_expectation:
        return application.salary_expectation
    p, prefs = bundle.profile, bundle.preferences
    amount, period, currency = p.desired_salary, p.salary_period, p.currency
    if amount is None and prefs.salary_min is not None:
        amount, period, currency = prefs.salary_min, prefs.salary_period, prefs.currency
    if amount is None:
        return ""
    unit = "per hour" if period == "hourly" else "per year"
    return f"${amount:,} {currency or 'CAD'} {unit}"


def _needs_relocation(job: Job, bundle: ProfileBundle) -> bool:
    city = (bundle.profile.city or "").strip().lower()
    return (job.work_arrangement in ("onsite", "hybrid") and bool(job.city) and bool(city)
            and job.city.strip().lower() != city)


def _relocation_answer(job: Job, bundle: ProfileBundle) -> str:
    targets = " ".join(bundle.preferences.target_locations or []).lower()
    return "Yes" if job.city and job.city.lower() in targets else ""


def _education_answer(bundle: ProfileBundle) -> str:
    ed = bundle.highest_education()
    if ed is None:
        return ""
    what = " in ".join(x for x in (ed.degree, ed.program) if x)
    return f"{what} — {ed.institution}" if what else ed.institution


def _interest_answer(bundle: ProfileBundle, job: Job, company: Company | None) -> str:
    terms = job_terms(job)
    skills = [s for s in terms.skills if s in bundle.skill_names_with_implied and taxonomy.category_of(s) != "soft"]
    parts: list[str] = []
    hook = company_hook(company, job)
    if hook:
        parts.append(hook)
    if skills:
        parts.append(f"The {job.title} role centres on {', '.join(skills[:3])}, which matches my experience"
                     + (f" as {bundle.experiences[0].position} at {bundle.experiences[0].company}."
                        if bundle.experiences else " in my projects."))
    else:
        parts.append(f"The {job.title} role is a good next step for the experience I've built so far.")
    return " ".join(parts)


def standard_drafts(bundle: ProfileBundle, job: Job, application: Application,
                    company: Company | None) -> list[AnswerDraft]:
    p = bundle.profile
    country = job_country(job, bundle)
    drafts = [
        AnswerDraft(f"Are you legally authorized to work in {country or 'the country of this job'}?",
                    _authorization_answer(bundle, country), "yes_no", ["Yes", "No"], required=True,
                    needs_confirmation=True),
        AnswerDraft("Will you now or in the future require sponsorship for employment visa status?",
                    {True: "Yes", False: "No"}.get(p.requires_sponsorship, ""), "yes_no", ["Yes", "No"],
                    required=True, needs_confirmation=True),
    ]
    terms = job_terms(job)
    skills = [s for s in terms.required or terms.skills if taxonomy.category_of(s) != "soft"][:_TOP_SKILLS]
    for skill in skills:
        years = bundle.years_with_skill(skill)
        drafts.append(AnswerDraft(
            f"How many years of experience do you have with {skill}?",
            _format_years(years) if years is not None else "", "number",
            needs_confirmation=years is None or not _explicit_skill_years(bundle, skill)))
    drafts.append(AnswerDraft("What are your salary expectations?", salary_text(bundle, application),
                              needs_confirmation=True))
    drafts.append(AnswerDraft("When are you available to start?", p.availability or ""))
    if _needs_relocation(job, bundle):
        drafts.append(AnswerDraft(f"Are you willing to relocate or commute to {job.location or job.city}?",
                                  _relocation_answer(job, bundle), "yes_no", ["Yes", "No"], needs_confirmation=True))
    for label, url in (("LinkedIn profile URL", p.linkedin_url), ("Portfolio URL", p.portfolio_url or p.website_url),
                       ("GitHub URL", p.github_url)):
        if url:
            drafts.append(AnswerDraft(label, url))
    education = _education_answer(bundle)
    if education:
        drafts.append(AnswerDraft("What is your highest level of education?", education))
    drafts.append(AnswerDraft(f"Why are you interested in {job.company_name}?",
                              _interest_answer(bundle, job, company), "textarea", source="generated"))
    return drafts


def _best_template(question: str, templates: list[Template]) -> Template | None:
    scored = [(similarity(question, t.question or t.name), t) for t in templates]
    best = max(scored, key=lambda st: st[0], default=None)
    return best[1] if best and best[0] >= _FUZZY_THRESHOLD else None


def _screening_drafts(job: Job, existing: list[AnswerDraft]) -> list[AnswerDraft]:
    questions = (job.requirements or {}).get("questions") or []
    out: list[AnswerDraft] = []
    for q in questions:
        q = str(q).strip()
        if q and all(similarity(q, d.question) < _FUZZY_THRESHOLD for d in [*existing, *out]):
            out.append(AnswerDraft(q, "", "textarea", required=True, source="generated"))
    return out


def _apply_templates(drafts: list[AnswerDraft], templates: list[Template], values: dict[str, str]) -> None:
    for draft in drafts:
        if draft.source != "generated":
            continue
        template = _best_template(draft.question, templates)
        if template:
            draft.answer = fill_placeholders(template.body, values)
            draft.source = "template"


def prepare_answers(db: Session, bundle: ProfileBundle, job: Job, application: Application) -> list[ApplicationAnswer]:
    """Replace agent-prepared answers (keeping user-edited ones) and return the full ordered list."""
    kept = [a for a in application.answers if a.source == "user"]
    for answer in list(application.answers):
        if answer.source != "user":
            application.answers.remove(answer)
    drafts = standard_drafts(bundle, job, application, job.company)
    drafts += _screening_drafts(job, drafts)
    templates = list(db.scalars(select(Template).where(Template.user_id == bundle.user.id,
                                                      Template.kind == "question")))
    if templates:
        _apply_templates(drafts, templates, placeholder_values(bundle, job))
    ordered: list[ApplicationAnswer] = []
    remaining = list(kept)
    for draft in drafts:
        user_answer = next((a for a in remaining if similarity(draft.question, a.question) >= _FUZZY_THRESHOLD), None)
        if user_answer is not None:
            remaining.remove(user_answer)
            ordered.append(user_answer)
            continue
        answer = ApplicationAnswer(
            question=draft.question, answer=draft.answer, field_type=draft.field_type, options=draft.options,
            required=draft.required, source=draft.source, needs_confirmation=draft.needs_confirmation,
            confirmed=False)
        application.answers.append(answer)
        ordered.append(answer)
    for order, answer in enumerate([*ordered, *remaining]):
        answer.sort_order = order
    db.flush()
    return sorted(application.answers, key=lambda a: a.sort_order)
