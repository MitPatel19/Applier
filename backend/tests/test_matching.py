from __future__ import annotations

from app.models import JobMatch
from app.services.matching import (
    BLOCKER_CAP,
    CATEGORY_LABELS,
    DEFAULT_WEIGHTS,
    load_signals,
    recompute_all,
    score_job,
    tier_for,
    upsert_match,
    weights_for,
)
from tests.jobs_helpers import JUNIOR_PYTHON_JD, make_job, make_profile, make_user


def category(result: dict, key: str) -> dict:
    return next(c for c in result["breakdown"] if c["key"] == key)


def test_strong_match_is_fully_explained(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    result = score_job(make_job(db, user), bundle)

    assert result["tier"] == "strong" and result["should_apply"] == "apply"
    assert result["overall"] >= 85
    assert [c["key"] for c in result["breakdown"]] == list(DEFAULT_WEIGHTS)
    for cat in result["breakdown"]:
        assert cat["label"] == CATEGORY_LABELS[cat["key"]]
        assert 0 <= cat["score"] <= 100 and cat["summary"]
    skills = category(result, "skills")
    assert "You have 4 of 5 required skills (80%): Python, SQL, PostgreSQL and Git" in skills["reasons"]
    assert any("REST APIs counted as partial credit (60%)" in r and "Django REST Framework" in r
               for r in skills["reasons"])
    assert category(result, "experience")["reasons"][0] == "Posting asks for 1–2 years; you have about 2.5"
    assert category(result, "location")["reasons"] == ["In Thunder Bay, ON — one of your target locations"]
    assert category(result, "salary")["reasons"] == ["Pays $60,000–$70,000; your minimum is $55,000/year"]
    assert result["recommendation"].startswith(
        "Recommended because it's a strong match for your Python, SQL, PostgreSQL and Git experience")
    assert result["missing_required"] == []
    assert "AWS" in result["missing_preferred"]
    assert result["concerns"] == []


def test_missing_information_is_not_applicable_and_excluded(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    job = make_job(db, user, salary_min=None, salary_max=None, employment_type=None)
    result = score_job(job, bundle)
    salary = category(result, "salary")
    assert salary["applicable"] is False and salary["summary"] == "Salary not listed in the posting"
    assert category(result, "employment_type")["applicable"] is False
    # Excluding a category must not drag the score down.
    assert result["overall"] >= score_job(make_job(db, user, title="Python Developer I"), bundle)["overall"] - 5


def test_experience_gap_and_level_concern(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    jd = JUNIOR_PYTHON_JD.replace("1-2 years", "5+ years")
    job = make_job(db, user, title="Senior Python Developer", description=jd, experience_level="senior")
    result = score_job(job, bundle)
    exp = category(result, "experience")
    assert exp["reasons"][0] == "Posting asks for 5+ years; you have about 2.5"
    assert exp["summary"] == "About 2.5 years short of the requirement"
    assert any(c.startswith("Experience gap") for c in result["concerns"])
    assert result["should_apply"] != "apply"


def test_blockers_cap_score_and_skip(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    jd = JUNIOR_PYTHON_JD.replace("Legally eligible to work in Canada",
                                  "Must be legally authorized to work in the United States")
    job = make_job(db, user, description=jd)
    result = score_job(job, bundle)
    assert result["overall"] == BLOCKER_CAP
    assert result["should_apply"] == "skip"
    assert result["recommendation"].startswith("Probably not a fit: requires authorization to work in the United")
    assert "Work authorization (United States)" in result["missing_required"]


def test_location_and_salary_mismatch(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    job = make_job(db, user, location="Toronto, ON", city="Toronto", salary_min=40000, salary_max=45000)
    result = score_job(job, bundle)
    assert category(result, "location")["score"] == 15
    salary = category(result, "salary")
    assert salary["score"] < 50 and salary["summary"] == "About 18% below your minimum"
    assert any("outside your target locations" in c for c in result["concerns"])


def test_career_signals(db):
    user = make_user(db)
    bundle = make_profile(db, user, preferred_companies=["Borealis Software Inc."])
    make_job(db, user, title="Junior Java Developer", company="Other Co", user_feedback="not_interested")
    make_job(db, user, title="Python Developer", company="Third Co", is_saved=True)
    job = make_job(db, user, title="Python Developer II")
    signals = load_signals(db, user.id)
    career = category(score_job(job, bundle, signals), "career")
    assert "Title aligns with your target role \"Python Developer\"" in career["reasons"]
    assert "Borealis Software is on your preferred companies list" in career["reasons"]
    assert "Similar to 1 job you saved or applied to" in career["reasons"]
    java = make_job(db, user, title="Junior Java Developer", company="Fourth Co")
    java_career = category(score_job(java, bundle, signals), "career")
    assert "You marked a similar role (\"Junior Java Developer\") as not interested" in java_career["reasons"]


def test_weights_and_tiers(db):
    user = make_user(db)
    bundle = make_profile(db, user, scoring_weights={"skills": 50, "salary": 0, "bogus": 10})
    weights = weights_for(bundle.preferences)
    assert weights["skills"] == 50 and weights["salary"] == 0 and "bogus" not in weights
    result = score_job(make_job(db, user), bundle)
    assert category(result, "skills")["weight"] == 50
    assert result["weights"] == weights
    assert tier_for(80) == "strong" and tier_for(79) == "good" and tier_for(65) == "good"
    assert tier_for(64) == "possible" and tier_for(50) == "possible" and tier_for(49) == "weak"
    assert tier_for(70, strong_threshold=70) == "strong" and tier_for(69, strong_threshold=70) == "good"


def test_upsert_and_recompute(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    job = make_job(db, user)
    match = upsert_match(db, job, bundle)
    db.flush()
    assert match.id and match.profile_hash == bundle.fingerprint()
    make_job(db, user, title="Java Developer")
    assert recompute_all(db, user) == 2
    assert db.query(JobMatch).filter_by(user_id=user.id).count() == 2


def test_empty_profile_scores_without_crashing(db):
    user = make_user(db)
    from app.services.profile_bundle import load_bundle

    job = make_job(db, user)
    result = score_job(job, load_bundle(db, user))
    assert result["tier"] == "weak"
    assert category(result, "education")["summary"] == "Add your education to compare"
    assert category(result, "location")["applicable"] is False
