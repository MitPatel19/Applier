from __future__ import annotations

import pytest

from app.models import UserPreference
from app.services.query_parser import parse_query

EXAMPLE = ("Find junior Python and Java developer jobs in Thunder Bay and remote Canada, posted within the last "
           "7 days, paying at least $55,000.")


def chips(parsed) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for c in parsed.interpretation:
        out.setdefault(c.field, []).append(c.value)
    return out


def test_reference_query():
    parsed = parse_query(EXAMPLE)
    f = parsed.filters
    assert f.roles == ["Python Developer", "Java Developer"]
    assert f.keywords == ["Python", "Java"]
    assert f.experience_levels == ["junior"]
    assert f.locations == ["Thunder Bay, ON"]
    assert f.remote_regions == ["Canada"]
    assert f.work_arrangements == []  # mixed on-site + remote search must not restrict arrangement
    assert f.posted_within_days == 7
    assert (f.salary_min, f.salary_period) == (55000, "yearly")
    assert parsed.warnings == []
    assert parsed.suggested_name == "Junior Python/Java Developer — Thunder Bay + Remote Canada"
    c = chips(parsed)
    assert c["locations"] == ["Thunder Bay, ON"] and c["remote_regions"] == ["Canada"]
    assert c["salary_min"] == ["$55,000 / year"] and c["posted_within_days"] == ["Last 7 days"]
    assert all(chip.label for chip in parsed.interpretation)


@pytest.mark.parametrize("text,days", [
    ("python jobs posted last week", 7),
    ("python jobs from the past month", 30),
    ("python jobs posted today", 1),
    ("python jobs in the last 3 days", 3),
    ("python jobs posted in the past two weeks", 14),
    ("python jobs within the last 24 hours", 1),
])
def test_recency(text, days):
    assert parse_query(text).filters.posted_within_days == days


@pytest.mark.parametrize("text,amount,period", [
    ("IT support paying $25/hour", 25, "hourly"),
    ("developer jobs $70k+", 70000, "yearly"),
    ("developer jobs at least 60k", 60000, "yearly"),
    ("developer jobs with salary of $80,000 per year", 80000, "yearly"),
    ("help desk jobs paying $22.50 an hour", 23, "hourly"),
])
def test_salary(text, amount, period):
    f = parse_query(text).filters
    assert (f.salary_min, f.salary_period) == (amount, period)


@pytest.mark.parametrize("text,types", [
    ("contract python developer", ["contract"]),
    ("part-time help desk", ["part_time"]),
    ("software developer internship or co-op", ["internship", "co_op"]),
    ("full time java developer", ["full_time"]),
])
def test_job_types(text, types):
    assert parse_query(text).filters.job_types == types


@pytest.mark.parametrize("text,levels", [
    ("entry level data analyst", ["entry"]),
    ("new grad software developer", ["entry"]),
    ("senior java developer", ["senior"]),
    ("sr. python developer", ["senior"]),
    ("intermediate or mid-level developer", ["intermediate"]),
])
def test_experience_levels(text, levels):
    assert parse_query(text).filters.experience_levels == levels


def test_arrangements():
    assert parse_query("hybrid backend developer in Waterloo").filters.work_arrangements == ["hybrid"]
    assert parse_query("on-site QA analyst in Ottawa").filters.work_arrangements == ["onsite"]
    remote = parse_query("remote python jobs")
    assert remote.filters.work_arrangements == ["remote"]
    assert remote.suggested_name == "Python jobs — Remote"


def test_companies_and_exclusions():
    f = parse_query("senior full stack developer roles at Shopify").filters
    assert f.companies == ["Shopify"]
    assert f.roles == ["Full Stack Developer"]
    f = parse_query("data analyst jobs in Toronto excluding Birchline Financial and Maple Circuit Labs").filters
    assert f.exclude_companies == ["Birchline Financial", "Maple Circuit Labs"]
    assert f.locations == ["Toronto, ON"]
    # "at least" and places after "at" are not companies
    assert parse_query("developer jobs at least $50,000").filters.companies == []


@pytest.mark.parametrize("text,roles", [
    ("IT support jobs in Winnipeg", ["IT Support Specialist"]),
    ("front end developer", ["Front End Developer"]),
    ("python, django or react developer jobs", ["Python Developer", "Django Developer", "React Developer"]),
    ("devops jobs", ["DevOps Engineer"]),
    ("systems administrator", ["Systems Administrator"]),
    ("QA analyst", ["QA Analyst"]),
])
def test_roles(text, roles):
    assert parse_query(text).filters.roles == roles


def test_locations():
    f = parse_query("developer jobs in Ottawa, ON or Kenora").filters
    assert f.locations == ["Ottawa, ON", "Kenora, ON"]
    f = parse_query("remote jobs in Ontario").filters
    assert f.remote_regions == ["Ontario"] and f.work_arrangements == ["remote"]
    f = parse_query("Canada remote python developer").filters
    assert f.remote_regions == ["Canada"]


def test_unknown_place_is_kept_with_warning():
    parsed = parse_query("Java developer in Springfield")
    assert parsed.filters.locations == ["Springfield"]
    assert any("Springfield" in w for w in parsed.warnings)


def test_unrecognized_words_are_reported():
    parsed = parse_query("I want something fun with blockchain widgets")
    assert parsed.filters.roles == [] and parsed.filters.keywords == []
    assert any("blockchain" in w for w in parsed.warnings)
    assert any("No role or skill" in w for w in parsed.warnings)
    assert parsed.suggested_name == "Jobs"


def test_preferences_fill_missing_location():
    prefs = UserPreference(target_locations=["Thunder Bay, ON", "Remote Canada"])
    parsed = parse_query("python developer", prefs)
    assert parsed.filters.locations == ["Thunder Bay, ON"]
    assert parsed.filters.remote_regions == ["Canada"]
    assert any(c.label == "Location (from your preferences)" for c in parsed.interpretation)
    # An explicit location wins over preferences.
    assert parse_query("python developer in Toronto", prefs).filters.locations == ["Toronto, ON"]


def test_keywords_without_role_noun():
    f = parse_query("python django postgresql").filters
    assert f.roles == []
    assert f.keywords == ["Python", "Django", "PostgreSQL"]
