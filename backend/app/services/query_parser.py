"""Natural-language job search → structured ``SearchFilters``.

"Find junior Python and Java developer jobs in Thunder Bay and remote Canada, posted within the
last 7 days, paying at least $55,000." becomes roles, keywords, levels, locations, remote regions,
recency and salary filters, plus interpretation chips the user reviews before running the search
and warnings for anything that wasn't understood.

The parser consumes recognized phrases from a working copy of the text so that whatever is left
over can be reported back honestly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.models import UserPreference
from app.schemas.jobs import Interpretation, ParsedQuery, SearchFilters
from app.services import taxonomy
from app.services.jd_extract import parse_salary
from app.services.location import CITIES, COUNTRIES, PROVINCES, US_STATES, parse_location

LEVEL_PATTERNS: list[tuple[str, str]] = [
    ("entry", r"entry[- ]level|new[- ]grad(?:uate)?s?|recent graduates?|graduate"),
    ("junior", r"junior|jr\.?"),
    ("intermediate", r"intermediate|mid[- ]level|mid[- ]senior|mid"),
    ("senior", r"senior|sr\.?"),
    ("lead", r"lead|principal|staff"),
]
LEVEL_LABELS = {"entry": "Entry level", "junior": "Junior", "intermediate": "Intermediate", "senior": "Senior",
                "lead": "Lead"}
JOB_TYPE_PATTERNS: list[tuple[str, str]] = [
    ("full_time", r"full[- ]time|permanent"),
    ("part_time", r"part[- ]time"),
    ("contract", r"contract(?:or)?s?|freelance"),
    ("internship", r"internships?|interns?"),
    ("co_op", r"co-?ops?"),
    ("temporary", r"temporary|temp|seasonal"),
]
JOB_TYPE_LABELS = {"full_time": "Full-time", "part_time": "Part-time", "contract": "Contract",
                   "internship": "Internship", "co_op": "Co-op", "temporary": "Temporary"}
ARRANGEMENT_PATTERNS: list[tuple[str, str]] = [
    ("hybrid", r"hybrid"),
    ("onsite", r"on-?site|in[- ]office|in[- ]person"),
]

ROLE_NOUNS = {
    "developer": "Developer", "developers": "Developer", "engineer": "Engineer", "engineers": "Engineer",
    "programmer": "Programmer", "programmers": "Programmer", "analyst": "Analyst", "analysts": "Analyst",
    "administrator": "Administrator", "administrators": "Administrator", "admin": "Administrator",
    "technician": "Technician", "technicians": "Technician", "specialist": "Specialist",
    "specialists": "Specialist", "designer": "Designer", "designers": "Designer", "tester": "Tester",
    "testers": "Tester", "architect": "Architect", "architects": "Architect", "scientist": "Scientist",
    "scientists": "Scientist", "manager": "Manager", "managers": "Manager", "consultant": "Consultant",
    "consultants": "Consultant", "support": "Support", "dev": "Developer", "devs": "Developer",
}
DOMAIN_WORDS = {
    "software": "Software", "full": "Full", "stack": "Stack", "full-stack": "Full Stack", "fullstack": "Full Stack",
    "backend": "Backend", "back-end": "Backend", "back": "Back", "end": "End", "frontend": "Front End",
    "front-end": "Front End", "front": "Front", "web": "Web", "mobile": "Mobile", "data": "Data",
    "systems": "Systems", "system": "Systems", "it": "IT", "technical": "Technical", "tech": "Technical",
    "qa": "QA", "quality": "Quality", "assurance": "Assurance", "test": "Test", "automation": "Automation",
    "cloud": "Cloud", "devops": "DevOps", "security": "Security", "network": "Network", "database": "Database",
    "help": "Help", "desk": "Desk", "desktop": "Desktop", "application": "Application", "business": "Business",
    "product": "Product", "ux": "UX", "ui": "UI", "embedded": "Embedded", "game": "Game", "machine": "Machine",
    "learning": "Learning", "ml": "ML", "ai": "AI", "customer": "Customer", "service": "Service",
    "solutions": "Solutions", "platform": "Platform", "site": "Site", "reliability": "Reliability",
}
STANDALONE_ROLES = {"devops": "DevOps Engineer", "help desk": "Help Desk Technician", "qa": "QA Analyst",
                    "it support": "IT Support", "tech support": "Technical Support", "sre": "Site Reliability Engineer"}

STOPWORDS = {
    "find", "search", "show", "get", "look", "looking", "me", "i", "want", "need", "would", "like", "please", "for",
    "jobs", "job", "roles", "role", "positions", "position", "openings", "opening", "opportunities", "opportunity",
    "work", "working", "in", "and", "or", "the", "a", "an", "with", "that", "are", "is", "which", "posted", "within",
    "paying", "pays", "pay", "at", "least", "near", "around", "of", "to", "on", "from", "only", "based", "across",
    "any", "all", "some", "new", "can", "you", "my", "also", "who", "where", "listed", "last", "past", "salary",
    "minimum", "min", "per", "year", "hour", "annually", "plus", "level", "type", "types", "experience", "using",
    "companies", "company", "anywhere", "area", "city", "gigs", "gig", "hiring", "by", "be",
    "but", "not", "than", "more", "over", "above", "starting", "no", "less", "about", "etc",
}

_NUM_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "ten": 10, "a": 1,
              "an": 1, "fourteen": 14, "thirty": 30}


@dataclass
class _State:
    original: str
    work: str  # lowercase copy; consumed spans are blanked out
    filters: dict = field(default_factory=lambda: {
        "roles": [], "keywords": [], "locations": [], "remote_regions": [], "work_arrangements": [],
        "job_types": [], "experience_levels": [], "companies": [], "exclude_companies": []})
    chips: list[Interpretation] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def consume(self, start: int, end: int) -> None:
        self.work = self.work[:start] + " " * (end - start) + self.work[end:]

    def chip(self, field_name: str, label: str, value: str) -> None:
        self.chips.append(Interpretation(field=field_name, label=label, value=value))

    def add(self, key: str, value: str) -> bool:
        if value not in self.filters[key]:
            self.filters[key].append(value)
            return True
        return False


def _finditer(state: _State, pattern: str):
    """Iterate matches of ``pattern`` over the not-yet-consumed text (case-insensitive)."""
    return list(re.finditer(pattern, state.work, re.IGNORECASE))


# ---------------------------------------------------------------------------
# Individual recognizers
# ---------------------------------------------------------------------------


def _parse_recency(state: _State) -> None:
    patterns = [
        (r"\b(?:posted\s+)?(?:with)?in\s+the\s+(?:last|past)\s+(\d+|\w+)\s+(day|week|month)s?\b", None),
        (r"\b(?:posted\s+)?(?:in\s+|over\s+|from\s+)?(?:the\s+)?(?:last|past)\s+(\d+|\w+)\s+(day|week|month)s?\b",
         None),
        (r"\b(?:posted\s+)?(?:in\s+|over\s+|from\s+|within\s+)?(?:the\s+)?(?:last|past|this)\s+(day|week|month)\b", 1),
        (r"\b(?:posted\s+)?(?:today|in\s+the\s+last\s+24\s+hours|last\s+24\s+hours|since\s+yesterday)\b", "today"),
        (r"\b(?:posted\s+)?(?:recently|recent)\b", "recent"),
    ]
    for pattern, kind in patterns:
        m = next(iter(_finditer(state, pattern)), None)
        if not m:
            continue
        if kind == "today":
            days = 1
        elif kind == "recent":
            days = 14
        elif kind == 1:
            days = {"day": 1, "week": 7, "month": 30}[m.group(1).lower()]
        else:
            count_text = m.group(1).lower()
            count = int(count_text) if count_text.isdigit() else _NUM_WORDS.get(count_text)
            if count is None:
                continue
            days = count * {"day": 1, "week": 7, "month": 30}[m.group(2).lower()]
        days = max(1, min(365, days))
        state.filters["posted_within_days"] = days
        label = "Today" if days == 1 else f"Last {days} days"
        state.chip("posted_within_days", "Posted", label)
        state.consume(m.start(), m.end())
        return


def _parse_salary(state: _State) -> None:
    lead = r"(?:(?:paying|pays|pay|salary|earning|compensation|making|that\s+pays?)\s+(?:of\s+)?)?" \
           r"(?:at\s+least|minimum(?:\s+of)?|min\.?|over|above|more\s+than|starting\s+(?:at|from)|from|\+)?\s*"
    money = r"(?:c\$|ca\$|cad\s*\$?|us\$|usd\s*\$?|\$)\s?\d[\d,]*(?:\.\d+)?\s*k?\+?" \
            r"(?:\s*(?:-|–|to)\s*\$?\s?\d[\d,]*(?:\.\d+)?\s*k?)?"
    tail = r"(?:\s*(?:/|per|an|a)\s*(?:hour|hr|year|yr|annum)|\s*hourly|\s*annually|\s*a\s+year|\s*cad|\s*usd)*"
    m = next(iter(_finditer(state, lead + money + tail)), None)
    bare = None
    if not m:
        # "55k+", "at least 60k"
        bare = next(iter(_finditer(state, r"(?:at\s+least|minimum(?:\s+of)?|over|above|paying)\s+(\d{2,3})k\+?\b|"
                                          r"\b(\d{2,3})k\+?\b")), None)
        if not bare:
            return
    if m:
        salary = parse_salary(state.original[m.start(): m.end()].replace("+", ""))
        if not salary:
            state.warnings.append(f"We couldn't read the salary \"{state.original[m.start():m.end()].strip()}\".")
            state.consume(m.start(), m.end())
            return
        amount, period, span = salary["salary_min"], salary["salary_period"], (m.start(), m.end())
    else:
        assert bare is not None
        amount, period, span = int(bare.group(1) or bare.group(2)) * 1000, "yearly", (bare.start(), bare.end())
    state.filters["salary_min"] = amount
    state.filters["salary_period"] = period
    state.chip("salary_min", "Minimum salary", f"${amount:,}/hour" if period == "hourly" else f"${amount:,} / year")
    state.consume(*span)


def _parse_multi(state: _State, patterns: list[tuple[str, str]], key: str, labels: dict[str, str],
                 chip_label: str) -> None:
    for value, pattern in patterns:
        for m in _finditer(state, rf"\b(?:{pattern})(?![\w-])"):
            if state.add(key, value):
                state.chip(key, chip_label, labels.get(value, value))
            state.consume(m.start(), m.end())


def _company_names(text: str) -> list[str]:
    parts = re.split(r"\s*(?:,|\band\b|\bor\b|&(?=\s))\s*", text)
    return [p.strip(" .") for p in parts if p.strip(" .")]


def _parse_companies(state: _State) -> None:
    cap = r"[A-Z][\w&.'-]*(?:\s+(?:&\s+)?[A-Z][\w&.'-]*)*"
    excl = re.compile(rf"\b(?:excluding|except(?:\s+for)?|not\s+at|but\s+not|other\s+than|avoid(?:ing)?)\s+"
                      rf"({cap}(?:\s*(?:,|and|or)\s*{cap})*)")
    for m in list(excl.finditer(state.original)):
        if not state.work[m.start():m.end()].strip():
            continue
        for name in _company_names(m.group(1)):
            if state.add("exclude_companies", name):
                state.chip("exclude_companies", "Excluding", name)
        state.consume(m.start(), m.end())
    incl = re.compile(rf"\b(?:at|with|for)\s+({cap}(?:\s*(?:,|or)\s*{cap})*)")
    for m in list(incl.finditer(state.original)):
        if not state.work[m.start():m.end()].strip():
            continue
        names = [n for n in _company_names(m.group(1)) if not _is_place(n)]
        if not names:
            continue
        for name in names:
            if state.add("companies", name):
                state.chip("companies", "Company", name)
        state.consume(m.start(), m.end())


def _is_place(text: str) -> bool:
    low = text.lower().strip()
    return low in CITIES or low in COUNTRIES or low in {n.lower() for n in PROVINCES.values()} or \
        low in {n.lower() for n in US_STATES.values()} or low == "remote"


def _region_pattern() -> str:
    names = list(CITIES) + [n.lower() for n in PROVINCES.values()] + [n.lower() for n in US_STATES.values()] + \
        ["canada", "united states", "usa", "the us", "the united states", "north america", "united kingdom"]
    names.sort(key=len, reverse=True)
    return "|".join(re.escape(n) for n in names)


_REGIONS = _region_pattern()


def _parse_locations(state: _State) -> None:
    remote_re = rf"\bremote(?:ly)?\s*(?:jobs?\s+|roles?\s+|positions?\s+)?(?:\(|-|–|—|,)?\s*(?:in|within|across|from|" \
                rf"anywhere\s+in)?\s*(?:the\s+)?({_REGIONS})\b\)?|\b({_REGIONS})\s*\(?\s*(?:-\s*)?remote\b\)?"
    for m in _finditer(state, remote_re):
        region = parse_location(m.group(1) or m.group(2))
        label = region.province_name or region.country or (m.group(1) or m.group(2)).title()
        if parse_location(m.group(1) or m.group(2)).city:
            label = region.label()
        if state.add("remote_regions", label):
            state.chip("remote_regions", "Remote", label)
        state.consume(m.start(), m.end())
    for m in _finditer(state, rf"\b({_REGIONS})\b(?:\s*,\s*([a-z]{{2}})\b)?"):
        parsed = parse_location(state.original[m.start():m.end()])
        label = parsed.label() or m.group(1).title()
        if state.add("locations", label):
            state.chip("locations", "Location", label)
        state.consume(m.start(), m.end())
    for m in _finditer(state, r"\b(?:remote(?:ly)?|work\s+from\s+home|wfh)\b"):
        if state.add("work_arrangements", "remote"):
            state.chip("work_arrangements", "Work arrangement", "Remote")
        state.consume(m.start(), m.end())
    # Unknown place after "in"/"near": keep it, but say we didn't recognize it.
    for m in re.finditer(r"\b(?:in|near|around)\s+([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+)?)", state.original):
        if not state.work[m.start(1):m.end(1)].strip() or m.group(1).lower() in STOPWORDS:
            continue
        name = m.group(1)
        if taxonomy.canonicalize(name) in taxonomy.SKILLS or name.lower() in ROLE_NOUNS or name.lower() in DOMAIN_WORDS:
            continue
        if state.add("locations", name):
            state.chip("locations", "Location", name)
            state.warnings.append(f"We didn't recognize \"{name}\" as a Canadian city — searching for it as typed.")
        state.consume(m.start(), m.end())


def _tech_token(token: str) -> str | None:
    canonical = taxonomy.canonicalize(token)
    if canonical in taxonomy.SKILLS and taxonomy.category_of(canonical) not in ("soft", "certifications"):
        return canonical
    found = taxonomy.extract_skills(token)
    return found[0] if len(found) == 1 and taxonomy.category_of(found[0]) not in ("soft", "certifications") else None


def _modifier_segments(state: _State, tokens: list[tuple[str, int, int]],
                       noun_index: int) -> tuple[list[list[str]], int]:
    """Words before a role noun that describe it, split on and/or/commas: "python and java" -> [[python], [java]].

    Returns the segments and the start offset of the whole phrase.
    """
    segments: list[list[str]] = [[]]
    start = tokens[noun_index][1]
    for j in range(noun_index - 1, -1, -1):
        raw, tok_start, tok_end = tokens[j]
        tok = raw.strip(".,")
        if tok in ("and", "or", "&", "/"):
            segments.insert(0, [])
        elif tok in DOMAIN_WORDS or _tech_token(tok):
            if "," in state.work[tok_end:start]:
                segments.insert(0, [])
            segments[0].insert(0, tok)
        else:
            break
        start = tok_start
    return [seg for seg in segments if seg], start


def _role_name(words: list[str], noun: str) -> str | None:
    names = [_tech_token(w) or DOMAIN_WORDS.get(w, w.title()) for w in words]
    if noun == "Support":  # "IT support" -> "IT Support Specialist"; bare "support" is too vague
        if not names:
            return None
        return " ".join(names + [noun]) + (" Specialist" if names[-1] in ("IT", "Technical", "Customer") else "")
    return " ".join(names + [noun])


def _parse_roles(state: _State) -> None:
    """Role phrases like "python and java developer", "full stack developer", "IT support"."""
    tokens = [(m.group(0), m.start(), m.end()) for m in re.finditer(r"[a-z0-9+#./-]+", state.work)]
    for i, (raw, _, end) in enumerate(tokens):
        noun = ROLE_NOUNS.get(raw.strip("."))
        if noun is None:
            continue
        segments, start = _modifier_segments(state, tokens, i)
        roles = [role for seg in segments or [[]] if (role := _role_name(seg, noun))]
        if not roles:
            continue
        for role in roles:
            if state.add("roles", role):
                state.chip("roles", "Role", role)
        for word in (w for seg in segments for w in seg):
            if (tech := _tech_token(word)) and state.add("keywords", tech):
                state.chip("keywords", "Skill", tech)
        state.consume(start, end)
    for phrase, role in STANDALONE_ROLES.items():
        for m in _finditer(state, rf"\b{re.escape(phrase)}\b"):
            if state.add("roles", role):
                state.chip("roles", "Role", role)
            state.consume(m.start(), m.end())


def _parse_keywords(state: _State) -> None:
    for skill in taxonomy.extract_skills(state.work):
        if taxonomy.category_of(skill) in ("soft",):
            continue
        if state.add("keywords", skill):
            state.chip("keywords", "Skill", skill)
        for term in (skill, *taxonomy.SKILLS[skill][1]):  # consume every alias occurrence of this skill
            for m in re.finditer(rf"(?<![\w+#.]){re.escape(term)}(?![\w+#])", state.work, re.IGNORECASE):
                state.consume(m.start(), m.end())


def _leftovers(state: _State) -> None:
    words = [w for w in re.findall(r"[a-z][a-z'&.-]*", state.work) if w.strip(".-'") not in STOPWORDS and
             len(w.strip(".-'")) > 1]
    if words:
        unused = " ".join(dict.fromkeys(words))
        state.warnings.append(f"We didn't use: \"{unused}\". Try rephrasing or use the filters.")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def _suggested_name(f: SearchFilters) -> str:
    level = " / ".join(LEVEL_LABELS[lvl] for lvl in f.experience_levels[:2])
    if f.roles:
        nouns = {r.split()[-1] for r in f.roles}
        if len(nouns) == 1 and len(f.roles) > 1:
            noun = nouns.pop()
            what = "/".join(r.rsplit(" ", 1)[0] for r in f.roles[:3]) + f" {noun}"
        else:
            what = " / ".join(f.roles[:2])
    elif f.keywords:
        what = "/".join(f.keywords[:3]) + " jobs"
    else:
        what = "Jobs"
    where = [loc.split(",")[0] for loc in f.locations[:2]] + [f"Remote {r}" for r in f.remote_regions[:2]]
    name = f"{level} {what}".strip()
    if where:
        name += " — " + " + ".join(where)
    elif "remote" in f.work_arrangements:
        name += " — Remote"
    return name[:200]


def parse_query(text: str, prefs: UserPreference | None = None) -> ParsedQuery:
    """Parse a natural-language job search. ``prefs`` fills in locations when the query names none."""
    original = " ".join((text or "").split())
    state = _State(original=original, work=original.lower())
    _parse_recency(state)
    _parse_salary(state)
    _parse_companies(state)
    _parse_locations(state)
    _parse_multi(state, LEVEL_PATTERNS, "experience_levels", LEVEL_LABELS, "Experience level")
    _parse_multi(state, JOB_TYPE_PATTERNS, "job_types", JOB_TYPE_LABELS, "Job type")
    _parse_multi(state, ARRANGEMENT_PATTERNS, "work_arrangements",
                 {"hybrid": "Hybrid", "onsite": "On-site"}, "Work arrangement")
    _parse_roles(state)
    _parse_keywords(state)
    _leftovers(state)

    f = state.filters
    if f["remote_regions"] and not f["locations"]:
        if state.add("work_arrangements", "remote"):  # "remote jobs in Ontario" — remote only
            state.chip("work_arrangements", "Work arrangement", "Remote")
    elif f["remote_regions"] and "remote" in f["work_arrangements"]:
        f["work_arrangements"].remove("remote")  # mixed on-site + remote search: don't restrict arrangement
        state.chips = [c for c in state.chips if not (c.field == "work_arrangements" and c.value == "Remote")]
    if prefs is not None and not f["locations"] and not f["remote_regions"] and prefs.target_locations:
        for loc in prefs.target_locations:
            parsed = parse_location(loc)
            key = "remote_regions" if parsed.is_remote else "locations"
            value = (parsed.region or "Anywhere") if parsed.is_remote else loc
            if state.add(key, value):
                state.chip(key, "Location (from your preferences)", value)
    if {"remote", "onsite"} <= set(f["work_arrangements"]):
        state.warnings.append("You asked for both remote and on-site roles — we'll include both.")
    if not any(f[k] for k in ("roles", "keywords", "companies")):
        state.warnings.append("No role or skill recognized — results will be based on location and other filters only.")
    filters = SearchFilters(**f)
    return ParsedQuery(text=original, filters=filters, interpretation=state.chips, warnings=state.warnings,
                       suggested_name=_suggested_name(filters))
