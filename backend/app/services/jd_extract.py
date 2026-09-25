"""Job description analysis.

``extract_requirements`` turns a free-text job description into a ``JobRequirements`` dict:
required vs. preferred skills (by section), education, years of experience, certifications,
responsibilities, soft skills, work authorization, benefits and screening questions.

``infer_fields`` fills structured fields a posting often lacks (work arrangement, employment
type, experience level, salary) from the title, description and location.

Everything is deterministic and rule-based so results are explainable and reproducible.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services import taxonomy

# ---------------------------------------------------------------------------
# Section splitting
# ---------------------------------------------------------------------------

SECTION_HEADERS: dict[str, tuple[str, ...]] = {
    "preferred": (
        "nice to have", "nice-to-have", "nice to haves", "preferred", "preferred qualifications", "preferred skills",
        "assets", "asset", "bonus", "bonus points", "pluses", "good to have", "additional assets",
        "it would be great if", "extra credit",
    ),
    "requirements": (
        "requirements", "qualifications", "required qualifications", "minimum qualifications", "basic qualifications",
        "must have", "must-have", "must haves", "what you bring", "what you'll bring", "what you will bring",
        "what we're looking for", "what we are looking for", "who you are", "required skills", "skills and experience",
        "skills & experience", "you have", "about you", "your background", "key qualifications",
        "requirements and skills",
    ),
    "responsibilities": (
        "responsibilities", "key responsibilities", "what you'll do", "what you will do", "duties", "your role",
        "the role", "day to day", "day-to-day", "in this role", "what you'll be doing", "job duties", "your impact",
        "role overview",
    ),
    "benefits": (
        "benefits", "perks", "perks and benefits", "perks & benefits", "what we offer", "why join us",
        "why work with us",
        "compensation and benefits", "compensation & benefits", "we offer",
    ),
    "about": ("about us", "about the company", "who we are", "company overview", "our company", "about the team"),
    "apply": ("how to apply", "to apply", "application process", "next steps"),
    "questions": ("screening questions", "application questions", "questions"),
}

_HEADER_LOOKUP = {h: key for key, headers in SECTION_HEADERS.items() for h in headers}
_BULLET_RE = re.compile(r"^\s*(?:[-*•·▪◦‣–]|\d{1,2}[.)])\s+")
_HEADER_CLEAN_RE = re.compile(r"^[#*_\s]+|[*_\s]+$")


def _match_header(line: str) -> tuple[str | None, str]:
    """Return (section_key, trailing_content) when ``line`` is a section header."""
    text = _HEADER_CLEAN_RE.sub("", line.strip())
    if not text or len(text) > 120:
        return None, ""
    head, sep, rest = text.partition(":")
    candidate = head.strip().strip("*_ ").lower().rstrip("?!. ")
    if not sep and len(candidate.split()) > 6:
        return None, ""
    key = _HEADER_LOOKUP.get(candidate)
    if key is None and not sep:
        # e.g. "Requirements (must have)" / "Preferred Qualifications — Assets"
        first = re.split(r"\s*[(\-–—]\s*", candidate)[0]
        key = _HEADER_LOOKUP.get(first)
    return key, rest.strip() if key else ""


@dataclass
class Sections:
    """Description lines grouped by section. ``intro`` holds text before any known header."""

    parts: dict[str, list[str]] = field(default_factory=dict)

    def lines(self, *keys: str) -> list[str]:
        out: list[str] = []
        for k in keys:
            out.extend(self.parts.get(k, []))
        return out

    def text(self, *keys: str) -> str:
        return "\n".join(self.lines(*keys))

    def has(self, key: str) -> bool:
        return bool(self.parts.get(key))


def split_sections(description: str) -> Sections:
    sections = Sections()
    current = "intro"
    for raw_line in (description or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        key, rest = _match_header(line)
        if key:
            current = key
            if rest:
                sections.parts.setdefault(current, []).append(rest)
            continue
        sections.parts.setdefault(current, []).append(line)
    return sections


def _strip_bullet(line: str) -> str:
    return _BULLET_RE.sub("", line).strip()


def _sentences(text: str) -> list[str]:
    out: list[str] = []
    for line in text.splitlines():
        for s in re.split(r"(?<=[.!?])\s+(?=[A-Z])", _strip_bullet(line)):
            if s.strip():
                out.append(s.strip())
    return out


# ---------------------------------------------------------------------------
# Field extractors
# ---------------------------------------------------------------------------

_PREFERRED_HINT_RE = re.compile(
    r"\b(nice to have|nice-to-have|is an asset|are an asset|an asset|assets?\b|is a plus|a plus|bonus|preferred|"
    r"would be great|ideally|not required)\b", re.IGNORECASE)

_WORD_NUMBERS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
                 "ten": 10, "a": 1, "an": 1}
_NUM = r"(\d{1,2}(?:\.\d)?|one|two|three|four|five|six|seven|eight|nine|ten)"
_YEARS_PATTERNS = [
    # "2-4 years", "2 to 4 years", "2–4+ years"
    re.compile(rf"{_NUM}\s*\+?\s*(?:-|–|—|to)\s*{_NUM}\s*\+?\s*years?", re.IGNORECASE),
    # "minimum of 2 years", "at least one year", "min. 3 years"
    re.compile(rf"(?:minimum(?:\s+of)?|min\.?|at\s+least|no\s+less\s+than)\s*{_NUM}\s*\+?\s*years?", re.IGNORECASE),
    # "3+ years", "3 or more years", "5 plus years"
    re.compile(rf"{_NUM}\s*(?:\+|plus|or\s+more)\s*years?", re.IGNORECASE),
    # "2 years of experience"
    re.compile(rf"{_NUM}\s*years?\s*(?:of\s+)?(?:\w+\s+){{0,3}}experience", re.IGNORECASE),
]

EDUCATION_LEVELS = ["none", "diploma", "bachelor", "master", "phd"]
_EDU_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("phd", re.compile(r"\b(ph\.?\s?d|doctorate|doctoral)\b", re.IGNORECASE)),
    ("master", re.compile(r"\b(master'?s?|m\.?sc|mba|graduate degree)\b", re.IGNORECASE)),
    ("bachelor", re.compile(r"\b(bachelor'?s?|b\.?sc|b\.?eng|b\.?a\.?|undergraduate degree|university degree|"
                            r"degree in|four-year degree|4-year degree)\b", re.IGNORECASE)),
    ("diploma", re.compile(r"\b(diploma|college (?:program|diploma|certificate)|associate'?s? degree|post-secondary|"
                           r"postsecondary|two-year program|2-year program)\b", re.IGNORECASE)),
]

_AUTH_RE = re.compile(
    r"(legally (?:eligible|entitled|authori[sz]ed|able) to work|eligib\w* to work in|authori[sz]\w* to work|"
    r"work authori[sz]ation|valid work permit|work permit|(?:canadian|u\.?s\.?) citizen|permanent resident|"
    r"security clearance|visa sponsorship|sponsorship|right to work)", re.IGNORECASE)
_QUESTION_START_RE = re.compile(
    r"^(are|do|have|how|what|will|can|why|would|please (?:describe|explain|tell|provide)|describe|tell us|"
    r"which|is|when)\b", re.IGNORECASE)
_BENEFIT_RE = re.compile(
    r"\b(health|dental|vision|benefits|rrsp|pension|401\(?k\)?|vacation|paid time off|pto|flexible (?:hours|schedule)|"
    r"remote work|work from home|learning budget|training budget|professional development|parental leave|"
    r"stock options|equity|bonus program|wellness|employee assistance|tuition)\b", re.IGNORECASE)

_SOFT = {k for k, (cat, _) in taxonomy.SKILLS.items() if cat == "soft"}
_CERTS = {k for k, (cat, _) in taxonomy.SKILLS.items() if cat == "certifications"}


def _to_number(token: str) -> float:
    token = token.lower()
    return float(_WORD_NUMBERS[token]) if token in _WORD_NUMBERS else float(token)


def extract_years(text: str) -> tuple[float | None, float | None]:
    """Return (min_years, max_years) for the first experience requirement found in ``text``."""
    best: tuple[int, float, float | None] | None = None
    for i, pattern in enumerate(_YEARS_PATTERNS):
        for m in pattern.finditer(text or ""):
            window = text[m.start(): m.end() + 90].lower()
            if "experience" not in window and "exp" not in window and i != 3:
                continue
            lo = _to_number(m.group(1))
            hi = _to_number(m.group(2)) if i == 0 else None
            if lo > 30 or (hi is not None and hi > 40):
                continue
            if best is None or m.start() < best[0]:
                best = (m.start(), lo, hi)
    if best is None:
        return None, None
    return best[1], best[2]


def education_level_of(text: str | None) -> str | None:
    """Highest education level mentioned in ``text`` (e.g. a degree name)."""
    if not text:
        return None
    for level, pattern in _EDU_PATTERNS:
        if pattern.search(text):
            return level
    return None


def _education(sections: Sections, whole: str) -> tuple[str | None, list[str]]:
    source = sections.text("requirements", "intro") if sections.has("requirements") else whole
    lines = [s for s in _sentences(source) if any(p.search(s) for _, p in _EDU_PATTERNS)]
    levels = {lvl for line in lines for lvl, p in _EDU_PATTERNS if p.search(line)}
    # "Bachelor's degree or college diploma" -> the lowest acceptable level is what's required.
    level = next((lvl for lvl in EDUCATION_LEVELS if lvl in levels), None)
    return level, lines[:4]


def _split_skills(sections: Sections, whole: str) -> tuple[list[str], list[str]]:
    """Required vs. preferred skills, using section headers and "asset/nice to have" hints."""
    required_text_lines: list[str] = []
    preferred_text_lines = list(sections.lines("preferred"))
    base = sections.lines("requirements") if sections.has("requirements") else \
        sections.lines("intro", "responsibilities", "about")
    for sentence in (s for line in base for s in _sentences(line)):
        (preferred_text_lines if _PREFERRED_HINT_RE.search(sentence) else required_text_lines).append(sentence)
    if sections.has("requirements"):
        # Tools named only in responsibilities still matter, as preferred.
        preferred_text_lines.extend(sections.lines("responsibilities"))
    required = [s for s in taxonomy.extract_skills("\n".join(required_text_lines)) if s not in _SOFT]
    preferred = [s for s in taxonomy.extract_skills("\n".join(preferred_text_lines))
                 if s not in _SOFT and s not in required]
    if not required and not preferred:
        required = [s for s in taxonomy.extract_skills(whole) if s not in _SOFT]
    return required, preferred


def _work_authorization(whole: str) -> str | None:
    for sentence in _sentences(whole):
        if _AUTH_RE.search(sentence):
            return sentence[:300]
    return None


def _questions(sections: Sections, whole: str) -> list[str]:
    candidates = sections.lines("questions", "apply") or whole.splitlines()
    out: list[str] = []
    for line in candidates:
        q = _strip_bullet(line)
        if q.endswith("?") and _QUESTION_START_RE.match(q) and 10 <= len(q) <= 300 and q not in out:
            out.append(q)
    return out[:10]


def _section_items(lines: list[str]) -> list[str]:
    """Bullet items of a section; when a section mixes bullets and prose, trailing prose is ignored."""
    if any(_BULLET_RE.match(line) for line in lines):
        lines = [line for line in lines if _BULLET_RE.match(line)]
    return [_strip_bullet(line) for line in lines if len(_strip_bullet(line)) > 3]


def _benefits(sections: Sections) -> list[str]:
    items = _section_items(sections.lines("benefits"))
    if not items:
        items = [_strip_bullet(line) for line in sections.lines("intro", "about")
                 if _BENEFIT_RE.search(line) and len(line) < 200]
    return items[:12]


def _responsibilities(sections: Sections) -> list[str]:
    return _section_items(sections.lines("responsibilities"))[:12]


def extract_requirements(description: str, title: str = "") -> dict:
    """Structured extraction of a job description (matches ``schemas.jobs.JobRequirements``)."""
    description = description or ""
    whole = f"{title}\n{description}"
    sections = split_sections(description)
    required, preferred = _split_skills(sections, description)

    required_certs = [s for s in required if s in _CERTS]
    preferred_certs = [s for s in preferred if s in _CERTS]
    required = [s for s in required if s not in _CERTS]
    preferred = [s for s in preferred if s not in _CERTS] + preferred_certs

    req_text = sections.text("requirements") if sections.has("requirements") else description
    min_years, max_years = extract_years(req_text)
    if min_years is None and sections.has("requirements"):
        min_years, max_years = extract_years(description)
    level, edu_lines = _education(sections, description)
    all_skills = taxonomy.extract_skills(whole)
    technologies = [s for s in all_skills if s not in _SOFT and s not in _CERTS]
    keywords = list(dict.fromkeys(required + preferred + required_certs + technologies))[:25]

    return {
        "required_skills": required,
        "preferred_skills": preferred,
        "education": edu_lines,
        "education_level": level,
        "min_years_experience": min_years,
        "max_years_experience": max_years,
        "responsibilities": _responsibilities(sections),
        "technologies": technologies,
        "certifications": required_certs,
        "keywords": keywords,
        "soft_skills": [s for s in all_skills if s in _SOFT],
        "work_authorization": _work_authorization(description),
        "benefits": _benefits(sections),
        "questions": _questions(sections, description),
    }


# ---------------------------------------------------------------------------
# Inferred structured fields
# ---------------------------------------------------------------------------

_MONEY = r"(?:C\$|CA\$|CAD\s?\$?|US\$|USD\s?\$?|\$)\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([kK])?"
_SALARY_RANGE_RE = re.compile(rf"{_MONEY}(?:\s*(?:-|–|—|to)\s*(?:C\$|CA\$|CAD|US\$|USD|\$)?\s?(\d{{1,3}}(?:,\d{{3}})+"
                              rf"(?:\.\d+)?|\d+(?:\.\d+)?)\s*([kK])?)?")
_HOURLY_RE = re.compile(r"^\s*(?:CAD|USD)?\s*(?:/\s*(?:hour|hr|h)\b|per\s+hour|an\s+hour|hourly|/hr)", re.IGNORECASE)
_YEARLY_RE = re.compile(r"^\s*(?:CAD|USD)?\s*(?:/\s*(?:year|yr|annum)\b|per\s+(?:year|annum)|a\s+year|annually|"
                        r"yearly|annual)", re.IGNORECASE)


def _amount(number: str, k: str | None) -> float:
    value = float(number.replace(",", ""))
    return value * 1000 if k else value


def _whole(value: float) -> int:
    return int(value + 0.5)


def parse_salary(text: str) -> dict | None:
    """Find the first plausible salary in ``text``.

    Handles "$55,000 - $70,000", "$65k", "$25/hour", "CAD $80,000 per year", "$28.50 an hour".
    Returns ``{"salary_min", "salary_max", "salary_period", "currency"}`` or ``None``.
    """
    for m in _SALARY_RANGE_RE.finditer(text or ""):
        lo = _amount(m.group(1), m.group(2))
        hi = _amount(m.group(3), m.group(4) or m.group(2)) if m.group(3) else None
        tail = text[m.end(): m.end() + 30]
        head = text[max(0, m.start() - 40): m.start()].lower()
        if _HOURLY_RE.match(tail) or re.search(r"hourly|per hour", head):
            period = "hourly"
        elif _YEARLY_RE.match(tail) or lo >= 1000:
            period = "yearly"
        else:
            continue
        valid = (10 <= lo <= 500) if period == "hourly" else (15_000 <= lo <= 1_000_000)
        if not valid or (hi is not None and hi < lo):
            continue
        if re.search(r"bonus|fee|deposit|budget|stipend|allowance|signing", head[-25:] + tail[:15], re.IGNORECASE):
            continue
        token = m.group(0).upper()
        window = (text[max(0, m.start() - 6): m.end() + 8]).upper()
        currency = "USD" if ("US$" in token or "USD" in window) else "CAD" if (
            "C$" in token or "CA$" in token or "CAD" in window) else None
        return {"salary_min": _whole(lo), "salary_max": _whole(hi) if hi else None, "salary_period": period,
                "currency": currency}
    return None


_REMOTE_DESC_RE = re.compile(
    r"\b(fully remote|100% remote|remote[- ]first|remote position|remote role|remote opportunity|work remotely|"
    r"work from home|work-from-home|this is a remote|remote \(canada\)|remote within canada|remote across canada)\b",
    re.IGNORECASE)
_HYBRID_RE = re.compile(r"\bhybrid\b", re.IGNORECASE)
_ONSITE_RE = re.compile(r"\b(on-?site|in[- ]office|in[- ]person|office-based|on location)\b", re.IGNORECASE)

_EMPLOYMENT_RULES: list[tuple[str, re.Pattern[str], re.Pattern[str]]] = [
    # (type, title pattern, description pattern)
    ("internship", re.compile(r"\b(intern|internship)\b", re.I), re.compile(r"\binternship\b", re.I)),
    ("co_op", re.compile(r"\b(co-?op)\b", re.I), re.compile(r"\bco-?op (?:student|position|placement|term)\b", re.I)),
    ("contract", re.compile(r"\b(contract|contractor|freelance)\b", re.I),
     re.compile(r"\b(contract (?:role|position|opportunity|basis)|\d+[- ]month contract|fixed[- ]term|"
                r"contract[- ]to[- ]hire|term position)\b", re.I)),
    ("part_time", re.compile(r"\b(part[- ]time)\b", re.I), re.compile(r"\bpart[- ]time\b", re.I)),
    ("temporary", re.compile(r"\b(temporary|temp|seasonal)\b", re.I),
     re.compile(r"\b(temporary (?:role|position)|seasonal position)\b", re.I)),
    ("full_time", re.compile(r"\b(full[- ]time|permanent)\b", re.I),
     re.compile(r"\b(full[- ]time|permanent (?:role|position)|permanent,)\b", re.I)),
]

_LEVEL_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("lead", re.compile(r"\b(lead|principal|staff|head of|architect)\b", re.I)),
    ("senior", re.compile(r"\b(senior|sr\.?|iii)\b", re.I)),
    ("entry", re.compile(r"\b(entry[- ]level|new grad(?:uate)?|graduate|intern|co-?op|trainee)\b", re.I)),
    ("junior", re.compile(r"\b(junior|jr\.?|associate)\b", re.I)),
    ("intermediate", re.compile(r"\b(intermediate|mid[- ]level|mid|ii)\b", re.I)),
]


def _infer_arrangement(title: str, description: str, location: str) -> str | None:
    head = f"{title} {location}"
    if _HYBRID_RE.search(head):
        return "hybrid"
    if re.search(r"\bremote\b", head, re.I):
        return "remote"
    if _ONSITE_RE.search(head):
        return "onsite"
    if _HYBRID_RE.search(description):
        return "hybrid"
    if _REMOTE_DESC_RE.search(description):
        return "remote"
    if _ONSITE_RE.search(description):
        return "onsite"
    return None


def _infer_employment_type(title: str, description: str) -> str | None:
    for kind, title_re, _ in _EMPLOYMENT_RULES:
        if title_re.search(title):
            return kind
    for kind, _, desc_re in _EMPLOYMENT_RULES:
        if desc_re.search(description):
            return kind
    return None


def infer_experience_level(title: str, min_years: float | None = None) -> str | None:
    for level, pattern in _LEVEL_RULES:
        if pattern.search(title or ""):
            return level
    if min_years is None:
        return None
    if min_years < 1:
        return "entry"
    if min_years <= 2:
        return "junior"
    if min_years <= 4:
        return "intermediate"
    return "senior"


def infer_fields(title: str, description: str, location: str | None = None) -> dict:
    """Infer work arrangement, employment type, experience level and salary. Only found keys are returned."""
    title, description, location = title or "", description or "", location or ""
    out: dict = {}
    if arrangement := _infer_arrangement(title, description, location):
        out["work_arrangement"] = arrangement
    if employment := _infer_employment_type(title, description):
        out["employment_type"] = employment
    min_years, _ = extract_years(description)
    if level := infer_experience_level(title, min_years):
        out["experience_level"] = level
    if salary := parse_salary(description):
        out.update({k: v for k, v in salary.items() if v is not None})
    return out
