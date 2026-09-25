"""Interview preparation built from the job posting and the user's real profile.

Integrity: STAR stories, talking points and project notes are assembled ONLY from facts in
the user's profile (experience and project bullets, metrics, education). Where a story needs
information the profile doesn't contain, a clearly bracketed placeholder tells the user what
to add — nothing is invented. Optional AI polish only rewords, and is discarded if it
introduces skills or numbers that aren't in the source.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.models import Application, Company, Experience, Job, Project, User, utcnow
from app.schemas.tracking import InterviewPrep, PrepQuestion, StarStory
from app.services import llm, taxonomy
from app.services.profile_bundle import ProfileBundle, load_bundle
from app.services.templates_service import join_words

RESULT_PLACEHOLDER = "[Add the outcome — what changed and how you know]"
TASK_PLACEHOLDER = "[Add your specific responsibility — what were you asked or expected to deliver?]"
CONTEXT_PLACEHOLDER = "[Add one sentence of context — what problem or need made this work necessary?]"


# ---------------------------------------------------------------------------
# Technical topic map
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Topic:
    name: str
    skills: frozenset[str]
    subtopics: tuple[str, ...]
    questions: tuple[str, ...]


def _topic(name: str, skills: set[str], subtopics: tuple[str, ...], questions: tuple[str, ...]) -> Topic:
    return Topic(name, frozenset(skills), subtopics, questions)


TOPICS: tuple[Topic, ...] = (
    _topic("Python", {"Python", "Pandas", "NumPy"},
           ("Core data types, mutability and common built-ins", "Comprehensions and generators",
            "Exceptions and context managers (with)", "Virtual environments and dependency management",
            "Decorators and functions as objects"),
           ("What's the difference between a list and a tuple, and when would you use each?",
            "How do generators differ from lists, and when would you use one?",
            "How do you handle errors and clean up resources in Python?")),
    _topic("Django & Django REST Framework", {"Django", "Django REST Framework"},
           ("Models, migrations and the ORM", "select_related / prefetch_related and N+1 queries",
            "Serializers and validation", "ViewSets, routers and permissions", "Authentication options"),
           ("How would you find and fix an N+1 query problem in a Django view?",
            "Walk me through what happens when a request hits a Django REST Framework endpoint.",
            "How would you restrict an endpoint so users can only see their own records?")),
    _topic("Flask & FastAPI", {"Flask", "FastAPI"},
           ("Routing and request validation", "Dependency injection (FastAPI) and app factories (Flask)",
            "Sync vs async handlers", "Structuring a larger API project"),
           ("How do you validate request data in FastAPI or Flask?",
            "When does async actually help an API, and when doesn't it?")),
    _topic("Java & Spring", {"Java", "Spring Boot", "Hibernate", "JUnit"},
           ("OOP: interfaces, inheritance, polymorphism", "Collections and their performance",
            "Checked vs unchecked exceptions", "Spring Boot: dependency injection, controllers, JPA"),
           ("What's the difference between an interface and an abstract class?",
            "How does a HashMap work internally?",
            "How does dependency injection work in Spring Boot?")),
    _topic("JavaScript & React", {"JavaScript", "TypeScript", "React", "Next.js", "Redux", "Vue.js", "Angular"},
           ("Closures, scope and this", "Promises and async/await", "React state, props and hooks",
            "Rendering, keys and avoiding unnecessary re-renders", "Loading and error states when fetching data"),
           ("Explain the difference between state and props in React.",
            "What does useEffect's dependency array do, and what goes wrong if it's incorrect?",
            "How do promises and async/await relate to each other?")),
    _topic("Node.js & Express", {"Node.js", "Express"},
           ("The event loop and non-blocking I/O", "Middleware", "Error handling in async routes",
            "Environment configuration"),
           ("What is the Node.js event loop, and why does blocking it matter?",
            "How does middleware work in Express?")),
    _topic("SQL & relational databases", {"SQL", "PostgreSQL", "MySQL", "SQL Server", "SQLite", "Oracle Database"},
           ("JOIN types and when to use each", "GROUP BY, aggregates and HAVING",
            "Indexes: how they speed up reads and what they cost", "Transactions and isolation",
            "Normalization vs denormalization"),
           ("Write a query that returns the top 3 customers by total order value.",
            "What's the difference between an INNER JOIN and a LEFT JOIN?",
            "A query got slow as the table grew. How would you investigate?")),
    _topic("NoSQL & caching", {"MongoDB", "Redis", "DynamoDB", "Firebase", "Elasticsearch"},
           ("Document vs relational modelling", "Indexes in document stores", "Caching patterns and invalidation"),
           ("When would you choose a document database over a relational one?",
            "How would you keep a cache consistent with the database?")),
    _topic("REST APIs", {"REST APIs", "GraphQL", "Microservices", "Postman"},
           ("HTTP methods and idempotency", "Status codes (200, 201, 400, 401, 403, 404, 409, 500)",
            "Resource naming, pagination and filtering", "Authentication (sessions, tokens, OAuth)",
            "Versioning and backwards compatibility"),
           ("Design the endpoints for a simple task-tracking API.",
            "What's the difference between PUT and PATCH?",
            "When would you return 401 versus 403?")),
    _topic("Docker & containers", {"Docker", "Kubernetes"},
           ("Images vs containers; layers and build caching", "Writing a Dockerfile for a web app",
            "docker compose for local multi-service setups", "Configuration and secrets"),
           ("What's the difference between a Docker image and a container?",
            "How would you make a Docker image smaller and faster to build?")),
    _topic("Git, CI/CD & collaboration", {"Git", "GitHub Actions", "GitLab CI", "CI/CD", "Jenkins"},
           ("Branching and pull-request workflow", "Merge vs rebase", "Resolving merge conflicts",
            "What a CI pipeline should run"),
           ("How do you resolve a merge conflict?",
            "What's the difference between merge and rebase?",
            "What would you put in a CI pipeline for a web application?")),
    _topic("Linux & the command line", {"Linux", "Bash", "Nginx"},
           ("File permissions and ownership", "Processes, services and logs (systemctl, journalctl)",
            "Searching and filtering (grep, find, pipes)", "SSH and basic networking commands"),
           ("How would you find which process is using port 8080?",
            "A service failed to start. How do you find out why?")),
    _topic("Cloud platforms", {"AWS", "Azure", "Google Cloud", "Heroku", "Vercel"},
           ("Core services: compute, storage, managed databases", "Identity and access management (least privilege)",
            "Deploying a web app and managing configuration", "Monitoring and cost awareness"),
           ("How would you deploy a small web application to the cloud?",
            "What does least privilege mean for cloud permissions?")),
    _topic("Testing", {"Unit Testing", "pytest", "JUnit", "Jest"},
           ("Unit vs integration vs end-to-end tests", "Fixtures, mocks and test data",
            "Keeping tests reliable (avoiding flaky tests)", "What coverage does and doesn't tell you"),
           ("How do you decide what to unit test?",
            "When would you mock a dependency, and when would you avoid it?")),
    _topic("Programming fundamentals", {"Object-Oriented Programming", "Data Structures & Algorithms", "C#", ".NET",
                                        "C++", "C", "Go"},
           ("Encapsulation, inheritance, polymorphism", "Arrays, hash maps, stacks, queues and trees",
            "Big-O of common operations", "SOLID principles"),
           ("How would you check whether a string has all unique characters? What's the complexity?",
            "Explain polymorphism using an example from code you've written.")),
    _topic("Networking & troubleshooting", {"TCP/IP", "Troubleshooting"},
           ("DNS, DHCP, IP addressing and subnets", "The OSI model at a practical level",
            "Connectivity tools (ping, ipconfig, tracert, nslookup)",
            "A structured method: identify, isolate, fix, verify, document"),
           ("A user can't reach the internet. Walk me through how you'd troubleshoot it.",
            "What does DNS do, and how would you tell if it's causing a problem?",
            "What happens when you type a URL into a browser and press Enter?")),
    _topic("Help desk & end-user support", {"Help Desk", "Customer Service", "Hardware Support", "ServiceNow",
                                            "Zendesk", "Windows", "macOS", "Microsoft 365"},
           ("Ticket triage, prioritization and SLAs", "Explaining fixes to non-technical users",
            "Common Windows and Microsoft 365 issues (Outlook, OneDrive, Teams, printers)",
            "Writing knowledge-base articles", "When and how to escalate"),
           ("Several urgent tickets arrive at once. How do you prioritize?",
            "How would you help a frustrated user whose laptop won't connect to Wi-Fi?",
            "How do you explain a technical fix to someone who isn't technical?")),
    _topic("Active Directory & identity", {"Active Directory", "Windows Server", "PowerShell"},
           ("Users, groups and organizational units", "Password resets and account lockouts",
            "Group Policy basics", "NTFS vs share permissions", "Automating admin tasks with PowerShell"),
           ("How would you handle a user who is locked out of their account?",
            "What's the difference between a security group and a distribution group?",
            "What is Group Policy used for? Give an example.")),
)
_SKILL_TO_TOPIC = {skill: topic for topic in TOPICS for skill in topic.skills}
MAX_TOPICS = 8


# ---------------------------------------------------------------------------
# Behavioral themes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Theme:
    key: str
    pattern: re.Pattern[str]
    question: str


def _theme(key: str, pattern: str, question: str) -> Theme:
    return Theme(key, re.compile(pattern, re.IGNORECASE), question)


THEMES: tuple[Theme, ...] = (
    _theme("users", r"customer|client|end.?user|\busers?\b|stakeholder|staff",
           "Tell me about a time you helped a frustrated user or customer."),
    _theme("teamwork", r"team|collaborat|cross.?functional|pair|peer|review",
           "Describe a time you worked closely with others to deliver something."),
    _theme("priorities", r"deadline|priorit|multiple|fast.?paced|multitask|volume|per week",
           "Tell me about a time you had to juggle competing priorities."),
    _theme("documentation", r"document|knowledge.?base|guide|wiki|confluence",
           "How do you document your work so others can pick it up?"),
    _theme("mentoring", r"mentor|\blead\b|led\b|train|onboard|taught",
           "Tell me about a time you helped someone else learn or improve."),
    _theme("pressure", r"troubleshoot|incident|outage|on.?call|ticket|urgent|resolv|fix",
           "Describe a time you fixed an urgent problem under pressure."),
    _theme("design", r"design|architect|scal|migrat|refactor",
           "Tell me about a technical decision you made and the trade-offs you considered."),
    _theme("quality", r"test|quality|coverage|validation|bug",
           "How do you make sure your work is correct before it ships?"),
    _theme("improvement", r"reduc|improv|automat|optimi|faster|sav(ed|ing)|cut\b|increas",
           "Tell me about a time you improved a process or system."),
)


def _themes_of(text: str) -> list[str]:
    return [t.key for t in THEMES if t.pattern.search(text)]


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------


@dataclass
class JobFacts:
    title: str
    company: str
    job: Job | None
    required: list[str]
    other_skills: list[str]
    responsibilities: list[str]

    @property
    def all_skills(self) -> list[str]:
        return list(dict.fromkeys([*self.required, *self.other_skills]))


def _canonical_list(names: list[str]) -> list[str]:
    return list(dict.fromkeys(taxonomy.canonicalize(n) for n in names if n and n.strip()))


def _job_facts(application: Application) -> JobFacts:
    job = application.job
    req = (job.requirements if job else None) or {}
    required = _canonical_list(req.get("required_skills", []))
    other = [s for s in _canonical_list([*req.get("preferred_skills", []), *req.get("technologies", [])])
             if s not in required]
    if job and not required and not other:
        other = taxonomy.extract_skills(f"{job.title}\n{job.description or ''}")
    return JobFacts(title=application.job_title, company=application.company_name, job=job, required=required,
                    other_skills=other, responsibilities=list(req.get("responsibilities", [])))


def _period(start: date | None, end: date | None) -> str:
    if not start:
        return ""
    return f"{start:%b %Y} – {end:%b %Y}" if end else f"{start:%b %Y} – present"


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------


def company_overview(company: Company | None, company_name: str) -> str:
    if company is None or not any([company.description, company.industry, company.products, company.facts]):
        return (f"We don't have researched details about {company_name} yet. Before the interview, read their "
                "website's About and Careers pages, recent news, and what the product or service this team supports "
                "does for its customers.")
    parts = [f"{company.name}: {company.description}" if company.description else company.name + "."]
    if company.industry:
        parts.append(f"Industry: {company.industry}.")
    if company.headquarters:
        parts.append(f"Headquarters: {company.headquarters}.")
    if company.size:
        parts.append(f"Size: {company.size}.")
    if company.products:
        parts.append(f"Products and services: {join_words(company.products[:4])}.")
    if company.tech_stack:
        parts.append(f"Technology mentioned: {join_words(company.tech_stack[:6])}.")
    verified = [f["text"] for f in company.facts or [] if f.get("kind") == "verified" and f.get("text")][:3]
    if verified:
        parts.append("Verified facts: " + " ".join(v.rstrip(".") + "." for v in verified))
    return " ".join(parts)


def role_summary(facts: JobFacts) -> str:
    job = facts.job
    details = []
    if job:
        level = f"{job.experience_level} level" if job.experience_level else None
        details = [job.location, (job.work_arrangement or "").replace("_", " "),
                   (job.employment_type or "").replace("_", " "), level]
    head = f"{facts.title} at {facts.company}"
    details = [d for d in details if d]
    text = f"{head} ({', '.join(details)})." if details else f"{head}."
    if facts.responsibilities:
        text += " Key responsibilities: " + "; ".join(r.rstrip(".") for r in facts.responsibilities[:4]) + "."
    min_years = ((job.requirements or {}).get("min_years_experience") if job else None)
    if min_years:
        text += f" The posting asks for {min_years:g}+ years of experience."
    if facts.required:
        text += f" Required skills: {join_words(facts.required[:8])}."
    return text


def technical_topics(facts: JobFacts) -> list[Topic]:
    topics: list[Topic] = []
    for skill in facts.all_skills:
        topic = _SKILL_TO_TOPIC.get(skill)
        if topic and topic not in topics:
            topics.append(topic)
    return topics[:MAX_TOPICS]


def _topic_dict(topic: Topic, facts: JobFacts, mine: set[str]) -> dict:
    named = [s for s in facts.all_skills if s in topic.skills]
    required = [s for s in named if s in facts.required]
    mentioned = [s for s in named if s not in required]
    parts = []
    if required:
        parts.append(f"{join_words(required)} {'is' if len(required) == 1 else 'are'} required in the posting.")
    if mentioned:
        parts.append(f"The posting {'also ' if required else ''}mentions {join_words(mentioned)}.")
    have = [s for s in named if s in mine]
    missing = [s for s in named if s not in mine]
    if have:
        parts.append(f"You list {join_words(have)}, so expect follow-up questions about how you've used "
                     f"{'it' if len(have) == 1 else 'them'}.")
    if missing:
        parts.append(f"{join_words(missing)} {'isn' if len(missing) == 1 else 'aren'}'t in your profile yet, so "
                     "review the fundamentals.")
    return {"topic": topic.name, "why": " ".join(parts), "subtopics": list(topic.subtopics)}


# ---------------------------------------------------------------------------
# STAR stories (facts only)
# ---------------------------------------------------------------------------

# "…, saving 45 minutes per device" / "… — reducing errors by 35%": a trailing outcome clause.
_OUTCOME_CLAUSE = re.compile(r"(?:,|;|\s[–—-])\s+((?:saving|reducing|cutting|improving|increasing|resulting in|"
                             r"which|lowering|raising|boosting|shortening)\b[^,;]*\d[^,;]*)$", re.IGNORECASE)
_NUMBER = re.compile(r"\d")


@dataclass
class _Story:
    story: StarStory
    skills: set[str]
    themes: list[str]
    score: float
    origin: str


def _title(text: str) -> str:
    words = text.rstrip(".").split()
    title = " ".join(words[:9])
    return title + ("…" if len(words) > 9 else "")


def _split_result(bullet: str, metrics: list[str]) -> tuple[str, str]:
    """(action, result) for a bullet, using only what the profile states."""
    text = bullet.strip().rstrip(".")
    outcome = _OUTCOME_CLAUSE.search(text)
    if outcome:
        result = outcome.group(1)
        return text[: outcome.start()].rstrip() + ".", result[0].upper() + result[1:] + "."
    numbers = set(re.findall(r"\d+(?:\.\d+)?", text))
    for metric in metrics:
        if numbers & set(re.findall(r"\d+(?:\.\d+)?", metric)):
            return text + ".", metric.strip().rstrip(".") + "."
    if numbers:
        return text + ".", "[State the outcome in one sentence — this bullet already has the numbers to use]"
    return text + ".", RESULT_PLACEHOLDER


def _experience_stories(exp: Experience, job_skills: set[str], recency: int) -> list[_Story]:
    achievements = list(exp.achievements or [])
    responsibilities = list(exp.responsibilities or [])
    bullets = list(dict.fromkeys([*achievements, *responsibilities]))[:4]
    source = f"{exp.position} at {exp.company}"
    period = _period(exp.start_date, exp.end_date)
    situation = f"{exp.position} at {exp.company}" + (f" ({period})" if period else "") + ". " + CONTEXT_PLACEHOLDER
    tech = taxonomy.normalize_set(exp.technologies or [])
    out: list[_Story] = []
    for bullet in bullets:
        action, result = _split_result(bullet, list(exp.metrics or []))
        task = TASK_PLACEHOLDER
        if bullet in achievements and responsibilities:
            task = f"Part of your role: {responsibilities[0].rstrip('.')}."
        skills = tech | set(taxonomy.extract_skills(bullet))
        themes = _themes_of(bullet)
        score = 2 * len(skills & job_skills) + (0 if result.startswith("[") else 1.5) - 0.3 * recency
        out.append(_Story(StarStory(title=_title(action), source=source, situation=situation, task=task,
                                    action=action, result=result, fits_questions=[]),
                          skills, themes, score, source))
    return out


def _project_story(project: Project, job_skills: set[str]) -> _Story:
    responsibilities = list(project.responsibilities or [])
    tech = taxonomy.normalize_set(project.technologies or [])
    situation = f"Project: {project.name}" + (f" — {project.description.rstrip('.')}." if project.description
                                               else f". {CONTEXT_PLACEHOLDER}")
    task = f"{responsibilities[0].rstrip('.')}." if len(responsibilities) > 1 else TASK_PLACEHOLDER
    steps = responsibilities[1:] if len(responsibilities) > 1 else responsibilities
    action = "; ".join(s.rstrip(".") for s in steps) + "." if steps else "[Describe the key steps you took]"
    if tech:
        action += f" Built with {join_words(sorted(tech))}."
    result = project.results[0].rstrip(".") + "." if project.results else RESULT_PLACEHOLDER
    text = " ".join([project.description or "", *responsibilities, *(project.results or [])])
    score = 2 * len(tech & job_skills) + (1.5 if project.results else 0) - 0.5
    return _Story(StarStory(title=f"Built {project.name}", source=f"Project: {project.name}", situation=situation,
                            task=task, action=action, result=result, fits_questions=[]),
                  tech | set(taxonomy.extract_skills(text)), _themes_of(text), score, f"Project: {project.name}")


def star_stories(bundle: ProfileBundle, job_skills: set[str], limit: int = 5) -> list[_Story]:
    candidates: list[_Story] = []
    for i, exp in enumerate(bundle.experiences):
        candidates += _experience_stories(exp, job_skills, i)
    candidates += [_project_story(p, job_skills) for p in bundle.projects]
    chosen: list[_Story] = []
    per_source: dict[str, int] = {}
    for c in sorted(candidates, key=lambda c: c.score, reverse=True):
        if per_source.get(c.origin, 0) >= 2:
            continue
        per_source[c.origin] = per_source.get(c.origin, 0) + 1
        chosen.append(c)
        if len(chosen) == limit:
            break
    for c in chosen:
        fits = [t.question for t in THEMES if t.key in c.themes][:3]
        c.story.fits_questions = fits or ["Tell me about a project you're proud of."]
    return chosen


def _story_for(stories: list[_Story], *, theme: str | None = None, skills: set[str] | None = None) -> str | None:
    for s in stories:
        if (theme and theme in s.themes) or (skills and s.skills & skills):
            return s.story.title
    return None


# ---------------------------------------------------------------------------
# Questions
# ---------------------------------------------------------------------------

_STAR_TIP = "Use STAR: one sentence of situation, one of task, most of your time on what you did, then the result."


def behavioral_questions(facts: JobFacts, stories: list[_Story]) -> list[PrepQuestion]:
    top_story = stories[0].story.title if stories else None
    questions = [
        PrepQuestion(question="Tell me about yourself.", why="Almost every interview opens with this.",
                     tips=["Keep it to 60–90 seconds: current role, relevant experience, why this role.",
                           f"Finish by connecting your experience to the {facts.title} role."]),
        PrepQuestion(question=f"Why do you want to work at {facts.company}?",
                     why="Interviewers check that you've researched them and chose them deliberately.",
                     tips=["Mention something specific from the company overview.",
                           "Link it to the kind of work you want to do next."]),
        PrepQuestion(question="Tell me about a time you solved a difficult problem.",
                     why="A standard behavioral question for technical roles.", tips=[_STAR_TIP],
                     suggested_story=_story_for(stories, theme="pressure") or top_story),
        PrepQuestion(question="Tell me about a mistake you made and what you learned from it.",
                     why="Tests self-awareness and accountability.",
                     tips=["Choose a real, moderate mistake.",
                           "Spend most of the answer on what you changed afterwards."]),
        PrepQuestion(question="Tell me about a time you had to learn something new quickly.",
                     why="Common for early-career roles where you'll pick up new tools.", tips=[_STAR_TIP],
                     suggested_story=_story_for(stories, theme="design") or top_story),
    ]
    asked = {q.question for q in questions}
    for resp in facts.responsibilities:
        for theme in THEMES:
            if theme.question in asked or not theme.pattern.search(resp):
                continue
            asked.add(theme.question)
            questions.append(PrepQuestion(
                question=theme.question, why=f"The posting mentions: “{resp.rstrip('.')[:140]}”.", tips=[_STAR_TIP],
                suggested_story=_story_for(stories, theme=theme.key)))
    return questions[:10]


def technical_questions(topics: list[Topic], facts: JobFacts, bundle: ProfileBundle,
                        stories: list[_Story]) -> list[PrepQuestion]:
    out: list[PrepQuestion] = []
    for topic in topics:
        named = [s for s in facts.all_skills if s in topic.skills]
        project = next((p for p in bundle.projects
                        if taxonomy.normalize_set(p.technologies or []) & topic.skills), None)
        tips = ["Explain the concept first, then give a concrete example from your own work."]
        if project:
            used = sorted(taxonomy.normalize_set(project.technologies) & topic.skills)
            tips.append(f"Your {project.name} project uses {join_words(used)} — use it as your example.")
        why = f"{join_words(named)} {'is' if len(named) == 1 else 'are'} in the posting."
        story = _story_for(stories, skills=set(topic.skills))
        out += [PrepQuestion(question=q, why=why, tips=tips, suggested_story=story) for q in topic.questions[:2]]
    return out[:12]


def questions_to_ask(facts: JobFacts, company: Company | None) -> list[str]:
    questions = [f"What would success look like in the first 90 days for this {facts.title}?",
                 "How is the team structured, and who would I work with most closely?"]
    stack = facts.required[:2] or facts.other_skills[:2]
    if stack:
        questions.append(f"The posting mentions {join_words(stack)}. How are they used day to day, and how does "
                         "work get from a pull request to production?")
    responsibilities = " ".join(facts.responsibilities).lower()
    if re.search(r"ticket|support|help.?desk|user", responsibilities):
        questions.append("What does a typical week of tickets look like, and how does escalation work?")
    if company and company.products:
        questions.append(f"How does this role contribute to {company.products[0]}?")
    questions += ["What are the biggest challenges the team is working on right now?",
                  "How do you support learning and growth for people in this role?",
                  "What are the next steps in the interview process?"]
    return questions[:8]


# ---------------------------------------------------------------------------
# Projects, talking points and gaps
# ---------------------------------------------------------------------------


def relevant_projects(bundle: ProfileBundle, job_skills: set[str]) -> list[dict]:
    ranked = []
    for p in bundle.projects:
        overlap = sorted(taxonomy.normalize_set(p.technologies or []) & job_skills)
        if overlap:
            ranked.append((len(overlap), p, overlap))
    ranked.sort(key=lambda r: r[0], reverse=True)
    out = []
    for _, p, overlap in ranked[:3]:
        points = [r.rstrip(".") + "." for r in [*(p.results or []), *(p.responsibilities or [])][:3]]
        points.append("Be ready to explain one technical decision you made and what you'd do differently now.")
        out.append({"name": p.name, "why": f"Uses {join_words(overlap)}, which the posting asks for.",
                    "talking_points": points, "url": p.github_url or p.demo_url})
    return out


def talking_points(bundle: ProfileBundle, facts: JobFacts) -> list[str]:
    mine = bundle.skill_names_with_implied
    points: list[str] = []
    matched = [s for s in facts.required if s in mine]
    if facts.required:
        which = f" ({join_words(matched[:6])})" if matched else ""
        points.append(f"You match {len(matched)} of {len(facts.required)} required skills{which}. "
                      "Have one concrete example ready for each.")
    if bundle.experiences:
        latest = bundle.experiences[0]
        points.append(f"Most recent role: {latest.position} at {latest.company}.")
    measurable = [b for e in bundle.experiences for b in [*(e.achievements or []), *(e.responsibilities or [])]
                  if _NUMBER.search(b)]
    points += [f"Lead with measurable work: “{b.rstrip('.')}.”" for b in measurable[:3]]
    education = bundle.highest_education()
    if education:
        degree = " in ".join(x for x in [education.degree, education.program] if x)
        points.append(f"Education: {degree + ', ' if degree else ''}{education.institution}.")
    return points


def gaps_to_prepare(bundle: ProfileBundle, facts: JobFacts) -> list[str]:
    mine = bundle.skill_names_with_implied
    gaps: list[str] = []
    for skill in [s for s in facts.required if s not in mine][:5]:
        category = taxonomy.category_of(skill)
        related = sorted(s for s in bundle.skill_names if taxonomy.category_of(s) == category and s != skill)[:2]
        bridge = (f"connect it to your experience with {join_words(related)}" if related
                  else "describe how you learn new tools quickly, using a real example")
        gaps.append(f"{skill}: not in your profile. Say so plainly, then {bridge}, and explain how you'd ramp up "
                    "(for example, documentation or a small practice project).")
    req = (facts.job.requirements or {}) if facts.job else {}
    min_years = req.get("min_years_experience")
    have_years = bundle.total_years_experience()
    if min_years and have_years < float(min_years):
        gaps.append(f"The posting asks for {float(min_years):g}+ years of experience; your profile shows about "
                    f"{have_years:g}. Emphasise the depth of what you delivered rather than the time spent.")
    for cert in req.get("certifications", []):
        if taxonomy.canonicalize(cert) not in bundle.certifications:
            gaps.append(f"{cert} is mentioned. If you don't hold it, say whether you're working toward it — never "
                        "imply that you have it.")
    return gaps


# ---------------------------------------------------------------------------
# Optional AI polish (integrity-guarded)
# ---------------------------------------------------------------------------


def _numbers(text: str) -> set[str]:
    return set(re.findall(r"\d+(?:\.\d+)?", text))


def polish_talking_points(points: list[str], bundle: ProfileBundle, job_skills: set[str]) -> list[str]:
    """Reword talking points with Claude when available; keep the originals if anything new is introduced."""
    if not points or not llm.available():
        return points
    source = "\n".join(points)
    text = llm.generate(
        "You help a job candidate prepare interview talking points.",
        "Rewrite each line below as a concise, natural talking point the candidate could say aloud. Keep exactly one "
        "output line per input line, in the same order, with no numbering or extra commentary. Keep all facts and "
        f"numbers exactly as given and add none.\n\n{source}",
        max_tokens=1500,
    )
    if not text:
        return points
    lines = [ln.strip(" -•\t") for ln in text.splitlines() if ln.strip()]
    if (len(lines) != len(points) or not _numbers(text) <= _numbers(source)
            or llm.unsupported_claims(text, bundle.skill_names, job_skills)):
        return points
    return lines


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def generate_prep(db: Session, application: Application) -> dict:
    """Interview preparation for ``application`` as an ``InterviewPrep`` dict (JSON-serializable)."""
    user = db.get_one(User, application.user_id)
    bundle = load_bundle(db, user)
    facts = _job_facts(application)
    job_skills = set(facts.all_skills)
    mine = bundle.skill_names_with_implied
    company = facts.job.company if facts.job else None
    stories = star_stories(bundle, job_skills)
    topics = technical_topics(facts)
    prep = InterviewPrep(
        company_overview=company_overview(company, facts.company),
        role_summary=role_summary(facts),
        required_skills=facts.required or facts.other_skills[:8],
        technical_topics=[_topic_dict(t, facts, mine) for t in topics],
        behavioral_questions=behavioral_questions(facts, stories),
        technical_questions=technical_questions(topics, facts, bundle, stories),
        star_stories=[s.story for s in stories],
        questions_to_ask=questions_to_ask(facts, company),
        relevant_projects=relevant_projects(bundle, job_skills),
        talking_points=polish_talking_points(talking_points(bundle, facts), bundle, job_skills),
        gaps_to_prepare=gaps_to_prepare(bundle, facts),
        generated_at=utcnow(),
    )
    return prep.model_dump(mode="json")
