"""Cover letter generation: professional, short (≤150 words) and personalized variants.

Letters are composed from real profile facts: the job's top requirements are mapped to
concrete bullets from the user's experience and projects. When Claude is configured it
writes the variants instead, but any output that claims skills outside the profile,
introduces numbers that aren't in the facts, or uses clichés is discarded in favour of the
deterministic letter.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from app.models import Company, Job, Template
from app.services import llm, taxonomy
from app.services.profile_bundle import ProfileBundle
from app.services.resume_tailor import (
    BANNED_PHRASES,
    JobTerms,
    align_terminology,
    job_terms,
    weak_opener_rewrite,
)

VARIANTS = ("professional", "short", "personalized")
SHORT_WORD_LIMIT = 150
_PLACEHOLDER_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")
_IRREGULAR_PAST = {"built", "led", "wrote", "ran", "made", "set", "took", "drove", "taught", "won", "grew", "cut",
                   "began", "brought", "kept", "sold", "spoke", "chose", "found", "gave", "held", "met", "put", "shot",
                   "troubleshot", "understood", "oversaw", "rebuilt", "rewrote"}
_START_WORDS = ("immediately", "in ", "on ", "from ", "after ", "with ", "within ", "as of", "any time", "anytime")


@dataclass
class Evidence:
    skill: str
    sentence: str


@dataclass
class CoverLetterDraft:
    variants: dict[str, str]
    generated_by: str  # template | ai


# ---------------------------------------------------------------------------
# Small text helpers
# ---------------------------------------------------------------------------


def _join(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}" if items else ""


def _lower_first(text: str) -> str:
    first = text.split(" ", 1)[0]
    if len(first) > 1 and (first[1].isupper() or first.isupper()):
        return text
    return text[:1].lower() + text[1:]


def _article(word: str) -> str:
    return "an" if word[:1].lower() in "aeiou" else "a"


def _is_past_verb(word: str) -> bool:
    w = word.lower()
    return w.endswith("ed") or w in _IRREGULAR_PAST


def _sentence(text: str) -> str:
    text = text.strip().rstrip(".;,")
    return f"{text}."


def word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'’-]+\b", text))


def has_cliche(text: str) -> bool:
    low = text.lower()
    return any(p in low for p in BANNED_PHRASES)


# ---------------------------------------------------------------------------
# Facts → evidence
# ---------------------------------------------------------------------------


@dataclass
class _Example:
    skill: str
    source: str  # company or project name
    kind: str  # experience | project
    text: str  # bullet (verb-first) or project description


def _clean_bullet(bullet: str, terms: JobTerms, user_skills: set[str]) -> str:
    text, _ = align_terminology(weak_opener_rewrite(bullet.strip()), set(terms.skills), user_skills)
    return text.rstrip(".;, ")


def _experience_example(bundle: ProfileBundle, skill: str, terms: JobTerms, used: set[str]) -> _Example | None:
    for e in bundle.experiences:
        for bullet in [*(e.achievements or []), *(e.responsibilities or []), *(e.metrics or [])]:
            if bullet not in used and skill in taxonomy.extract_skills(bullet):
                used.add(bullet)
                return _Example(skill, e.company, "experience", _clean_bullet(bullet, terms, bundle.skill_names))
    return None


def _project_example(bundle: ProfileBundle, skill: str, terms: JobTerms, used: set[str]) -> _Example | None:
    for p in bundle.projects:
        if p.name in used:
            continue
        bullets = [*(p.responsibilities or []), *(p.results or [])]
        in_text = next((b for b in bullets if skill in taxonomy.extract_skills(b)), None)
        if in_text or skill in taxonomy.normalize_set(p.technologies or []):
            used.add(p.name)
            if in_text and _is_past_verb(_clean_bullet(in_text, terms, bundle.skill_names).split(" ", 1)[0]):
                return _Example(skill, p.name, "project", _clean_bullet(in_text, terms, bundle.skill_names))
            techs = [t for t in p.technologies or [] if t][:3] or [skill]
            detail = f", {_article(p.description)} {_lower_first(p.description.strip().rstrip('.'))}," \
                if p.description else ""
            return _Example(skill, p.name, "project", f"built {p.name}{detail} using {_join(techs)}")
    return None


def _render_examples(examples: list[_Example]) -> list[Evidence]:
    """Turn examples into varied, natural sentences ("At X, I…", "I also…", "In my Y project, I…")."""
    out: list[Evidence] = []
    previous: str | None = None
    for ex in examples:
        verb_first = _is_past_verb(ex.text.split(" ", 1)[0])
        body = _lower_first(ex.text) if verb_first else ex.text
        if ex.kind == "project" and ex.text.startswith("built "):
            sentence = f"I also {body}" if previous else f"I {body}"
        elif ex.kind == "project":
            sentence = f"In my {ex.source} project, I {body}"
        elif not verb_first:
            sentence = f"One example from {ex.source}: {_lower_first(ex.text)}"
        elif previous == ex.source:
            sentence = f"I also {body}"
        else:
            sentence = f"At {ex.source}, I {body}"
        previous = ex.source if ex.kind == "experience" else "project"
        out.append(Evidence(skill=ex.skill, sentence=_sentence(sentence)))
    return out


def collect_evidence(bundle: ProfileBundle, terms: JobTerms, limit: int = 3) -> list[Evidence]:
    """Map the job's top requirements the user has to concrete examples from their own history."""
    examples: list[_Example] = []
    used: set[str] = set()
    for skill in [s for s in terms.skills if s in bundle.skill_names_with_implied]:
        if len(examples) >= limit:
            break
        found = _experience_example(bundle, skill, terms, used) or _project_example(bundle, skill, terms, used)
        if found:
            examples.append(found)
    examples.sort(key=lambda ex: ex.kind != "experience")  # work history first, then projects
    return _render_examples(examples)


_LABEL_FACT_RE = re.compile(r"^[A-Z][A-Za-z ]{1,40}:\s")
_MIN_FACT_WORDS = 6


def _letter_worthy_fact(company: Company) -> str | None:
    """A verified, sentence-like fact (not a label such as "Industry: Software" or posting statistics)."""
    for fact in company.facts or []:
        text = (fact.get("text") or "").strip()
        if (fact.get("kind") == "verified" and fact.get("source") != "Job postings" and not _LABEL_FACT_RE.match(text)
                and word_count(text) >= _MIN_FACT_WORDS and not has_cliche(text)):
            return text
    return None


def company_hook(company: Company | None, job: Job) -> str | None:
    """A specific, verified detail about the company (never an opinion or an inference)."""
    if company is not None:
        product = next((p for p in company.products or [] if not has_cliche(p)), None)
        if product:
            return _sentence(f"{company.name}'s work on {product} is a big part of why this role appeals to me")
        fact = _letter_worthy_fact(company)
        if fact:
            return _sentence(f"What I read about {company.name} — “{fact.rstrip('.')}” — is a big part of why this "
                             "role appeals to me")
    responsibilities = (job.requirements or {}).get("responsibilities") or []
    if responsibilities and not has_cliche(responsibilities[0]):
        return _sentence(f"The posting's focus on {_lower_first(responsibilities[0].rstrip('.'))} is the kind of "
                         f"work I want to be doing")
    return None


def _education_sentence(bundle: ProfileBundle) -> str | None:
    ed = bundle.highest_education()
    if ed is None or not (ed.degree or ed.program):
        return None
    what = " in ".join(x for x in (ed.degree, ed.program) if x)
    if ed.end_date and ed.end_date > date.today():
        return f"I'm completing {_article(what)} {what} at {ed.institution} (expected {ed.end_date:%B %Y})."
    return f"I hold {_article(what)} {what} from {ed.institution}."


def _availability_clause(bundle: ProfileBundle) -> str:
    availability = (bundle.profile.availability or "").strip().rstrip(".")
    if not availability:
        return ""
    if availability.lower().startswith(_START_WORDS):
        return f" I can start {_lower_first(availability)}."
    return f" My availability: {availability}."


# ---------------------------------------------------------------------------
# Deterministic letters
# ---------------------------------------------------------------------------


@dataclass
class _Facts:
    name: str
    signature: str
    company: str
    title: str
    skills: list[str]
    evidence: list[Evidence]
    context: str
    education: str | None
    availability: str
    hook: str | None


def _facts(bundle: ProfileBundle, job: Job, company: Company | None) -> _Facts:
    terms = job_terms(job)
    latest = bundle.experiences[0] if bundle.experiences else None
    contact = " · ".join(x for x in (bundle.profile.phone, bundle.user.email) if x)
    return _Facts(
        name=bundle.user.full_name,
        signature=f"Sincerely,\n{bundle.user.full_name}" + (f"\n{contact}" if contact else ""),
        company=job.company_name,
        title=job.title,
        skills=[s for s in terms.skills if s in bundle.skill_names_with_implied and taxonomy.category_of(s) != "soft"],
        evidence=collect_evidence(bundle, terms),
        context=f" as {_article(latest.position)} {latest.position} at {latest.company}" if latest else "",
        education=_education_sentence(bundle),
        availability=_availability_clause(bundle),
        hook=company_hook(company, job),
    )


def _opening(f: _Facts) -> str:
    opener = f"I'm applying for the {f.title} role at {f.company}."
    if f.skills and f.evidence:
        return (f"{opener} The role calls for {_join(f.skills[:2])}, which lines up with what I've been "
                f"doing{f.context}.")
    if f.skills:
        return f"{opener} I'd bring hands-on experience with {_join(f.skills[:3])} to the team."
    return opener


def _evidence_paragraph(f: _Facts) -> str | None:
    if not f.evidence:
        return None
    extra = [s for s in f.skills if s not in {e.skill for e in f.evidence}][:3]
    tail = f" I'm comfortable with {_join(extra)} as well." if extra else ""
    return " ".join(e.sentence for e in f.evidence) + tail


def _closing(f: _Facts) -> str:
    return (f"I'd welcome the chance to talk about how I can help {f.company}.{f.availability} "
            "Thank you for considering my application.")


def _letter(paragraphs: list[str | None], f: _Facts) -> str:
    body = [p for p in paragraphs if p]
    return "\n\n".join([f"Dear Hiring Team at {f.company},", *body, f.signature])


def professional_letter(f: _Facts) -> str:
    return _letter([_opening(f), _evidence_paragraph(f), f.education, _closing(f)], f)


def personalized_letter(f: _Facts) -> str:
    return _letter([_opening(f), f.hook, _evidence_paragraph(f), f.education, _closing(f)], f)


def short_letter(f: _Facts) -> str:
    closing = f"I'd welcome a conversation about how I can help your team.{f.availability}"
    for count in range(len(f.evidence), -1, -1):
        middle = " ".join(e.sentence for e in f.evidence[:count]) or None
        text = _letter([f"I'm applying for the {f.title} role at {f.company}.", middle, closing], f)
        if word_count(text) <= SHORT_WORD_LIMIT:
            return text
    return text


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


def fill_placeholders(body: str, values: dict[str, str]) -> str:
    """Replace ``{{placeholder}}`` tokens; unknown placeholders are removed rather than left visible."""
    filled = _PLACEHOLDER_RE.sub(lambda m: values.get(m.group(1), ""), body)
    return re.sub(r"[ \t]{2,}", " ", filled).strip()


def placeholder_values(bundle: ProfileBundle, job: Job, f: _Facts | None = None) -> dict[str, str]:
    f = f or _facts(bundle, job, None)
    full_name = bundle.user.full_name
    return {
        "first_name": full_name.split()[0] if full_name else "",
        "full_name": full_name,
        "company": job.company_name,
        "job_title": job.title,
        "recruiter_name": "Hiring Team",
        "applied_date": date.today().strftime("%B %-d, %Y"),
        "my_email": bundle.user.email,
        "my_phone": bundle.profile.phone or "",
        "top_skills": _join(f.skills[:3]),
        "evidence": _evidence_paragraph(f) or "",
        "company_fact": f.hook or "",
    }


# ---------------------------------------------------------------------------
# AI (optional) with integrity guard
# ---------------------------------------------------------------------------

_VARIANT_BRIEFS = {
    "professional": "a professional cover letter of 220-320 words",
    "short": f"a short cover letter of at most {SHORT_WORD_LIMIT} words",
    "personalized": "a personalized cover letter of 220-320 words that references one verified company fact",
}


def _facts_text(bundle: ProfileBundle, job: Job, company: Company | None) -> str:
    lines = [f"Candidate: {bundle.user.full_name}. Headline: {bundle.profile.headline or 'n/a'}.",
             f"Skills: {', '.join(sorted(bundle.skill_names))}."]
    for e in bundle.experiences:
        lines.append(f"Role: {e.position} at {e.company} ({e.start_date or '?'} to {e.end_date or 'present'}).")
        lines += [f"- {b}" for b in [*(e.responsibilities or []), *(e.achievements or []), *(e.metrics or [])]]
    for p in bundle.projects:
        lines.append(f"Project: {p.name} — {p.description or ''} ({', '.join(p.technologies or [])}).")
        lines += [f"- {b}" for b in [*(p.responsibilities or []), *(p.results or [])]]
    for ed in bundle.educations:
        lines.append(f"Education: {ed.degree or ''} {ed.program or ''}, {ed.institution}.")
    if bundle.profile.availability:
        lines.append(f"Availability: {bundle.profile.availability}.")
    facts = [f.get("text", "") for f in (company.facts if company else []) or [] if f.get("kind") == "verified"]
    lines.append(f"Job: {job.title} at {job.company_name}.\nPosting:\n{(job.description or '')[:3000]}")
    if facts:
        lines.append("Verified company facts: " + " | ".join(facts))
    return "\n".join(lines)


def profile_fact_skills(bundle: ProfileBundle) -> set[str]:
    """Skills the user lists or that their own experience/project text mentions."""
    texts = [bundle.profile.headline or "", bundle.profile.summary or ""]
    for e in bundle.experiences:
        texts += [*(e.responsibilities or []), *(e.achievements or []), *(e.metrics or [])]
    for p in bundle.projects:
        texts += [p.description or "", *(p.responsibilities or []), *(p.results or [])]
    return bundle.skill_names | set(taxonomy.extract_skills("\n".join(texts)))


def ai_letter_is_safe(text: str, bundle: ProfileBundle, job_skills: set[str], source_text: str, variant: str) -> bool:
    if not text or has_cliche(text):
        return False
    if llm.unsupported_claims(text, profile_fact_skills(bundle), job_skills):
        return False
    if not set(re.findall(r"\d+", text)) <= set(re.findall(r"\d+", source_text)):
        return False
    return variant != "short" or word_count(text) <= SHORT_WORD_LIMIT


def _ai_variants(bundle: ProfileBundle, job: Job, company: Company | None) -> dict[str, str]:
    if not llm.available():
        return {}
    facts = _facts_text(bundle, job, company)
    source = f"{facts}\n{bundle.profile.phone or ''}"
    job_skills = set(job_terms(job).skills)
    out: dict[str, str] = {}
    for variant, brief in _VARIANT_BRIEFS.items():
        text = llm.generate(
            "You write specific, plain-spoken cover letters from verified facts only.",
            f"Write {brief} for this candidate. Map the job's top 2-3 requirements to concrete examples from the "
            "candidate's roles or projects. Start with 'Dear Hiring Team at <company>,' and end with 'Sincerely,' "
            f"and the candidate's name. Plain text only.\n\n{facts}",
            max_tokens=1500,
        )
        if text and ai_letter_is_safe(text, bundle, job_skills, source, variant):
            out[variant] = text.strip()
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate(bundle: ProfileBundle, job: Job, company: Company | None,
             template: Template | None = None) -> CoverLetterDraft:
    f = _facts(bundle, job, company)
    variants: dict[str, str] = {
        "professional": professional_letter(f),
        "short": short_letter(f),
        "personalized": personalized_letter(f),
    }
    if template is not None:
        variants["professional"] = fill_placeholders(template.body, placeholder_values(bundle, job, f))
        return CoverLetterDraft(variants=variants, generated_by="template")
    ai = _ai_variants(bundle, job, company)
    variants.update(ai)
    return CoverLetterDraft(variants=variants, generated_by="ai" if ai else "template")


def generate_variants(bundle: ProfileBundle, job: Job, company: Company | None,
                      template: Template | None = None) -> dict[str, str]:
    return generate(bundle, job, company, template).variants
