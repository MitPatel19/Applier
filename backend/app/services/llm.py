"""Optional AI writing assistance via the Claude API.

The application is fully functional without an API key: every caller has a
deterministic, template-based fallback. When ``APPLIER_ANTHROPIC_API_KEY`` is set, Claude
is used to polish wording (cover letters, bullet rewrites, follow-up messages).

Integrity guard: model output is never trusted blindly. ``unsupported_claims`` checks
generated text for skills/technologies that are *not* in the user's profile facts, and
callers discard any output that introduces them. The model is also instructed never to
invent experience, employers, credentials, metrics or skills.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.core.config import get_settings
from app.services import taxonomy

log = logging.getLogger("applier.llm")

INTEGRITY_RULES = (
    "Strict integrity rules: Use ONLY the facts provided about the candidate. Never invent or exaggerate "
    "experience, employers, job titles, dates, education, certifications, skills, technologies, achievements "
    "or metrics. You may improve wording, order and emphasis. If a fact is not provided, leave it out. "
    "Write in a natural, specific, human voice; avoid clichés such as 'I am writing to express my interest', "
    "'passionate', 'synergy', 'fast-paced environment', 'leverage', or 'dynamic'."
)


@lru_cache
def _client():
    key = get_settings().anthropic_api_key
    if not key:
        return None
    import anthropic

    return anthropic.Anthropic(api_key=key, max_retries=2, timeout=90.0)


def available() -> bool:
    return _client() is not None


def generate(system: str, prompt: str, *, max_tokens: int = 4000) -> str | None:
    """Return generated text, or ``None`` if AI is unavailable, refused, or failed.

    Callers must always have a non-AI fallback.
    """
    client = _client()
    if client is None:
        return None
    import anthropic

    try:
        response = client.beta.messages.create(
            model=get_settings().llm_model,
            max_tokens=max_tokens,
            system=f"{system}\n\n{INTEGRITY_RULES}",
            thinking={"type": "adaptive"},
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.RateLimitError:
        log.warning("Claude API rate limited; using template fallback")
        return None
    except anthropic.APIStatusError as e:
        log.warning("Claude API error %s; using template fallback", e.status_code)
        return None
    except anthropic.APIConnectionError:
        log.warning("Claude API unreachable; using template fallback")
        return None

    if response.stop_reason in ("refusal", "max_tokens"):
        return None
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    return text or None


def unsupported_claims(text: str, allowed_skills: set[str], job_skills: set[str] | None = None) -> list[str]:
    """Skills mentioned in ``text`` that the user does not have.

    Skills that appear in the job posting may be *named* (e.g. "your team uses Kotlin")
    in a cover letter, so they are only flagged when ``job_skills`` is not given.
    """
    allowed = taxonomy.expand_with_implied(allowed_skills)
    mentioned = set(taxonomy.extract_skills(text))
    soft = {k for k, (cat, _) in taxonomy.SKILLS.items() if cat == "soft"}
    suspicious = mentioned - allowed - soft
    if job_skills is not None:
        # A job skill the user lacks is still suspicious if the text claims it as the user's.
        suspicious = {s for s in suspicious if s not in job_skills or _claims_ownership(text, s)}
    return sorted(suspicious)


def _claims_ownership(text: str, skill: str) -> bool:
    import re

    for m in re.finditer(re.escape(skill), text, re.IGNORECASE):
        window = text[max(0, m.start() - 80): m.start()].lower()
        if any(p in window for p in ("i ", "my ", "i've", "i have", "experience with", "experience in", "skilled in",
                                      "proficient", "worked with", "built with", "using")):
            return True
    return False
