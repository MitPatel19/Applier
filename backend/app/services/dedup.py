"""Duplicate detection for job postings.

The same job is often posted on LinkedIn, Indeed and the employer's site with slightly
different titles ("Sr. Python Developer (m/f/d)" vs "Senior Python Developer"), company
suffixes ("Inc.", "Ltd.") and location formats. We merge them into one ``Job`` so the user
reviews each opportunity once, with every source listed.

Detection order: same source + external id, same URL, exact normalized key, then a fuzzy
fallback (same company, similar title, overlapping description, compatible location).
"""

from __future__ import annotations

import hashlib
import re
from difflib import SequenceMatcher

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Company, Job, JobSource
from app.services.location import parse_location
from app.services.sources.base import RawPosting

TITLE_SIMILARITY = 0.85
DESCRIPTION_JACCARD = 0.5

_TITLE_ABBREVIATIONS = {
    "sr": "senior", "snr": "senior", "jr": "junior", "jnr": "junior", "mid": "intermediate",
    "dev": "developer", "devs": "developer", "eng": "engineer", "engr": "engineer", "mgr": "manager",
    "admin": "administrator", "sysadmin": "systems administrator", "sys": "systems", "tech": "technician",
    "qa": "quality assurance", "ft": "", "pt": "part time",
}
_LEVEL_WORDS = {"junior", "senior", "intermediate", "lead", "principal", "staff", "entry", "ii", "iii", "i",
                "associate"}
_GENDER_RE = re.compile(r"\((?:[mwfdhx]\s*/\s*){1,3}[mwfdhx]\)|\((?:all genders?|w/m/d|h/f)\)", re.IGNORECASE)
_REQ_ID_RE = re.compile(
    r"(?:\b(?:req(?:uisition)?|job|posting|ref(?:erence)?)\s*(?:id|#|no\.?|number)?\s*[:#]?\s*[A-Z0-9-]*\d[A-Z0-9-]*)"
    r"|(?:#\s*[A-Z0-9-]*\d[A-Z0-9-]*)|(?:\[[A-Z0-9-]*\d[A-Z0-9-]*\])|(?:\b[A-Z]{1,4}-?\d{4,}\b)",
    re.IGNORECASE)
_TITLE_NOISE_RE = re.compile(
    r"\b(full[- ]time|part[- ]time|permanent|remote|hybrid|on-?site|contract|temporary|urgent(?:ly)? hiring|"
    r"hiring now)\b", re.IGNORECASE)
_COMPANY_SUFFIX_RE = re.compile(
    r"\b(inc|incorporated|ltd|limited|llc|llp|lp|corp|corporation|co|company|plc|gmbh|ulc|holdings)\b\.?$",
    re.IGNORECASE)


def clean_title(title: str) -> str:
    """Display-friendly title: removes gender markers, requisition ids and extra whitespace (keeps case)."""
    t = _GENDER_RE.sub(" ", title or "")
    t = _REQ_ID_RE.sub(" ", t)
    t = re.sub(r"\s*[-–—|:]\s*$", "", re.sub(r"\s+", " ", t)).strip(" -–—|,")
    return t or (title or "").strip()


def _strip_location_suffix(title: str) -> str:
    """Drop a trailing location such as " - Thunder Bay" or " (Remote, Canada)"."""
    for sep in (" - ", " – ", " — ", " | ", " @ ", ", "):
        if sep in title:
            head, _, tail = title.rpartition(sep)
            parsed = parse_location(tail)
            if head and (parsed.city and parsed.province or parsed.province or parsed.country or parsed.is_remote):
                return head
    return re.sub(r"\s*\([^)]*\b(?:remote|canada|ontario|hybrid)\b[^)]*\)\s*$", "", title, flags=re.IGNORECASE)


def normalize_title(title: str) -> str:
    """Lowercase canonical title for comparisons: "Sr. Python Dev (m/f/d) - Toronto" -> "senior python developer"."""
    t = clean_title(title)
    t = _strip_location_suffix(t)
    t = _TITLE_NOISE_RE.sub(" ", t.lower())
    t = re.sub(r"[^a-z0-9+#./ ]+", " ", t).replace("/", " ")
    words = []
    for w in t.split():
        w = w.strip(".")
        if not w:
            continue
        w = _TITLE_ABBREVIATIONS.get(w, w)
        if w:
            words.append(w)
    return " ".join(" ".join(words).split())


def normalize_company(name: str) -> str:
    """"The Borealis Software Inc." -> "borealis software"."""
    n = (name or "").lower().replace("&", " and ")
    n = re.sub(r"[^\w\s]", " ", n)
    n = re.sub(r"^\s*the\s+", "", n)
    n = " ".join(n.split())
    prev = None
    while prev != n:
        prev = n
        n = _COMPANY_SUFFIX_RE.sub("", n).strip()
    return n or (name or "").strip().lower()


def normalize_location_key(location: str | None) -> str:
    parsed = parse_location(location)
    if parsed.is_remote:
        return f"remote:{(parsed.province or parsed.country or 'any').lower()}"
    if parsed.city:
        return f"{parsed.city.lower()}:{(parsed.province or '').lower()}"
    return (parsed.province or parsed.country or (location or "")).strip().lower()


def dedup_key(company: str, title: str, location: str | None) -> str:
    raw = f"{normalize_company(company)}|{normalize_title(title)}|{normalize_location_key(location)}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _shingles(text: str, size: int = 3) -> set[str]:
    words = re.findall(r"[a-z0-9+#]+", (text or "").lower())
    return {" ".join(words[i: i + size]) for i in range(max(0, len(words) - size + 1))}


def description_similarity(a: str, b: str) -> float:
    """Jaccard similarity of word 3-gram shingles."""
    sa, sb = _shingles(a), _shingles(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_title(a), normalize_title(b)).ratio()


_ROLE_FAMILIES = {"developer": "developer", "engineer": "developer", "programmer": "developer",
                  "technician": "support", "specialist": "support", "support": "support", "analyst": "analyst",
                  "administrator": "administrator", "tester": "qa", "quality": "qa"}
_TITLE_FILLER = _LEVEL_WORDS | {"level", "and", "the", "of", "a", "new", "grad", "graduate", "&"}


def _core_words(title: str) -> set[str]:
    return {w for w in normalize_title(title).split() if w not in _TITLE_FILLER}


def _families(words: set[str]) -> set[str]:
    return {_ROLE_FAMILIES[w] for w in words if w in _ROLE_FAMILIES}


def title_alignment(job_title: str, role: str) -> float:
    """0-1 similarity between a job title and a target role, ignoring seniority words.

    1.0 when every word of the role appears in the title ("Python Developer" vs "Backend Developer (Python)"),
    ~0.75 for the same job family plus a shared specialty, ~0.55 for the same family only.
    """
    jw, rw = _core_words(job_title), _core_words(role)
    if not jw or not rw:
        return 0.0
    if rw <= jw:
        return 1.0
    ratio = SequenceMatcher(None, " ".join(sorted(jw)), " ".join(sorted(rw))).ratio()
    if ratio >= 0.85:
        return ratio
    shared_family = _families(jw) & _families(rw)
    shared_mods = (jw - set(_ROLE_FAMILIES)) & (rw - set(_ROLE_FAMILIES))
    if shared_family and shared_mods:
        return 0.75
    if shared_family:
        return 0.55
    return 0.25 if shared_mods else 0.0


def _levels(title: str) -> set[str]:
    return set(normalize_title(title).split()) & _LEVEL_WORDS


def _locations_compatible(a: str | None, b: str | None) -> bool:
    pa, pb = parse_location(a), parse_location(b)
    if not (pa.city or pa.province or pa.country) or not (pb.city or pb.province or pb.country):
        return True  # one side doesn't say — can't rule it out
    if pa.is_remote or pb.is_remote:
        return pa.is_remote == pb.is_remote and (pa.country == pb.country or not pa.country or not pb.country)
    if pa.city and pb.city:
        return pa.city.lower() == pb.city.lower()
    return (pa.province or pa.country) == (pb.province or pb.country) or pa.country == pb.country


def is_fuzzy_duplicate(job: Job, posting: RawPosting) -> bool:
    """Same company assumed; compare title, level words, location and description."""
    if _levels(job.title) != _levels(posting.title):
        return False
    if title_similarity(job.title, posting.title) < TITLE_SIMILARITY:
        return False
    if not _locations_compatible(job.location, posting.location):
        return False
    if len(job.description or "") < 80 or len(posting.description or "") < 80:
        return True
    return description_similarity(job.description, posting.description) >= DESCRIPTION_JACCARD


def find_existing_source(db: Session, user_id: int, source: str, external_id: str) -> JobSource | None:
    """The exact same posting (same source + id) seen before."""
    return db.scalar(
        select(JobSource).join(Job).where(Job.user_id == user_id, JobSource.source == source,
                                          JobSource.external_id == external_id).limit(1))


def find_duplicate(db: Session, user_id: int, posting: RawPosting, *, check_source: bool = True) -> Job | None:
    """Find an existing job that ``posting`` is a copy of (from any source).

    ``check_source=False`` skips the same-source/external-id lookup when the caller already did it.
    """
    if check_source and (existing := find_existing_source(db, user_id, posting.source, posting.external_id)):
        return existing.job
    urls = [u for u in (posting.url, posting.apply_url) if u]
    if urls:
        job = db.scalar(select(Job).join(JobSource).where(
            Job.user_id == user_id, or_(JobSource.url.in_(urls), JobSource.apply_url.in_(urls))).limit(1))
        if job is not None:
            return job
    key = dedup_key(posting.company_name, posting.title, posting.location)
    job = db.scalar(select(Job).where(Job.user_id == user_id, Job.dedup_key == key).limit(1))
    if job is not None:
        return job
    company_id = db.scalar(select(Company.id).where(
        Company.user_id == user_id, Company.normalized_name == normalize_company(posting.company_name)))
    if company_id is None:
        return None
    for candidate in db.scalars(select(Job).where(Job.user_id == user_id, Job.company_id == company_id)):
        if is_fuzzy_duplicate(candidate, posting):
            return candidate
    return None
