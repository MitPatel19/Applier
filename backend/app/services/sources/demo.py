"""Demo job source: deterministic, realistic sample postings from FICTIONAL companies.

Used when a real source isn't connected and ``APPLIER_DEMO_MODE`` is on, so the whole
pipeline (search → dedupe → analyze → score → recommend) can be explored safely. Every
posting is flagged ``is_demo`` and every URL is on example.com.

The catalogue holds 82 unique jobs published as 126 postings across LinkedIn, Indeed and
company career sites, with slightly different titles, company names, locations and ids per
source — so duplicate merging has real work to do. A few postings are deliberately
problematic (suspicious, US-only, certification required, closing soon, old).
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.models import User, utcnow
from app.schemas.jobs import SearchFilters
from app.services.dedup import normalize_company
from app.services.sources.base import RawPosting, SourceStatus
from app.services.sources.filtering import check_posting

SOURCE_CODES = {"L": "linkedin", "I": "indeed", "C": "company_site"}
SOURCE_LABELS = {"linkedin": "LinkedIn", "indeed": "Indeed", "company_site": "Company Website"}
GROUP_OF_SOURCE = {"linkedin": "linkedin", "indeed": "indeed", "company_site": "company_sites"}
NOISE_RATE = 0.15  # share of non-matching jobs still returned so scoring has something to rank


# ---------------------------------------------------------------------------
# Fictional companies
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DemoCompany:
    key: str
    name: str
    legal_suffix: str  # appended on some sources, e.g. "Inc."
    industry: str
    size: str
    headquarters: str
    description: str
    products: tuple[str, ...]
    benefits: tuple[str, ...]
    team: str = "engineering"
    suspicious: bool = False

    @property
    def website(self) -> str | None:
        return None if self.suspicious else f"https://{self.key}.example.com"

    @property
    def careers_url(self) -> str | None:
        return None if self.suspicious else f"https://jobs.example.com/{self.key}"

    def profile(self) -> dict[str, Any]:
        """Company profile fields used by company research (sample data)."""
        return {
            "name": self.name, "industry": self.industry, "size": self.size, "headquarters": self.headquarters,
            "website": self.website, "careers_url": self.careers_url, "description": self.description,
            "products": list(self.products), "benefits": list(self.benefits),
        }


_STD_BENEFITS = ("Extended health, dental and vision coverage from day one", "RRSP matching up to 4%",
                 "Three weeks of paid vacation plus personal days", "Annual learning budget of $1,500")

COMPANIES: dict[str, DemoCompany] = {c.key: c for c in [
    DemoCompany("borealis", "Borealis Software", "Inc.", "Logistics software (SaaS)", "51-200 employees",
                "Thunder Bay, ON",
                "Borealis Software builds route-planning and fleet-visibility software used by regional carriers "
                "across Northern Ontario and the Prairies.",
                ("Borealis Route Planner", "Fleet Pulse dashboards", "Driver mobile app"),
                _STD_BENEFITS + ("Hybrid schedule with two office days in Thunder Bay",)),
    DemoCompany("superior-logistics", "Superior Logistics Tech", "Corp.", "Freight technology", "201-500 employees",
                "Thunder Bay, ON",
                "Superior Logistics Tech runs a freight-tracking platform connecting shippers, rail yards and "
                "trucking partners on the Lake Superior corridor.",
                ("CargoTrack platform", "Yard scheduling API", "Carrier portal"),
                _STD_BENEFITS + ("Defined-contribution pension plan",), team="platform"),
    DemoCompany("northern-lakes", "Northern Lakes Health Informatics", "Ltd.", "Health information technology",
                "201-500 employees", "Thunder Bay, ON",
                "Northern Lakes Health Informatics connects rural clinics and nursing stations to shared electronic "
                "health records, with a focus on privacy and reliable connectivity.",
                ("ClinicLink EHR integration", "Telehealth scheduling", "Secure messaging for care teams"),
                ("Health and dental benefits", "HOOPP-style pension plan", "Paid volunteer day",
                 "Flexible hours for non-clinical staff"), team="clinical systems"),
    DemoCompany("kaministiquia-data", "Kaministiquia Data Co.", "", "Data analytics consulting", "11-50 employees",
                "Thunder Bay, ON",
                "Kaministiquia Data Co. is a small analytics consultancy helping municipalities, co-ops and "
                "resource companies turn their data into dashboards and forecasts.",
                ("Municipal analytics dashboards", "Forestry yield forecasting", "Data engineering services"),
                ("Health spending account", "Flexible hours", "Conference budget"), team="analytics"),
    DemoCompany("maple-circuit", "Maple Circuit Labs", "Inc.", "IoT hardware and software", "51-200 employees",
                "Waterloo, ON",
                "Maple Circuit Labs designs low-power environmental sensors and the cloud platform that collects "
                "their data for farms and greenhouses.",
                ("GrowSense sensors", "Maple Cloud telemetry", "Field technician app"),
                _STD_BENEFITS + ("Stock options",)),
    DemoCompany("tamarack-cloud", "Tamarack Cloud Systems", "Inc.", "Cloud infrastructure", "201-500 employees",
                "Toronto, ON",
                "Tamarack Cloud Systems offers managed Kubernetes and database hosting for Canadian companies that "
                "need their data to stay in Canada.",
                ("Tamarack Managed Kubernetes", "Canadian-resident Postgres hosting", "Observability suite"),
                _STD_BENEFITS + ("$500 home-office stipend",), team="infrastructure"),
    DemoCompany("loonstone", "Loonstone Technologies", "Corp.", "Document management software", "501-1000 employees",
                "Ottawa, ON",
                "Loonstone Technologies builds records and document-management software for public-sector "
                "organizations, with bilingual (English/French) interfaces.",
                ("Loonstone Records", "e-Signature workflows", "Accessibility-compliant portals"),
                _STD_BENEFITS + ("Defined-benefit pension plan", "Bilingualism bonus")),
    DemoCompany("granite-shield", "Granite Shield IT Services", "Ltd.", "Managed IT services", "11-50 employees",
                "Thunder Bay, ON",
                "Granite Shield IT Services is a managed service provider supporting clinics, law offices and "
                "First Nations organizations across Northwestern Ontario.",
                ("Managed help desk", "Network monitoring", "Microsoft 365 migrations"),
                ("Health and dental benefits", "Paid certification exams", "Company vehicle for site visits"),
                team="service desk"),
    DemoCompany("birchline", "Birchline Financial Technologies", "Inc.", "Financial technology", "201-500 employees",
                "Toronto, ON",
                "Birchline Financial Technologies builds online-banking and lending software for Canadian credit "
                "unions.",
                ("Birchline Digital Banking", "Loan origination platform", "Member mobile app"),
                _STD_BENEFITS + ("Annual performance bonus",)),
    DemoCompany("rideau-byte", "Rideau Byte Labs", "Inc.", "Accessibility software", "51-200 employees",
                "Ottawa, ON",
                "Rideau Byte Labs makes automated accessibility-testing tools that help teams ship web apps that "
                "meet WCAG and AODA standards.",
                ("A11y Scanner", "Screen-reader test lab", "Compliance reports"),
                _STD_BENEFITS + ("Four-day work week in summer",)),
    DemoCompany("prairie-signal", "Prairie Signal Networks", "Ltd.", "Telecommunications", "501-1000 employees",
                "Winnipeg, MB",
                "Prairie Signal Networks monitors rural broadband and cellular networks across Manitoba and "
                "Saskatchewan.",
                ("SignalWatch monitoring", "Field dispatch system", "Customer self-service portal"),
                _STD_BENEFITS + ("Employee phone and internet plan",), team="network systems"),
    DemoCompany("harbourfront-cloudworks", "Harbourfront Cloudworks", "Inc.", "E-commerce software",
                "51-200 employees", "Toronto, ON",
                "Harbourfront Cloudworks runs an e-commerce platform for independent Canadian retailers, from "
                "storefronts to inventory and payments.",
                ("Storefront builder", "Inventory sync", "Merchant analytics"),
                _STD_BENEFITS + ("Remote-friendly culture",), team="product engineering"),
    DemoCompany("aurora-fjord", "Aurora Fjord Analytics", "Inc.", "Business intelligence software",
                "51-200 employees", "Winnipeg, MB",
                "Aurora Fjord Analytics is a remote-first company building self-serve BI dashboards for "
                "mid-sized Canadian businesses.",
                ("Fjord Dashboards", "Data connectors", "Embedded analytics SDK"),
                _STD_BENEFITS + ("Remote-first with quarterly team meetups",), team="data platform"),
    DemoCompany("kestrel-birch", "Kestrel & Birch Software", "Inc.", "Education technology", "51-200 employees",
                "Waterloo, ON",
                "Kestrel & Birch Software builds a learning-management system used by colleges and training "
                "providers across Canada.",
                ("Kestrel LMS", "Course authoring tools", "Student success analytics"),
                _STD_BENEFITS + ("Tuition reimbursement",)),
    DemoCompany("cascadia-northstar", "Cascadia Northstar Software", "LLC", "Developer tools", "51-200 employees",
                "Seattle, WA",
                "Cascadia Northstar Software builds CI/CD analytics for engineering teams in the United States.",
                ("Pipeline Insights", "Flaky-test detector"),
                ("Medical, dental and vision insurance", "401(k) matching", "Unlimited PTO")),
    DemoCompany("quickhire-global", "QuickHire Global Staffing", "", "Staffing", "Unknown", "Unknown",
                "", (), (), suspicious=True),
    DemoCompany("starpath-remote", "StarPath Remote Solutions", "", "Staffing", "Unknown", "Unknown",
                "", (), (), suspicious=True),
]}


def demo_company_profile(name: str) -> dict[str, Any] | None:
    """Sample-data profile for a demo company name (any suffix/format), else None."""
    wanted = normalize_company(name)
    for company in COMPANIES.values():
        if normalize_company(company.name) == wanted and not company.suspicious:
            return company.profile()
    return None


# ---------------------------------------------------------------------------
# Role content
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RoleContent:
    summary: str
    responsibilities: tuple[str, ...]
    required: tuple[str, ...]  # requirement bullets naming skills
    senior_required: tuple[str, ...]
    preferred: tuple[str, ...]
    education: str = "Diploma or degree in Computer Science, Software Engineering or a related field"


ROLES: dict[str, RoleContent] = {
    "software": RoleContent(
        "You'll build and maintain the web applications and APIs behind our products, working in a small "
        "cross-functional team.",
        ("Design, build and test new features across our web application and REST APIs",
         "Write clean, well-tested code and take part in code reviews",
         "Work with product and design to break down requirements into deliverable tasks",
         "Investigate and fix production issues with the support team",
         "Improve automated tests and our CI/CD pipeline",
         "Document services and share knowledge with the team"),
        ("Experience with Python or Java in a professional or project setting",
         "Working knowledge of SQL and relational databases such as PostgreSQL",
         "Experience building or consuming REST APIs",
         "Comfortable with Git and code review workflows"),
        ("Experience designing microservices and leading technical decisions",
         "Experience mentoring other developers"),
        ("Experience with Docker", "Exposure to AWS or Azure", "Familiarity with React", "Agile/Scrum experience")),
    "python": RoleContent(
        "You'll develop Python services and APIs that power our platform and integrations.",
        ("Build and maintain backend services in Python and Django",
         "Design REST APIs used by our web and mobile apps",
         "Write unit tests with pytest and keep coverage high",
         "Optimize PostgreSQL queries and data models",
         "Participate in code reviews and sprint planning",
         "Help automate deployments with Docker and GitHub Actions"),
        ("Strong Python skills", "Experience with Django or Flask",
         "Experience with REST APIs and PostgreSQL", "Proficiency with Git"),
        ("Experience designing scalable backend architecture", "Experience with AWS in production"),
        ("Django REST Framework", "Docker", "AWS", "CI/CD experience", "Linux")),
    "backend_python": RoleContent(
        "You'll own backend services that ingest, process and serve data for our customers.",
        ("Develop backend services and data pipelines in Python",
         "Build and document REST APIs with FastAPI or Django REST Framework",
         "Model data in PostgreSQL and Redis",
         "Write automated tests and monitor services in production",
         "Collaborate with front-end developers on API contracts"),
        ("Professional experience with Python", "Experience with REST APIs and SQL",
         "Experience with PostgreSQL", "Familiarity with Git and Linux"),
        ("Experience with microservices and message queues", "Experience with Kubernetes"),
        ("FastAPI", "Django REST Framework", "Docker", "Redis", "AWS")),
    "java": RoleContent(
        "You'll build reliable Java services for a platform our customers depend on every day.",
        ("Develop and maintain Java services using Spring Boot",
         "Design and implement REST APIs",
         "Write unit and integration tests with JUnit",
         "Work with SQL databases and Hibernate",
         "Participate in design reviews and on-call rotation"),
        ("Experience with Java and Spring Boot", "Experience with SQL databases",
         "Experience with REST APIs", "Proficiency with Git"),
        ("Experience with microservices and Kubernetes", "Experience leading technical design"),
        ("Hibernate", "Docker", "Kubernetes", "AWS", "Agile experience")),
    "fullstack": RoleContent(
        "You'll work across the stack, from React interfaces to Node.js and Python services.",
        ("Build user-facing features with React and TypeScript",
         "Develop APIs with Node.js or Python",
         "Work with PostgreSQL and MongoDB data stores",
         "Write tests with Jest and take part in code reviews",
         "Collaborate with designers using Figma"),
        ("Experience with JavaScript and React", "Experience with Node.js or Python on the backend",
         "Experience with SQL databases", "Knowledge of HTML and CSS", "Proficiency with Git"),
        ("Experience owning features end to end at scale", "Experience with AWS architecture"),
        ("TypeScript", "Next.js", "Docker", "AWS", "GraphQL")),
    "frontend": RoleContent(
        "You'll craft accessible, fast interfaces used by thousands of people each day.",
        ("Build responsive interfaces with React and TypeScript",
         "Turn Figma designs into accessible components",
         "Write component tests with Jest",
         "Work with backend developers on API integration"),
        ("Experience with JavaScript, HTML and CSS", "Experience with React", "Experience with Git"),
        ("Experience with design systems and performance optimization",),
        ("TypeScript", "Next.js", "Tailwind CSS", "Figma", "GraphQL")),
    "devops": RoleContent(
        "You'll keep our platform reliable, automated and secure.",
        ("Maintain Kubernetes clusters and Terraform infrastructure",
         "Improve CI/CD pipelines with GitHub Actions",
         "Monitor services and respond to incidents",
         "Automate routine operations with Bash and Python"),
        ("Experience with Linux and Docker", "Experience with CI/CD pipelines", "Experience with AWS or Azure",
         "Scripting with Bash or Python"),
        ("Experience with Kubernetes and Terraform in production",),
        ("Kubernetes", "Terraform", "Ansible", "Nginx")),
    "dotnet": RoleContent(
        "You'll develop .NET applications for our banking and records products.",
        ("Develop features in C# and .NET", "Work with SQL Server databases", "Build REST APIs",
         "Write unit tests and take part in code reviews"),
        ("Experience with C# and .NET", "Experience with SQL Server", "Experience with Git"),
        ("Experience with Azure architecture",),
        ("Azure", "Angular", "Docker")),
    "qa": RoleContent(
        "You'll help us ship reliable software by designing tests and improving our quality practices.",
        ("Write and execute test plans for new features", "Build automated tests in Python",
         "Log and track defects in Jira", "Test APIs with Postman", "Participate in Agile ceremonies"),
        ("Experience with manual and automated testing", "Experience with Jira", "Basic SQL skills",
         "Strong attention to detail"),
        ("Experience building a test automation framework",),
        ("Python", "pytest", "Postman", "CI/CD experience")),
    "data": RoleContent(
        "You'll turn raw operational data into dashboards, reports and insights for decision makers.",
        ("Write SQL to extract and clean data", "Build dashboards and reports",
         "Analyze trends with Python and Pandas", "Present findings to non-technical stakeholders"),
        ("Strong SQL skills", "Advanced Excel", "Experience with Python for analysis",
         "Clear written and verbal communication"),
        ("Experience leading analytics projects", "Experience with data modelling"),
        ("Pandas", "Power BI or Tableau", "PostgreSQL", "Google Cloud")),
    "itsupport": RoleContent(
        "You'll be the friendly first point of contact for staff who need help with their technology.",
        ("Respond to help desk tickets by phone, email and in person",
         "Set up and troubleshoot Windows laptops, printers and mobile devices",
         "Manage user accounts in Active Directory and Microsoft 365",
         "Document solutions in our knowledge base", "Escalate network issues to the systems team"),
        ("Experience with Windows and Microsoft 365", "Troubleshooting hardware and software issues",
         "Experience with Active Directory", "Excellent customer service skills"),
        ("Experience supporting a multi-site organization",),
        ("TCP/IP networking basics", "PowerShell", "ITIL Foundation", "ServiceNow")),
    "techsupport": RoleContent(
        "You'll help customers get the most out of our software, solving problems by phone, chat and email.",
        ("Troubleshoot customer issues through Zendesk", "Reproduce bugs and escalate them to developers",
         "Write help-centre articles", "Identify trends in customer issues"),
        ("Excellent customer service and communication skills", "Strong troubleshooting skills",
         "Comfortable learning new software quickly"),
        ("Experience leading a support queue",),
        ("SQL", "Zendesk", "Linux", "Jira")),
    "sysadmin": RoleContent(
        "You'll keep our servers, networks and cloud services secure and running smoothly.",
        ("Administer Linux and Windows Server environments", "Manage Active Directory and group policy",
         "Automate tasks with PowerShell and Bash", "Maintain backups, patching and monitoring",
         "Support network infrastructure (DNS, DHCP, VPN)"),
        ("Experience with Linux and Windows Server", "Experience with Active Directory",
         "Scripting with PowerShell or Bash", "Networking fundamentals (TCP/IP)"),
        ("Experience designing hybrid cloud environments",),
        ("Azure", "AWS", "Ansible", "Terraform")),
}

PRIMARY_SKILL = {"software": "Python or Java", "python": "Python", "backend_python": "Python", "java": "Java",
                 "fullstack": "React", "frontend": "React", "devops": "Docker and Kubernetes", "dotnet": "C# and .NET",
                 "qa": "test automation", "data": "SQL", "itsupport": "Microsoft 365 and Active Directory",
                 "techsupport": "customer-facing technical support", "sysadmin": "Linux and Windows Server"}

LEVEL_YEARS = {"entry": "0-1 years of experience (co-op, internship or project experience counts)",
               "junior": "1-2 years of experience in a similar role",
               "intermediate": "3+ years of professional experience",
               "senior": "5+ years of professional experience", "lead": "7+ years of professional experience"}


# ---------------------------------------------------------------------------
# Job catalogue
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DemoJob:
    idx: int
    company: str
    title: str
    role: str
    level: str
    location: str
    arrangement: str
    employment: str
    salary: tuple[float, float] | None
    days_ago: int
    deadline_in: int | None
    sources: str  # e.g. "LIC" = LinkedIn + Indeed + company site
    extras: frozenset[str] = field(default_factory=frozenset)


TB, TOR, WAT, OTT, WPG = "Thunder Bay, ON", "Toronto, ON", "Waterloo, ON", "Ottawa, ON", "Winnipeg, MB"
REMOTE_CA, REMOTE_US = "Remote (Canada)", "Remote (US)"
FT, PT, CT, INT, COOP = "full_time", "part_time", "contract", "internship", "co_op"

_ROWS: list[tuple] = [
    # Thunder Bay
    ("borealis", "Junior Software Developer", "software", "junior", TB, "hybrid", FT, (58000, 70000), 2, None, "LIC"),
    ("borealis", "Python Developer", "python", "intermediate", TB, "hybrid", FT, (72000, 88000), 5, None, "LI"),
    ("borealis", "Senior Software Developer", "software", "senior", TB, "hybrid", FT, (95000, 115000), 12, None, "LI"),
    ("borealis", "QA Analyst", "qa", "junior", TB, "onsite", FT, None, 20, None, "I"),
    ("superior-logistics", "Junior Python Developer", "python", "junior", TB, "onsite", FT, (55000, 65000), 1, 4, "LI"),
    ("superior-logistics", "Full Stack Developer", "fullstack", "intermediate", TB, "hybrid", FT, (70000, 85000), 8,
     None, "LC"),
    ("superior-logistics", "Java Developer", "java", "intermediate", TB, "onsite", FT, (68000, 82000), 15, None, "I"),
    ("superior-logistics", "Data Analyst", "data", "junior", TB, "hybrid", FT, (52000, 62000), 26, None, "L"),
    ("northern-lakes", "IT Support Technician", "itsupport", "junior", TB, "onsite", FT, (45000, 52000), 3, 3, "LI",
     {"cert"}),
    ("northern-lakes", "Junior Backend Developer", "backend_python", "junior", TB, "hybrid", FT, (57000, 68000), 6,
     None, "LIC"),
    ("northern-lakes", "Systems Administrator", "sysadmin", "intermediate", TB, "onsite", FT, (65000, 78000), 18, None,
     "L"),
    ("northern-lakes", "Technical Support Analyst", "techsupport", "junior", TB, "onsite", FT, None, 30, None, "LI"),
    ("kaministiquia-data", "Junior Data Analyst", "data", "junior", TB, "hybrid", FT, (50000, 58000), 4, None, "LI",
     {"province_only_indeed"}),
    ("kaministiquia-data", "Backend Developer (Python)", "backend_python", "intermediate", TB, "hybrid", CT, (38, 45),
     10, None, "I"),
    ("kaministiquia-data", "Software Developer Co-op", "software", "entry", TB, "onsite", COOP, (20, 23), 7, 5, "C"),
    ("granite-shield", "IT Support Specialist", "itsupport", "junior", TB, "onsite", FT, (46000, 54000), 9, None, "LI",
     {"cert"}),
    ("granite-shield", "Help Desk Technician", "itsupport", "entry", TB, "onsite", PT, (21, 24), 13, None, "I"),
    ("granite-shield", "Junior Systems Administrator", "sysadmin", "junior", TB, "onsite", FT, (52000, 60000), 22,
     None, "LC"),
    ("borealis", "Front End Developer", "frontend", "intermediate", TB, "hybrid", FT, (68000, 80000), 33, None, "L"),
    ("superior-logistics", "Senior Java Developer", "java", "senior", TB, "hybrid", FT, (98000, 120000), 11, None,
     "LI"),
    ("northern-lakes", "QA Automation Developer", "qa", "intermediate", TB, "hybrid", FT, (65000, 76000), 16, None,
     "C"),
    ("kaministiquia-data", "Junior Full Stack Developer", "fullstack", "junior", TB, "hybrid", FT, None, 2, None, "L"),
    # Toronto
    ("tamarack-cloud", "DevOps Engineer", "devops", "intermediate", TOR, "hybrid", FT, (95000, 115000), 3, None, "LI"),
    ("tamarack-cloud", "Junior Software Developer", "software", "junior", TOR, "hybrid", FT, (62000, 72000), 5, None,
     "LIC"),
    ("tamarack-cloud", "Senior Python Developer", "python", "senior", TOR, "hybrid", FT, (120000, 140000), 9, None,
     "L"),
    ("birchline", "Java Developer", "java", "intermediate", TOR, "hybrid", FT, (85000, 100000), 6, None, "LI"),
    ("birchline", "Junior QA Analyst", "qa", "junior", TOR, "hybrid", FT, (55000, 62000), 14, None, "I"),
    ("birchline", "Data Analyst", "data", "intermediate", TOR, "hybrid", FT, (70000, 82000), 21, None, "L"),
    ("birchline", ".NET Developer", "dotnet", "intermediate", TOR, "onsite", FT, (80000, 95000), 27, None, "I"),
    ("harbourfront-cloudworks", "Full Stack Developer", "fullstack", "intermediate", TOR, "hybrid", FT,
     (80000, 98000), 4, None, "LI"),
    ("harbourfront-cloudworks", "Front End Developer", "frontend", "junior", TOR, "hybrid", CT, None, 12, None, "L"),
    ("harbourfront-cloudworks", "Technical Support Specialist", "techsupport", "junior", TOR, "hybrid", FT,
     (48000, 55000), 8, 2, "LI"),
    ("harbourfront-cloudworks", "Senior Backend Developer", "backend_python", "senior", TOR, "hybrid", FT,
     (115000, 135000), 17, None, "C"),
    ("tamarack-cloud", "Systems Administrator", "sysadmin", "intermediate", TOR, "onsite", FT, (75000, 90000), 24, None,
     "I"),
    ("birchline", "Software Developer Intern", "software", "entry", TOR, "hybrid", INT, (24, 28), 2, 6, "LC"),
    ("harbourfront-cloudworks", "Python Developer", "python", "junior", TOR, "hybrid", FT, (65000, 75000), 35, None,
     "I"),
    # Waterloo
    ("maple-circuit", "Software Developer", "software", "intermediate", WAT, "onsite", FT, (78000, 92000), 3, None,
     "LIC"),
    ("maple-circuit", "Junior Python Developer", "python", "junior", WAT, "hybrid", FT, (60000, 70000), 7, None, "LI"),
    ("maple-circuit", "QA Engineer", "qa", "intermediate", WAT, "onsite", FT, (72000, 85000), 19, None, "L"),
    ("maple-circuit", "Senior Full Stack Developer", "fullstack", "senior", WAT, "hybrid", FT, (110000, 130000), 10,
     None, "I"),
    ("kestrel-birch", "Junior Full Stack Developer", "fullstack", "junior", WAT, "hybrid", FT, (60000, 70000), 1, None,
     "LI"),
    ("kestrel-birch", "Java Developer", "java", "intermediate", WAT, "hybrid", FT, (80000, 95000), 14, None, "LC"),
    ("kestrel-birch", "Technical Support Specialist", "techsupport", "entry", WAT, "onsite", FT, (44000, 50000), 23,
     None, "I"),
    ("kestrel-birch", "Data Analyst", "data", "junior", WAT, "hybrid", CT, None, 5, None, "L"),
    ("maple-circuit", "IT Support Technician", "itsupport", "junior", WAT, "onsite", FT, (47000, 53000), 28, None, "I"),
    ("kestrel-birch", "Software Developer Co-op", "software", "entry", WAT, "onsite", COOP, (22, 26), 9, 3, "C"),
    # Ottawa
    ("loonstone", "Java Developer", "java", "intermediate", OTT, "hybrid", FT, (82000, 98000), 4, None, "LI"),
    ("loonstone", "Junior Software Developer", "software", "junior", OTT, "hybrid", FT, (60000, 70000), 6, None, "LI"),
    ("loonstone", "Senior Java Developer", "java", "senior", OTT, "hybrid", FT, (110000, 128000), 13, None, "L"),
    ("loonstone", "Systems Administrator", "sysadmin", "intermediate", OTT, "onsite", FT, (72000, 86000), 20, None,
     "IC"),
    ("rideau-byte", "QA Analyst", "qa", "junior", OTT, "hybrid", FT, (54000, 62000), 3, None, "LI"),
    ("rideau-byte", "Front End Developer", "frontend", "intermediate", OTT, "hybrid", FT, (75000, 88000), 11, None,
     "L"),
    ("rideau-byte", "Python Developer", "python", "intermediate", OTT, "hybrid", FT, (78000, 92000), 16, None, "LI"),
    ("rideau-byte", "Technical Support Analyst", "techsupport", "junior", OTT, "hybrid", FT, (50000, 57000), 25, None,
     "L"),
    ("loonstone", "Junior .NET Developer", "dotnet", "junior", OTT, "onsite", FT, (58000, 66000), 8, None, "I"),
    ("rideau-byte", "Data Analyst", "data", "intermediate", OTT, "hybrid", FT, None, 30, None, "I"),
    # Winnipeg
    ("prairie-signal", "Junior Java Developer", "java", "junior", WPG, "hybrid", FT, (56000, 66000), 2, None, "LI",
     {"province_only_indeed"}),
    ("prairie-signal", "Systems Administrator", "sysadmin", "intermediate", WPG, "onsite", FT, (68000, 80000), 9, None,
     "L"),
    ("prairie-signal", "IT Support Technician", "itsupport", "entry", WPG, "onsite", FT, (42000, 48000), 15, None, "I"),
    ("prairie-signal", "Python Developer", "python", "intermediate", WPG, "hybrid", FT, (74000, 88000), 5, None, "LC"),
    ("aurora-fjord", "Data Analyst", "data", "junior", WPG, "hybrid", FT, (55000, 63000), 7, None, "LI"),
    ("aurora-fjord", "Full Stack Developer", "fullstack", "intermediate", WPG, "hybrid", FT, (75000, 90000), 18, None,
     "IC"),
    ("prairie-signal", "QA Analyst", "qa", "junior", WPG, "onsite", FT, None, 22, None, "L"),
    ("aurora-fjord", "Senior Data Analyst", "data", "senior", WPG, "hybrid", FT, (88000, 102000), 29, None, "I"),
    ("prairie-signal", "Technical Support Specialist", "techsupport", "junior", WPG, "onsite", PT, (20, 23), 12, None,
     "I"),
    # Remote (Canada)
    ("aurora-fjord", "Junior Python Developer", "python", "junior", REMOTE_CA, "remote", FT, (60000, 70000), 1, None,
     "LIC"),
    ("aurora-fjord", "Backend Developer (Python)", "backend_python", "intermediate", REMOTE_CA, "remote", FT,
     (80000, 95000), 6, None, "LI"),
    ("tamarack-cloud", "Junior DevOps Engineer", "devops", "junior", REMOTE_CA, "remote", FT, (65000, 75000), 10, None,
     "L"),
    ("harbourfront-cloudworks", "Junior Full Stack Developer", "fullstack", "junior", REMOTE_CA, "remote", FT,
     (62000, 72000), 3, None, "LI"),
    ("borealis", "Junior Python Developer", "python", "junior", REMOTE_CA, "remote", FT, (58000, 68000), 4, 5, "LI"),
    ("kestrel-birch", "Front End Developer", "frontend", "intermediate", REMOTE_CA, "remote", FT, (78000, 90000), 8,
     None, "I"),
    ("birchline", "Senior Software Developer", "software", "senior", REMOTE_CA, "remote", FT, (125000, 145000), 15,
     None, "L"),
    ("loonstone", "QA Automation Engineer", "qa", "intermediate", REMOTE_CA, "remote", CT, (45, 55), 12, None, "I"),
    ("rideau-byte", "Junior Software Developer", "software", "junior", REMOTE_CA, "remote", FT, None, 2, None, "LI"),
    ("prairie-signal", "IT Support Specialist", "itsupport", "junior", REMOTE_CA, "remote", FT, (45000, 52000), 17,
     None, "L", {"cert"}),
    ("maple-circuit", "Python Developer", "python", "intermediate", REMOTE_CA, "remote", CT, (50, 60), 20, None, "IC"),
    ("superior-logistics", "Technical Support Specialist", "techsupport", "junior", REMOTE_CA, "remote", FT,
     (47000, 54000), 26, None, "I"),
    ("kaministiquia-data", "Data Analyst", "data", "intermediate", REMOTE_CA, "remote", CT, None, 32, None, "L"),
    ("northern-lakes", "Junior Java Developer", "java", "junior", REMOTE_CA, "remote", FT, (60000, 70000), 9, None,
     "LI"),
    # United States / suspicious
    ("cascadia-northstar", "Python Developer", "python", "intermediate", REMOTE_US, "remote", FT, (110000, 130000), 5,
     None, "LI", {"us_auth"}),
    ("quickhire-global", "Remote Data Entry & IT Assistant", "itsupport", "entry", REMOTE_CA, "remote", PT, None, 1,
     None, "I", {"suspicious_fee"}),
    ("starpath-remote", "Junior Help Desk Associate (Work From Home)", "itsupport", "entry", REMOTE_CA, "remote", FT,
     (95000, 110000), 3, None, "L", {"suspicious_bank"}),
]

CATALOGUE: list[DemoJob] = [
    DemoJob(i + 1, *row[:11], extras=frozenset(row[11]) if len(row) > 11 else frozenset())
    for i, row in enumerate(_ROWS)
]


# ---------------------------------------------------------------------------
# Posting generation
# ---------------------------------------------------------------------------

_EMPLOYMENT_TEXT = {FT: "This is a full-time, permanent position.", PT: "This is a part-time position (about 20 "
                    "hours per week).", CT: "This is a 12-month contract position with the possibility of extension.",
                    INT: "This is a 4-month internship (January–April).", COOP: "This is a 4-month co-op placement "
                    "for students enrolled in a college or university co-op program."}


def _salary_line(job: DemoJob) -> str | None:
    if not job.salary:
        return None
    lo, hi = job.salary
    currency = "USD" if "us_auth" in job.extras else "CAD"
    if lo < 1000:
        return f"Pay: ${lo:g} – ${hi:g} per hour ({currency})."
    return f"Salary: ${lo:,.0f} – ${hi:,.0f} per year ({currency}), depending on experience."


def _where(job: DemoJob) -> str:
    if job.arrangement == "remote":
        region = "the United States" if job.location == REMOTE_US else "Canada"
        return f"This is a fully remote position open to candidates across {region}."
    city = job.location.split(",")[0]
    if job.arrangement == "hybrid":
        return f"This is a hybrid role with two to three days a week in our {city} office."
    return f"This role is on-site at our {city} office."


def _suspicious_description(job: DemoJob) -> str:
    if "suspicious_fee" in job.extras:
        return (
            "Work from home and earn $1,500/week! No experience needed.\n\n"
            "What you'll do\n- Enter data into online forms\n- Answer basic computer questions for our clients\n\n"
            "Requirements\n- A computer and internet connection\n- Willingness to learn\n\n"
            "How to apply\nSend your resume to quickhire.recruiting@gmail.com. Successful applicants must purchase "
            "a $99 starter kit (training fee) before their first shift. Payment by gift card or wire transfer.")
    return (
        "Join our fast-growing remote help desk team! No experience required — full training provided.\n\n"
        "What you'll do\n- Help customers reset passwords\n- Log calls in our system\n\n"
        "Requirements\n- Reliable internet\n- Good communication skills\n\n"
        "How to apply\nTo be considered, message our hiring manager on Telegram and provide your bank account "
        "details and SIN number for payroll setup before the interview.")


def _description(job: DemoJob, *, include_salary: bool) -> str:
    if job.extras & {"suspicious_fee", "suspicious_bank"}:
        return _suspicious_description(job)
    company = COMPANIES[job.company]
    role = ROLES[job.role]
    rng = random.Random(job.idx * 7919)
    responsibilities = rng.sample(role.responsibilities, k=min(5, len(role.responsibilities)))
    required = list(role.required)
    if job.level in ("senior", "lead"):
        required += list(role.senior_required)
    preferred = rng.sample(role.preferred, k=min(3, len(role.preferred)))
    about_role = [f"We're hiring a {job.title} to join our {company.team} team. {role.summary}", _where(job),
                  _EMPLOYMENT_TEXT[job.employment]]
    if include_salary and (salary := _salary_line(job)):
        about_role.append(salary)
    req_lines = [LEVEL_YEARS[job.level], role.education, *required,
                 "Clear written and verbal communication and a collaborative approach"]
    if "cert" in job.extras:
        req_lines.append("CompTIA A+ certification (required)")
    if "us_auth" in job.extras:
        req_lines.append("Must be legally authorized to work in the United States without visa sponsorship; "
                         "we are unable to sponsor visas")
    else:
        req_lines.append("Legally eligible to work in Canada")
    how_to = "Apply with your resume and a short note about a project you're proud of."
    if job.deadline_in is not None:
        how_to += " Applications close on {deadline}."
    questions = ["Are you legally eligible to work in Canada?" if "us_auth" not in job.extras else
                 "Are you legally authorized to work in the United States?",
                 f"How many years of experience do you have with {PRIMARY_SKILL[job.role]}?"]
    parts = [
        f"About us\n{company.description}",
        "About the role\n" + " ".join(about_role),
        "What you'll do\n" + "\n".join(f"- {r}" for r in responsibilities),
        "Requirements\n" + "\n".join(f"- {r}" for r in req_lines),
        "Nice to have\n" + "\n".join(f"- {p}" for p in preferred),
        "Benefits\n" + "\n".join(f"- {b}" for b in company.benefits),
        "How to apply\n" + how_to + "\n" + "\n".join(f"- {q}" for q in questions),
    ]
    return "\n\n".join(parts)


def _title_variant(job: DemoJob, source: str) -> str:
    if source == "indeed":
        title = job.title.replace("Junior ", "Jr. ").replace("Senior ", "Sr. ")
        return f"{title} - {job.location.split(',')[0]}" if job.arrangement != "remote" else title
    return job.title


def _location_variant(job: DemoJob, source: str) -> str:
    if job.arrangement == "remote":
        region = "US" if job.location == REMOTE_US else "Canada"
        return {"linkedin": f"{region} (Remote)", "indeed": f"Remote, {region}"}.get(source, f"Remote - {region}")
    city, prov = [p.strip() for p in job.location.split(",")]
    long_prov = {"ON": "Ontario", "MB": "Manitoba"}[prov]
    if source == "indeed":
        if "province_only_indeed" in job.extras:
            return long_prov
        return f"{city}, {long_prov}"
    if source == "company_site":
        return f"{city}, {prov}, Canada"
    return job.location + (" (Hybrid)" if job.arrangement == "hybrid" else "")


def _external_id(job: DemoJob, source: str) -> str:
    digest = hashlib.sha1(f"{source}:{job.idx}".encode()).hexdigest()
    if source == "linkedin":
        return f"li-{3_800_000 + int(digest[:6], 16) % 900_000}"
    if source == "indeed":
        return f"in-{digest[:12]}"
    return f"{job.company}-{1000 + job.idx}"


def _posting(job: DemoJob, source: str, now: datetime) -> RawPosting:
    company = COMPANIES[job.company]
    # LinkedIn copies of some jobs omit the salary; merging with Indeed fills it in.
    include_salary = not (source == "linkedin" and job.idx % 3 == 0 and len(job.sources) > 1)
    salary = job.salary if include_salary else None
    offset_hours = {"company_site": 0, "linkedin": 5, "indeed": 20}[source]
    posted_at = now - timedelta(days=job.days_ago, hours=(job.idx * 3) % 9) + timedelta(hours=offset_hours)
    posted_at = min(posted_at, now)
    deadline: date | None = (now + timedelta(days=job.deadline_in)).date() if job.deadline_in is not None else None
    description = _description(job, include_salary=include_salary)
    if deadline:
        description = description.replace("{deadline}", f"{deadline:%B} {deadline.day}, {deadline.year}")
    ext = _external_id(job, source)
    structured = source != "indeed"  # Indeed demo postings rely on description parsing
    with_suffix = source != "linkedin" and company.legal_suffix
    name = f"{company.name} {company.legal_suffix}" if with_suffix else company.name
    return RawPosting(
        source=source,
        source_label=SOURCE_LABELS[source],
        external_id=ext,
        title=_title_variant(job, source),
        company_name=name,
        description=description,
        url=f"https://jobs.example.com/{job.company}/{1000 + job.idx}" if source == "company_site"
        else f"https://listings.example.com/{source}/{ext}",
        apply_url=f"https://jobs.example.com/{job.company}/{1000 + job.idx}/apply",
        location=_location_variant(job, source),
        work_arrangement=job.arrangement if structured else None,
        employment_type=job.employment if structured else None,
        experience_level=job.level if structured else None,
        salary_min=int(salary[0] + 0.5) if salary else None,
        salary_max=int(salary[1] + 0.5) if salary else None,
        salary_period=("hourly" if salary[0] < 1000 else "yearly") if salary else None,
        currency=("USD" if "us_auth" in job.extras else "CAD") if salary else None,
        posted_at=posted_at,
        deadline=deadline,
        department=company.team.title() if not company.suspicious else None,
        company_website=company.website,
        company_careers_url=company.careers_url,
        raw={"demo_job": job.idx},
        is_demo=True,
    )


def _noise_pick(job: DemoJob) -> bool:
    return int(hashlib.sha1(f"noise:{job.idx}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF < NOISE_RATE


def all_postings(now: datetime | None = None, source_group: str | None = None) -> list[RawPosting]:
    """Every demo posting (optionally only one source group: linkedin | indeed | company_sites)."""
    now = now or utcnow()
    out: list[RawPosting] = []
    for job in CATALOGUE:
        for code in job.sources:
            source = SOURCE_CODES[code]
            if source_group is None or GROUP_OF_SOURCE[source] == source_group:
                out.append(_posting(job, source, now))
    return out


class DemoSource:
    """Sample postings. ``source_group`` limits it to the slice of one real source."""

    def __init__(self, source_group: str | None = None, label: str | None = None) -> None:
        self.key = source_group or "demo"
        self.source_group = source_group
        self.label = label or "Sample jobs"

    def status(self, db: Session, user: User) -> SourceStatus:
        target = {"linkedin": "connect LinkedIn", "indeed": "connect Indeed",
                  "company_sites": "add employer job boards"}.get(self.key, "connect a job source")
        return SourceStatus(self.key, self.label, "demo", f"Showing sample jobs — {target} to search real postings")

    def search(self, db: Session, user: User, filters: SearchFilters, *, limit: int = 200) -> list[RawPosting]:
        """Loose filtering: hard filters always apply; jobs failing soft filters are kept as occasional noise."""
        now = utcnow()
        out: list[RawPosting] = []
        for job in CATALOGUE:
            postings = [_posting(job, SOURCE_CODES[c], now) for c in job.sources
                        if self.source_group is None or GROUP_OF_SOURCE[SOURCE_CODES[c]] == self.source_group]
            if not postings:
                continue
            reference = next((p for p in postings if p.source != "indeed"), postings[0])
            check = check_posting(reference, filters)
            if check.hard_ok and (not check.soft_failures or _noise_pick(job)):
                out.extend(postings)
        return out[:limit]
