from __future__ import annotations

import pytest

from app.models import Job
from app.services.dedup import (
    clean_title,
    dedup_key,
    description_similarity,
    find_duplicate,
    normalize_company,
    normalize_location_key,
    normalize_title,
    title_alignment,
)
from app.services.jobs_ingest import ingest_postings
from app.services.sources.base import RawPosting
from app.services.sources.demo import all_postings
from tests.jobs_helpers import JUNIOR_PYTHON_JD, make_job, make_user


@pytest.mark.parametrize("raw,expected", [
    ("Sr. Python Developer (m/f/d)", "senior python developer"),
    ("Senior Python Developer - Thunder Bay", "senior python developer"),
    ("Jr. Software Dev", "junior software developer"),
    ("IT Support Technician - Req #45821", "it support technician"),
    ("Full Stack Developer | R12345", "full stack developer"),
    ("Full-Stack Developer (Remote, Canada)", "full stack developer"),
    ("QA Analyst", "quality assurance analyst"),
])
def test_normalize_title(raw, expected):
    assert normalize_title(raw) == expected


def test_clean_title_keeps_case_but_drops_noise():
    assert clean_title("Sr. Python Developer (m/f/d) - Req ID: 4521") == "Sr. Python Developer"


@pytest.mark.parametrize("raw,expected", [
    ("Borealis Software Inc.", "borealis software"),
    ("The Borealis Software", "borealis software"),
    ("Kaministiquia Data Co.", "kaministiquia data"),
    ("Maple Circuit Labs Ltd", "maple circuit labs"),
    ("Kestrel & Birch Software Inc.", "kestrel and birch software"),
])
def test_normalize_company(raw, expected):
    assert normalize_company(raw) == expected


def test_location_key_is_format_independent():
    assert normalize_location_key("Thunder Bay, ON") == normalize_location_key("Thunder Bay, Ontario, Canada")
    assert normalize_location_key("Remote - Canada") == normalize_location_key("Canada (Remote)")
    assert normalize_location_key("Toronto, ON") != normalize_location_key("Ottawa, ON")


def test_dedup_key_matches_variants():
    assert dedup_key("Borealis Software Inc.", "Sr. Python Developer", "Thunder Bay, Ontario") == \
        dedup_key("Borealis Software", "Senior Python Developer", "Thunder Bay, ON")
    assert dedup_key("Borealis Software", "Python Developer", "Toronto, ON") != \
        dedup_key("Borealis Software", "Python Developer", "Thunder Bay, ON")


def test_similarity_helpers():
    assert description_similarity(JUNIOR_PYTHON_JD, JUNIOR_PYTHON_JD + "\nApply on Indeed.") > 0.9
    assert description_similarity(JUNIOR_PYTHON_JD, "Completely different text about accounting roles.") < 0.1
    assert title_alignment("Backend Developer (Python)", "Python Developer") == 1.0
    assert title_alignment("Data Analyst", "Python Developer") == 0.0


def _posting(**kw) -> RawPosting:
    base = dict(source="indeed", source_label="Indeed", external_id="in-1", title="Junior Python Developer",
                company_name="Borealis Software Inc.", description=JUNIOR_PYTHON_JD, location="Thunder Bay, Ontario")
    base.update(kw)
    return RawPosting(**base)


def test_find_duplicate_by_exact_key(db):
    user = make_user(db)
    job = make_job(db, user)
    assert find_duplicate(db, user.id, _posting()) is job


def test_find_duplicate_by_url(db):
    user = make_user(db)
    result = ingest_postings(db, user, [_posting(url="https://jobs.example.com/borealis/1")])
    other = _posting(source="linkedin", external_id="li-9", title="Python Dev I", location="Ontario",
                     url="https://jobs.example.com/borealis/1")
    assert find_duplicate(db, user.id, other).id == result.job_ids[0]


def test_fuzzy_duplicate_with_less_specific_location(db):
    user = make_user(db)
    ingest_postings(db, user, [_posting()])
    # Same company and title, location only given as the province: exact key differs, fuzzy match merges.
    dup = _posting(source="linkedin", external_id="li-2", location="Ontario",
                   description=JUNIOR_PYTHON_JD + "\nApply through LinkedIn.")
    assert find_duplicate(db, user.id, dup) is not None


def test_different_level_or_city_is_not_a_duplicate(db):
    user = make_user(db)
    ingest_postings(db, user, [_posting()])
    assert find_duplicate(db, user.id, _posting(source="linkedin", external_id="li-3",
                                                title="Senior Python Developer")) is None
    assert find_duplicate(db, user.id, _posting(source="linkedin", external_id="li-4",
                                                location="Winnipeg, MB")) is None


def test_ingest_merges_sources_and_fills_missing_salary(db):
    user = make_user(db)
    first = _posting(source="linkedin", external_id="li-1", title="Junior Python Developer",
                     company_name="Borealis Software", location="Thunder Bay, ON",
                     description=JUNIOR_PYTHON_JD)
    second = _posting(salary_min=60000, salary_max=70000, salary_period="yearly", currency="CAD",
                      title="Jr. Python Developer - Thunder Bay")
    result = ingest_postings(db, user, [first, second])
    assert (result.found, result.new, result.merged_duplicates, result.unique) == (2, 1, 1, 1)
    job = db.get(Job, result.job_ids[0])
    assert {s.source for s in job.sources} == {"linkedin", "indeed"}
    assert (job.salary_min, job.salary_max) == (60000, 70000)
    again = ingest_postings(db, user, [first])
    assert (again.updated, again.new) == (1, 0)


def test_demo_catalogue_dedupes_to_82_unique_jobs(db):
    user = make_user(db)
    postings = all_postings()
    result = ingest_postings(db, user, postings)
    assert result.found == 126
    assert result.unique == 82
    assert result.merged_duplicates == 44
    assert db.query(Job).filter_by(user_id=user.id).count() == 82
