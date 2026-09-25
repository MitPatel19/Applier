"""Job-specific resume tailoring with a reviewable change list.

Integrity rules enforced here:

* Only facts already in the user's profile or their own resume are used. A job keyword the
  user lacks is reported in ``keywords_missing`` and an integrity note — never inserted.
* Every modification is a ``ResumeChange`` (before/after/reason) that the user can accept or
  reject; ``apply_changes`` re-derives the content from the untouched base deterministically.
* AI wording suggestions are discarded when they mention skills outside the user's facts or
  introduce numbers that were not in the original bullet.
"""

from __future__ import annotations

import copy
import json
import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Any

from app.models import Job
from app.schemas.resume import ResumeChange, ResumeContent
from app.services import llm, taxonomy
from app.services.profile_bundle import ProfileBundle

BANNED_PHRASES = ("i am writing to express", "passionate", "synergy", "fast-paced", "leverage", "dynamic")
_SOFT = {name for name, (cat, _) in taxonomy.SKILLS.items() if cat == "soft"}
_STOPWORDS = {"with", "and", "the", "for", "our", "you", "your", "will", "from", "that", "this", "have", "using",
              "work", "team", "able", "must", "including", "such", "other", "within", "across", "into", "their"}

# Spelling variants that can safely be aligned to the job's wording (same thing, different spelling).
SAFE_ALIASES: dict[str, str] = {
    "postgres": "PostgreSQL", "psql": "PostgreSQL", "reactjs": "React", "react.js": "React", "nodejs": "Node.js",
    "node js": "Node.js", "nextjs": "Next.js", "vuejs": "Vue.js", "golang": "Go", "k8s": "Kubernetes",
    "restful apis": "REST APIs", "restful api": "REST APIs", "mongo": "MongoDB", "gcp": "Google Cloud",
    "dotnet": ".NET", "sklearn": "scikit-learn", "expressjs": "Express", "express.js": "Express",
    "tailwindcss": "Tailwind CSS", "springboot": "Spring Boot", "fast api": "FastAPI", "python3": "Python",
    "mssql": "SQL Server", "ms sql": "SQL Server", "angularjs": "Angular",
}

_GERUND_TO_PAST = {
    "analyzing": "Analyzed", "answering": "Answered", "assisting": "Assisted", "automating": "Automated",
    "building": "Built", "configuring": "Configured", "coordinating": "Coordinated", "creating": "Created",
    "debugging": "Debugged", "deploying": "Deployed", "designing": "Designed", "developing": "Developed",
    "documenting": "Documented", "handling": "Handled", "implementing": "Implemented", "improving": "Improved",
    "installing": "Installed", "integrating": "Integrated", "leading": "Led", "maintaining": "Maintained",
    "managing": "Managed", "migrating": "Migrated", "monitoring": "Monitored", "optimizing": "Optimized",
    "organizing": "Organized", "planning": "Planned", "preparing": "Prepared", "processing": "Processed",
    "providing": "Provided", "refactoring": "Refactored", "resolving": "Resolved", "responding": "Responded",
    "reviewing": "Reviewed", "supporting": "Supported", "testing": "Tested", "tracking": "Tracked",
    "training": "Trained", "troubleshooting": "Troubleshot", "updating": "Updated", "writing": "Wrote",
}
# (pattern, strategy): "verb" -> convert a following gerund to a past-tense verb (otherwise leave as is);
# "contributed"/"assisted" -> gerund conversion when it keeps the meaning, else a neutral stronger verb.
_WEAK_OPENERS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^(?:was\s+)?responsible\s+for\s+(?P<rest>.+)$", re.I), "verb"),
    (re.compile(r"^(?:tasked|charged)\s+with\s+(?P<rest>.+)$", re.I), "verb"),
    (re.compile(r"^duties\s+included\s+(?P<rest>.+)$", re.I), "verb"),
    (re.compile(r"^worked\s+on\s+(?P<rest>.+)$", re.I), "contributed"),
    (re.compile(r"^(?:was\s+)?involved\s+in\s+(?P<rest>.+)$", re.I), "contributed"),
    (re.compile(r"^helped\s+(?:with|to)\s+(?P<rest>.+)$", re.I), "assisted"),
]
_NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)*")


# ---------------------------------------------------------------------------
# Job terms & relevance
# ---------------------------------------------------------------------------


def _canon_list(items: Iterable[str]) -> list[str]:
    out: list[str] = []
    for item in items:
        c = taxonomy.canonicalize(item) if item else ""
        if c and c not in out:
            out.append(c)
    return out


@dataclass
class JobTerms:
    required: list[str]
    preferred: list[str]
    other: list[str]
    words: set[str]

    @property
    def skills(self) -> list[str]:
        return [*self.required, *self.preferred, *self.other]

    def weight(self, skill: str) -> int:
        if skill in self.required:
            return 3
        if skill in self.preferred:
            return 2
        return 1 if skill in self.other else 0


def job_terms(job: Job) -> JobTerms:
    req = job.requirements or {}
    required = _canon_list(req.get("required_skills") or [])
    preferred = [s for s in _canon_list(req.get("preferred_skills") or []) if s not in required]
    other = [s for s in _canon_list([*(req.get("technologies") or []), *(req.get("keywords") or [])])
             if s not in required and s not in preferred and s in taxonomy.SKILLS]
    if not (required or preferred or other):
        required = taxonomy.extract_skills(f"{job.title}\n{job.description or ''}")
    text = " ".join([job.title or "", *(req.get("responsibilities") or [])]).lower()
    words = {w for w in re.findall(r"[a-z][a-z+#.-]{3,}", text) if w not in _STOPWORDS}
    return JobTerms(required, preferred, other, words)


def relevance(text: str, terms: JobTerms) -> float:
    skills = taxonomy.extract_skills(text)
    score = float(sum(terms.weight(s) for s in skills))
    words = set(re.findall(r"[a-z][a-z+#.-]{3,}", text.lower()))
    return score + 0.5 * min(3, len(words & terms.words))


# ---------------------------------------------------------------------------
# Content helpers
# ---------------------------------------------------------------------------


def content_text(content: dict[str, Any]) -> str:
    c = ResumeContent.model_validate(content)
    parts: list[str] = [c.headline or "", c.summary or "", *c.certifications]
    parts += [i for g in c.skills for i in g.items]
    for e in c.experience:
        parts += [e.position, e.company, *e.technologies, *(b.text for b in e.bullets)]
    for p in c.projects:
        parts += [p.name, p.description or "", *p.technologies, *(b.text for b in p.bullets)]
    for ed in c.education:
        parts += [ed.degree or "", ed.program or "", *ed.details]
    return "\n".join(p for p in parts if p)


def content_skills(content: dict[str, Any]) -> set[str]:
    listed = {taxonomy.canonicalize(i) for g in content.get("skills", []) for i in g.get("items", [])}
    return listed | set(taxonomy.extract_skills(content_text(content)))


def _join(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} and {items[-1]}"


def _format_years(years: float) -> str:
    whole = int(years)
    if whole < 1:
        return ""
    plus = "+" if years - whole >= 0.25 else ""
    return f"{whole}{plus} year{'s' if whole > 1 or plus else ''}"


def tailored_file_name(full_name: str, job_title: str, company: str) -> str:
    """``Mit_Patel_Junior_Software_Developer_XYZ.pdf``"""
    names = full_name.split()
    person = [names[0], names[-1]] if len(names) > 1 else names
    raw = "_".join([*person, job_title, company])
    clean = re.sub(r"_+", "_", re.sub(r"[^A-Za-z0-9]+", "_", raw)).strip("_")
    return f"{clean[:150] or 'Resume'}.pdf"


# ---------------------------------------------------------------------------
# Change application (deterministic)
# ---------------------------------------------------------------------------


def _all_bullets(content: dict[str, Any]) -> Iterable[dict[str, Any]]:
    for section in ("experience", "projects"):
        for item in content.get(section, []):
            yield from item.get("bullets", [])


def _apply_keyword(content: dict[str, Any], change: dict[str, Any]) -> None:
    data = change.get("data") or {}
    skill, label = data.get("skill"), data.get("group")
    if not skill:
        return
    if label == "Certifications":
        if skill not in content.setdefault("certifications", []):
            content["certifications"].append(skill)
        return
    groups = content.setdefault("skills", [])
    group = next((g for g in groups if g.get("category") == label), None)
    if group is None:
        group = {"category": label, "items": []}
        groups.append(group)
    if skill not in group["items"]:
        group["items"].append(skill)


def _apply_emphasize(content: dict[str, Any], change: dict[str, Any]) -> None:
    order = (change.get("data") or {}).get("order") or []
    current = {g["category"]: list(g.get("items", [])) for g in content.get("skills", [])}
    result: list[dict[str, Any]] = []
    for entry in order:
        items = current.pop(entry["category"], None)
        if items is None:
            continue
        ranked = [i for i in entry["items"] if i in items] + [i for i in items if i not in entry["items"]]
        result.append({"category": entry["category"], "items": ranked})
    result += [{"category": cat, "items": items} for cat, items in current.items()]
    content["skills"] = result


def _apply_rewrite(content: dict[str, Any], change: dict[str, Any]) -> None:
    for bullet in _all_bullets(content):
        if bullet.get("id") == change.get("item_ref"):
            bullet["text"] = change.get("after") or bullet["text"]


def _reorder(items: list[dict[str, Any]], order: list[str]) -> list[dict[str, Any]]:
    rank = {item_id: i for i, item_id in enumerate(order)}
    return sorted(items, key=lambda it: rank.get(it.get("id", ""), len(rank)))


def _apply_reorder(content: dict[str, Any], change: dict[str, Any]) -> None:
    order = (change.get("data") or {}).get("order") or []
    if change.get("section") == "projects":
        content["projects"] = _reorder(content.get("projects", []), order)
        return
    for item in content.get("experience", []):
        if item.get("id") == change.get("item_ref"):
            item["bullets"] = _reorder(item.get("bullets", []), order)


def _apply_remove(content: dict[str, Any], change: dict[str, Any]) -> None:
    content["projects"] = [p for p in content.get("projects", []) if p.get("id") != change.get("item_ref")]


def _apply_summary(content: dict[str, Any], change: dict[str, Any]) -> None:
    content["summary"] = change.get("after")


_APPLIERS: list[tuple[str, Callable[[dict[str, Any], dict[str, Any]], None]]] = [
    ("keyword", _apply_keyword), ("emphasize", _apply_emphasize), ("rewrite", _apply_rewrite),
    ("reorder", _apply_reorder), ("remove", _apply_remove), ("summary", _apply_summary),
]


def apply_changes(base_content: dict[str, Any], changes: list[dict[str, Any]]) -> dict[str, Any]:
    """Apply every change that is not explicitly rejected (pending ones are shown as proposed)."""
    content = copy.deepcopy(ResumeContent.model_validate(base_content or {}).model_dump())
    active = [c for c in changes if c.get("accepted") is not False]
    for change_type, applier in _APPLIERS:
        for change in active:
            if change.get("type") == change_type:
                applier(content, change)
    return ResumeContent.model_validate(content).model_dump()


# ---------------------------------------------------------------------------
# Change generation
# ---------------------------------------------------------------------------


@dataclass
class _Builder:
    changes: list[dict[str, Any]] = field(default_factory=list)

    def add(self, *, type: str, section: str, title: str, reason: str, item_ref: str | None = None,
            before: str | None = None, after: str | None = None, data: dict[str, Any] | None = None) -> dict[str, Any]:
        change = ResumeChange(id=f"chg-{len(self.changes) + 1}", type=type, section=section,  # type: ignore[arg-type]
                              item_ref=item_ref, title=title, before=before, after=after, reason=reason).model_dump()
        if data:
            change["data"] = data
        self.changes.append(change)
        return change


def _skill_evidence(bundle: ProfileBundle, skill: str) -> str:
    for s in bundle.skills:
        if taxonomy.canonicalize(s.name) == skill:
            return "listed in your skills"
    for e in bundle.experiences:
        if skill in taxonomy.normalize_set(e.technologies or []):
            return f"used at {e.company}"
    for p in bundle.projects:
        if skill in taxonomy.normalize_set(p.technologies or []):
            return f"used in your {p.name} project"
    return "in your profile"


def _keyword_changes(b: _Builder, bundle: ProfileBundle, content: dict[str, Any], terms: JobTerms) -> None:
    in_resume = {taxonomy.canonicalize(i) for g in content.get("skills", []) for i in g.get("items", [])}
    in_resume |= {taxonomy.canonicalize(c) for c in content.get("certifications", [])}
    for skill in terms.skills:
        if skill in in_resume or skill not in bundle.skill_names:
            continue
        category = taxonomy.category_of(skill)
        group = taxonomy.CATEGORY_LABELS.get(category, "Other")
        change = b.add(type="keyword", section="skills", title=f"Added {skill} to your skills",
                       after=skill, data={"skill": skill, "group": group},
                       reason=f"The job asks for {skill}, and it's in your profile ({_skill_evidence(bundle, skill)}).")
        _apply_keyword(content, change)


def _emphasize_change(b: _Builder, content: dict[str, Any], terms: JobTerms) -> None:
    groups = content.get("skills", [])
    if not groups:
        return
    order = {skill: i for i, skill in enumerate(terms.skills)}

    def rank(item: str) -> tuple[int, int]:
        canonical = taxonomy.canonicalize(item)
        return -terms.weight(canonical), order.get(canonical, len(order))

    ranked_groups = []
    for gi, g in enumerate(groups):
        items = sorted(g.get("items", []), key=lambda s: (*rank(s), g["items"].index(s)))
        best = rank(items[0]) if items else (0, len(order))
        ranked_groups.append((best, gi, {"category": g["category"], "items": items}))
    ranked_groups.sort(key=lambda t: (t[0], t[1]))
    new_groups = [g for _, _, g in ranked_groups]
    before = [i for g in groups for i in g.get("items", [])]
    after = [i for g in new_groups for i in g["items"]]
    highlighted = sorted((s for s in after if terms.weight(taxonomy.canonicalize(s))), key=rank)[:3]
    if before == after or not highlighted:
        return
    change = b.add(type="emphasize", section="skills", title=f"Emphasized {', '.join(highlighted)}",
                   before=", ".join(before), after=", ".join(after), data={"order": new_groups},
                   reason="Skills this job asks for are listed first so recruiters and ATS scans see them immediately.")
    _apply_emphasize(content, change)


def weak_opener_rewrite(text: str) -> str:
    """Replace weak openers ("Responsible for", "Worked on", "Helped with") without changing the facts."""
    for pattern, strategy in _WEAK_OPENERS:
        m = pattern.match(text.strip())
        if not m:
            continue
        rest = m.group("rest").strip()
        first, _, remainder = rest.partition(" ")
        past = _GERUND_TO_PAST.get(first.lower())
        if strategy == "assisted":
            return f"Assisted with {rest}" if past else f"Supported {rest}"
        if past:
            return f"{past} {remainder}".strip()
        if strategy == "contributed":
            return f"Contributed to {rest}"
        return text
    return text


def align_terminology(text: str, job_skills: set[str], user_skills: set[str]) -> tuple[str, list[tuple[str, str]]]:
    """Use the job's canonical wording for spelling variants of skills the user has."""
    swaps: list[tuple[str, str]] = []
    for alias, canonical in SAFE_ALIASES.items():
        if canonical not in job_skills or canonical not in user_skills:
            continue
        pattern = re.compile(rf"(?<![A-Za-z0-9_+#.]){re.escape(alias)}(?![A-Za-z0-9_+#])", re.IGNORECASE)
        if pattern.search(text) and not re.search(re.escape(canonical), text):
            found = pattern.search(text).group(0)  # type: ignore[union-attr]
            text = pattern.sub(canonical, text)
            swaps.append((found, canonical))
    return text, swaps


def _deterministic_rewrite(text: str, job_skills: set[str], user_skills: set[str]) -> tuple[str, list[str]]:
    reasons: list[str] = []
    new = weak_opener_rewrite(text)
    if new != text:
        reasons.append("starts with a clear action verb instead of a passive phrase")
    new, swaps = align_terminology(new, job_skills, user_skills)
    reasons += [f"uses the job's wording “{canonical}” instead of “{alias}”" for alias, canonical in swaps]
    return new, reasons


def _numbers(text: str) -> set[str]:
    return set(_NUMBER_RE.findall(text))


def ai_rewrite_is_safe(original: str, rewritten: str, allowed_skills: set[str]) -> bool:
    """Guard for AI wording: no new skills, no new numbers, no clichés, no runaway length."""
    if not rewritten or len(rewritten) > len(original) * 1.6 + 40:
        return False
    if llm.unsupported_claims(rewritten, allowed_skills):
        return False
    if not _numbers(rewritten) <= _numbers(original):
        return False
    low = rewritten.lower()
    return not any(p in low for p in BANNED_PHRASES)


def _ai_polish(bullets: dict[str, str], job: Job, terms: JobTerms, allowed: set[str]) -> tuple[dict[str, str], int]:
    """Optional Claude polish. Returns (accepted rewrites by bullet id, number of rejected suggestions)."""
    if not bullets or not llm.available():
        return {}, 0
    prompt = (
        f"Target role: {job.title} at {job.company_name}. Relevant job skills the candidate has: "
        f"{', '.join(s for s in terms.skills if s in allowed) or 'n/a'}.\n"
        "Rewrite each resume bullet below to be clearer and more specific, starting with a strong past-tense verb. "
        "Keep every fact exactly as given. Do not add tools, numbers, outcomes or scope that are not in the bullet. "
        "Return ONLY a JSON object mapping each id to its rewritten text.\n\n"
        + json.dumps(bullets, ensure_ascii=False)
    )
    raw = llm.generate("You edit resume bullets for accuracy and clarity.", prompt, max_tokens=2000)
    match = re.search(r"\{.*\}", raw or "", re.S)
    try:
        suggested = json.loads(match.group(0)) if match else {}
    except json.JSONDecodeError:
        return {}, 0
    accepted: dict[str, str] = {}
    rejected = 0
    for bullet_id, original in bullets.items():
        new = str(suggested.get(bullet_id, "")).strip()
        if not new or new == original:
            continue
        if ai_rewrite_is_safe(original, new, allowed):
            accepted[bullet_id] = new
        else:
            rejected += 1
    return accepted, rejected


_AI_BULLET_LIMIT = 8


def _rewrite_changes(b: _Builder, content: dict[str, Any], terms: JobTerms, bundle: ProfileBundle, job: Job,
                     allowed: set[str]) -> int:
    job_skills = set(terms.skills)
    proposals: dict[str, tuple[str, str, list[str]]] = {}  # id -> (original, new, reasons)
    for bullet in _all_bullets(content):
        new, reasons = _deterministic_rewrite(bullet["text"], job_skills, bundle.skill_names)
        proposals[bullet["id"]] = (bullet["text"], new, reasons)
    relevant = sorted(proposals, key=lambda i: -relevance(proposals[i][1], terms))[:_AI_BULLET_LIMIT]
    polished, rejected = _ai_polish({i: proposals[i][1] for i in relevant}, job, terms, allowed)
    for bullet_id, (original, new, reasons) in proposals.items():
        if bullet_id in polished:
            new = polished[bullet_id]
            reasons = [*reasons, "clearer wording suggested by AI and checked against your profile"]
        if new == original:
            continue
        b.add(type="rewrite", section="experience" if bullet_id.startswith("exp") else "projects",
              item_ref=bullet_id, title="Reworded a bullet for clarity", before=original, after=new,
              reason=f"Same facts; the bullet now {_join(reasons)}.")
    return rejected


def _reorder_changes(b: _Builder, content: dict[str, Any], terms: JobTerms) -> None:
    for item in content.get("experience", []):
        bullets = item.get("bullets", [])
        scored = sorted(enumerate(bullets), key=lambda t: (-relevance(t[1]["text"], terms), t[0]))
        new_order = [bl["id"] for _, bl in scored]
        if new_order != [bl["id"] for bl in bullets] and relevance(scored[0][1]["text"], terms) > 0:
            b.add(type="reorder", section="experience", item_ref=item["id"],
                  title=f"Moved job-relevant work to the top of {item['position']}",
                  before=bullets[0]["text"], after=scored[0][1]["text"], data={"order": new_order},
                  reason="The bullet closest to this job's requirements now leads the role. Roles stay in "
                         "chronological order.")
    projects = content.get("projects", [])
    ranked = sorted(enumerate(projects), key=lambda t: (-_project_relevance(t[1], terms), t[0]))
    order = [p["id"] for _, p in ranked]
    if order != [p["id"] for p in projects] and ranked and _project_relevance(ranked[0][1], terms) > 0:
        b.add(type="reorder", section="projects", title="Put the most relevant projects first",
              before=", ".join(p["name"] for p in projects), after=", ".join(p["name"] for _, p in ranked),
              data={"order": order}, reason="Projects using the skills this job asks for are shown first.")


def _project_relevance(project: dict[str, Any], terms: JobTerms) -> float:
    text = " ".join([project.get("name", ""), project.get("description") or "", *project.get("technologies", []),
                     *(bl["text"] for bl in project.get("bullets", []))])
    return relevance(text, terms)


_MAX_PROJECTS_KEPT = 3


def _remove_changes(b: _Builder, content: dict[str, Any], terms: JobTerms) -> None:
    projects = content.get("projects", [])
    if len(projects) <= _MAX_PROJECTS_KEPT:
        return
    removable = [p for p in reversed(projects) if _project_relevance(p, terms) == 0]
    for project in removable[: len(projects) - _MAX_PROJECTS_KEPT]:
        b.add(type="remove", section="projects", item_ref=project["id"], title=f"De-emphasized {project['name']}",
              before=project["name"], after=None,
              reason="This project doesn't use any skills this job asks for; leaving it out keeps the resume "
                     "focused. Reject this change to keep it.")


def targeted_summary(bundle: ProfileBundle, job: Job, terms: JobTerms) -> str | None:
    """A factual summary: who the user is, years, top matching skills they have, and the role sought."""
    skills = [s for s in terms.skills if s in bundle.skill_names and s not in _SOFT][:4]
    if not skills:
        return None
    latest = bundle.experiences[0] if bundle.experiences else None
    edu = bundle.highest_education()
    identity = (bundle.profile.headline or (latest.position if latest else None)
                or (f"{edu.program} graduate" if edu and edu.program else None) or "Candidate")
    years = _format_years(bundle.total_years_experience()) if bundle.experiences else ""
    experience = f"with {years} of experience" if years else "with hands-on experience"
    sentences = [f"{identity} {experience} in {_join(skills)}."]
    if latest:
        sentences.append(f"Most recently {latest.position} at {latest.company}.")
    if identity.strip().lower() != job.title.strip().lower():
        sentences.append(f"Looking to bring these skills to a {job.title} role.")
    return " ".join(sentences)


def _summary_change(b: _Builder, content: dict[str, Any], bundle: ProfileBundle, job: Job, terms: JobTerms) -> None:
    summary = targeted_summary(bundle, job, terms)
    if summary and summary != (content.get("summary") or ""):
        b.add(type="summary", section="summary", title="Targeted the summary to this role",
              before=content.get("summary"), after=summary,
              reason="Summarizes your real experience and the skills this job asks for that you have.")


# ---------------------------------------------------------------------------
# Scoring & public API
# ---------------------------------------------------------------------------


def _structure_score(content: dict[str, Any]) -> float:
    c = ResumeContent.model_validate(content)
    checks = [
        bool(c.contact.email), bool(c.contact.phone), bool(c.summary), bool(c.skills),
        bool(c.experience or c.projects),
        all(item.bullets for item in c.experience) if c.experience else bool(c.projects),
        bool(c.education),
        all(len(bl.text) <= 260 for item in [*c.experience, *c.projects] for bl in item.bullets),
    ]
    return sum(checks) / len(checks)


def evaluate(content: dict[str, Any], job: Job) -> tuple[int, list[str]]:
    """(ATS score 0-100, job keywords present in the content)."""
    terms = job_terms(job)
    present = content_skills(content)
    matched = [s for s in terms.skills if s in present]
    required = terms.required or terms.skills
    req_cov = len([s for s in required if s in present]) / len(required) if required else 1.0
    pref_cov = len([s for s in terms.preferred if s in present]) / len(terms.preferred) if terms.preferred else 1.0
    return round(55 * req_cov + 15 * pref_cov + 30 * _structure_score(content)), matched


@dataclass
class TailorResult:
    content: dict[str, Any]
    changes: list[dict[str, Any]]
    keywords_matched: list[str]
    keywords_missing: list[str]
    integrity_notes: list[str]
    ats_score: int

    @property
    def insights(self) -> dict[str, list[str]]:
        return {"keywords_matched": self.keywords_matched, "keywords_missing": self.keywords_missing,
                "integrity_notes": self.integrity_notes}


def _integrity_notes(missing: list[str], ai_rejected: int) -> list[str]:
    notes: list[str] = []
    if missing:
        shown = missing[:6]
        subject = _join(shown) + (f" and {len(missing) - len(shown)} more" if len(missing) > len(shown) else "")
        plural = len(missing) > 1
        notes.append(f"{subject} {'were' if plural else 'was'} not added because "
                     f"{'they aren' if plural else 'it isn'}'t in your profile.")
    if ai_rejected:
        notes.append(f"{ai_rejected} AI wording suggestion{'s were' if ai_rejected > 1 else ' was'} discarded "
                     "because it added details that aren't in your profile.")
    notes.append("Only facts from your profile and resume were used; your work history keeps its original order.")
    return notes


def tailor(bundle: ProfileBundle, base_content: dict[str, Any], job: Job, *,
           propose_changes: bool = True) -> TailorResult:
    """Propose job-specific changes to ``base_content``. With ``propose_changes=False`` only analyses."""
    base = ResumeContent.model_validate(base_content or {}).model_dump()
    terms = job_terms(job)
    allowed = bundle.skill_names | content_skills(base)
    missing = [s for s in terms.skills if s not in taxonomy.expand_with_implied(allowed)]
    b = _Builder()
    ai_rejected = 0
    if propose_changes:
        working = copy.deepcopy(base)
        _keyword_changes(b, bundle, working, terms)
        _emphasize_change(b, working, terms)
        ai_rejected = _rewrite_changes(b, working, terms, bundle, job, allowed)
        _reorder_changes(b, working, terms)
        _remove_changes(b, working, terms)
        _summary_change(b, working, bundle, job, terms)
    content = apply_changes(base, b.changes)
    score, matched = evaluate(content, job)
    return TailorResult(content=content, changes=b.changes, keywords_matched=matched, keywords_missing=missing,
                        integrity_notes=_integrity_notes(missing, ai_rejected), ats_score=score)
