"""Skill taxonomy: canonical skill names, aliases and categories.

Used to extract skills from job descriptions and resumes and to compare them in a
consistent, explainable way ("PostgreSQL" == "Postgres" == "psql").
"""

from __future__ import annotations

import re
from functools import lru_cache

# canonical name -> (category, [aliases]); aliases are matched case-insensitively on word boundaries
SKILLS: dict[str, tuple[str, list[str]]] = {
    # Programming languages
    "Python": ("programming", ["python3", "python 3"]),
    "Java": ("programming", ["java 8", "java 11", "java 17", "core java"]),
    "JavaScript": ("programming", ["javascript", "js", "ecmascript", "es6"]),
    "TypeScript": ("programming", ["typescript", "ts"]),
    "C#": ("programming", ["c#", "csharp", "c sharp"]),
    "C++": ("programming", ["c++", "cpp"]),
    "C": ("programming", []),
    "Go": ("programming", ["golang"]),
    "Rust": ("programming", []),
    "Ruby": ("programming", []),
    "PHP": ("programming", []),
    "Kotlin": ("programming", []),
    "Swift": ("programming", []),
    "Scala": ("programming", []),
    "R": ("programming", []),
    "SQL": ("programming", ["t-sql", "pl/sql", "tsql"]),
    "Bash": ("programming", ["shell scripting", "bash scripting", "shell"]),
    "PowerShell": ("programming", ["powershell"]),
    "HTML": ("programming", ["html5"]),
    "CSS": ("programming", ["css3", "scss", "sass"]),
    # Frameworks & libraries
    "React": ("frameworks", ["react.js", "reactjs"]),
    "Next.js": ("frameworks", ["nextjs", "next js"]),
    "Angular": ("frameworks", ["angularjs", "angular.js"]),
    "Vue.js": ("frameworks", ["vue", "vuejs"]),
    "Node.js": ("frameworks", ["node", "nodejs", "node js"]),
    "Express": ("frameworks", ["express.js", "expressjs"]),
    "Django": ("frameworks", []),
    "Django REST Framework": ("frameworks", ["django rest", "drf", "django-rest-framework"]),
    "Flask": ("frameworks", []),
    "FastAPI": ("frameworks", ["fast api"]),
    "Spring Boot": ("frameworks", ["springboot", "spring framework"]),
    ".NET": ("frameworks", ["dotnet", ".net core", "asp.net", "asp.net core"]),
    "Ruby on Rails": ("frameworks", ["rails"]),
    "Laravel": ("frameworks", []),
    "Tailwind CSS": ("frameworks", ["tailwind", "tailwindcss"]),
    "Bootstrap": ("frameworks", []),
    "jQuery": ("frameworks", []),
    "Redux": ("frameworks", []),
    "GraphQL": ("frameworks", []),
    "REST APIs": ("frameworks", ["restful", "rest api", "restful apis", "restful api", "web apis", "api development"]),
    "Pandas": ("frameworks", []),
    "NumPy": ("frameworks", ["numpy"]),
    "TensorFlow": ("frameworks", []),
    "PyTorch": ("frameworks", []),
    "scikit-learn": ("frameworks", ["sklearn", "scikit learn"]),
    "Hibernate": ("frameworks", []),
    "JUnit": ("frameworks", []),
    "pytest": ("frameworks", []),
    "Jest": ("frameworks", []),
    # Databases
    "PostgreSQL": ("databases", ["postgres", "postgresql", "psql"]),
    "MySQL": ("databases", []),
    "SQL Server": ("databases", ["mssql", "microsoft sql server", "ms sql"]),
    "Oracle Database": ("databases", ["oracle db", "oracle"]),
    "SQLite": ("databases", []),
    "MongoDB": ("databases", ["mongo"]),
    "Redis": ("databases", []),
    "Elasticsearch": ("databases", ["elastic search", "opensearch"]),
    "DynamoDB": ("databases", []),
    "Firebase": ("databases", ["firestore"]),
    # Cloud
    "AWS": ("cloud", ["amazon web services", "ec2", "s3", "lambda"]),
    "Azure": ("cloud", ["microsoft azure"]),
    "Google Cloud": ("cloud", ["gcp", "google cloud platform"]),
    "Heroku": ("cloud", []),
    "Vercel": ("cloud", []),
    # DevOps
    "Docker": ("devops", ["containers", "containerization"]),
    "Kubernetes": ("devops", ["k8s"]),
    "Terraform": ("devops", []),
    "Ansible": ("devops", []),
    "Jenkins": ("devops", []),
    "GitHub Actions": ("devops", []),
    "GitLab CI": ("devops", ["gitlab ci/cd"]),
    "CI/CD": ("devops", ["ci/cd", "continuous integration", "continuous deployment", "continuous delivery"]),
    "Linux": ("devops", ["unix", "ubuntu", "red hat", "rhel", "centos"]),
    "Nginx": ("devops", []),
    # Tools
    "Git": ("tools", ["github", "gitlab", "bitbucket", "version control"]),
    "Jira": ("tools", []),
    "Confluence": ("tools", []),
    "Postman": ("tools", []),
    "VS Code": ("tools", ["visual studio code"]),
    "Visual Studio": ("tools", []),
    "Figma": ("tools", []),
    "Excel": ("tools", ["microsoft excel", "ms excel"]),
    "Microsoft 365": ("tools", ["office 365", "microsoft office", "ms office", "o365"]),
    "Active Directory": ("tools", ["azure ad", "entra id"]),
    "Windows Server": ("tools", []),
    "Windows": ("tools", ["windows 10", "windows 11"]),
    "macOS": ("tools", ["mac os", "osx"]),
    "ServiceNow": ("tools", []),
    "Zendesk": ("tools", []),
    "TCP/IP": ("tools", ["networking", "dns", "dhcp", "lan", "wan", "vpn"]),
    "Troubleshooting": ("tools", ["troubleshoot", "diagnose"]),
    "Help Desk": ("tools", ["helpdesk", "service desk", "ticketing"]),
    "Hardware Support": ("tools", ["hardware", "desktop support"]),
    "Agile": ("tools", ["scrum", "kanban", "agile methodologies"]),
    "Unit Testing": ("tools", ["unit tests", "test-driven development", "tdd", "automated testing"]),
    "Microservices": ("tools", ["microservice"]),
    "Object-Oriented Programming": ("tools", ["oop", "object oriented", "object-oriented"]),
    "Data Structures & Algorithms": ("tools", ["data structures", "algorithms"]),
    # Soft skills
    "Communication": ("soft", ["communication skills", "written and verbal", "verbal communication", "written communication"]),
    "Teamwork": ("soft", ["collaboration", "team player", "collaborative", "cross-functional"]),
    "Problem Solving": ("soft", ["problem-solving", "analytical", "critical thinking"]),
    "Customer Service": ("soft", ["customer-facing", "client-facing", "customer support"]),
    "Time Management": ("soft", ["prioritize", "prioritization", "organized", "organizational skills"]),
    "Leadership": ("soft", ["mentoring", "mentorship", "lead a team"]),
    "Attention to Detail": ("soft", ["detail-oriented", "detail oriented"]),
    "Adaptability": ("soft", ["fast-paced", "adaptable", "eager to learn", "willingness to learn"]),
    # Certifications
    "CompTIA A+": ("certifications", ["a+ certification", "comptia a+"]),
    "CompTIA Network+": ("certifications", ["network+"]),
    "CompTIA Security+": ("certifications", ["security+"]),
    "CCNA": ("certifications", ["cisco certified network associate"]),
    "AWS Certified": ("certifications", ["aws certification", "aws certified solutions architect", "aws certified developer",
                                        "aws cloud practitioner"]),
    "Azure Certified": ("certifications", ["az-900", "az-104", "azure fundamentals", "azure administrator"]),
    "ITIL": ("certifications", ["itil foundation"]),
    "PMP": ("certifications", ["project management professional"]),
    "CISSP": ("certifications", []),
    "Microsoft Certified": ("certifications", ["mcsa", "mcse", "microsoft certification"]),
}

# Short/ambiguous names that should only match in exact-case or clear contexts.
_CASE_SENSITIVE = {"C", "R", "Go", "ts", "js", "Excel"}

# Skill implications: having the key implies familiarity with the values (used generously, never to fabricate).
IMPLIES: dict[str, list[str]] = {
    "Django REST Framework": ["Django", "REST APIs", "Python"],
    "Django": ["Python"],
    "Flask": ["Python"],
    "FastAPI": ["Python", "REST APIs"],
    "Spring Boot": ["Java"],
    "Next.js": ["React", "JavaScript"],
    "React": ["JavaScript"],
    "Express": ["Node.js", "JavaScript"],
    "Node.js": ["JavaScript"],
    "TypeScript": ["JavaScript"],
    "Kubernetes": ["Docker"],
    "GitHub Actions": ["CI/CD", "Git"],
    "GitLab CI": ["CI/CD", "Git"],
}

CATEGORY_LABELS = {
    "programming": "Programming",
    "frameworks": "Frameworks",
    "databases": "Databases",
    "cloud": "Cloud",
    "devops": "DevOps",
    "tools": "Tools",
    "soft": "Soft skills",
    "certifications": "Certifications",
    "other": "Other",
}


def _pattern_for(term: str, case_sensitive: bool) -> re.Pattern[str]:
    escaped = re.escape(term)
    # Word boundaries that also work for terms with symbols (C#, C++, .NET, Node.js, CI/CD)
    pattern = rf"(?<![A-Za-z0-9_+#.]){escaped}(?![A-Za-z0-9_+#]|\.[A-Za-z0-9])"
    return re.compile(pattern, 0 if case_sensitive else re.IGNORECASE)


@lru_cache
def _compiled() -> list[tuple[str, re.Pattern[str]]]:
    out: list[tuple[str, re.Pattern[str]]] = []
    for canonical, (_, aliases) in SKILLS.items():
        terms = {canonical, *aliases}
        for term in terms:
            cs = term in _CASE_SENSITIVE or canonical in {"C", "R", "Go"} and term == canonical
            out.append((canonical, _pattern_for(term, cs)))
    return out


@lru_cache
def _alias_index() -> dict[str, str]:
    idx: dict[str, str] = {}
    for canonical, (_, aliases) in SKILLS.items():
        idx[canonical.lower()] = canonical
        for a in aliases:
            idx.setdefault(a.lower(), canonical)
    return idx


def canonicalize(name: str) -> str:
    """Map a free-text skill name to its canonical form (or return it title-cased/trimmed)."""
    clean = name.strip()
    return _alias_index().get(clean.lower(), clean)


def category_of(name: str) -> str:
    entry = SKILLS.get(canonicalize(name))
    return entry[0] if entry else "other"


def extract_skills(text: str) -> list[str]:
    """Return canonical skills mentioned in ``text`` in order of first appearance."""
    if not text:
        return []
    found: dict[str, int] = {}
    for canonical, pattern in _compiled():
        m = pattern.search(text)
        if m and (canonical not in found or m.start() < found[canonical]):
            found[canonical] = m.start()
    # "C" and "R" are extremely noisy; require them to look like a language mention.
    for noisy in ("C", "R", "Go"):
        if noisy in found and not re.search(rf"(?:\b{noisy}\s*(?:/|,|\band\b|programming|language))|(?:,\s*{noisy}\b)", text):
            found.pop(noisy)
    return [k for k, _ in sorted(found.items(), key=lambda kv: kv[1])]


def expand_with_implied(skills: set[str]) -> set[str]:
    out = set(skills)
    for s in list(skills):
        out.update(IMPLIES.get(s, []))
    return out


def normalize_set(names: list[str] | set[str]) -> set[str]:
    return {canonicalize(n) for n in names if n and n.strip()}
