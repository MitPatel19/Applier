from __future__ import annotations

from datetime import date, timedelta

from app.models import utcnow
from app.services.quality import USER_HIDDEN_PREFIX, USER_UNHIDDEN_FLAG, apply_quality, evaluate
from tests.jobs_helpers import JUNIOR_PYTHON_JD, make_job, make_profile, make_user


def codes(result_or_job) -> set[str]:
    return {f["code"] for f in result_or_job.flags}


def test_good_job_is_visible_without_flags(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    job = make_job(db, user)
    result = apply_quality(job, bundle)
    assert result.hidden_reasons == [] and not job.is_hidden
    assert codes(job) == set()


def test_hidden_outside_target_locations(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    job = make_job(db, user, location="Toronto, ON", city="Toronto")
    apply_quality(job, bundle)
    assert job.is_hidden
    assert job.hidden_reasons == ["Toronto, ON is outside your target locations (Thunder Bay, ON, remote in Canada)"]
    remote = make_job(db, user, title="Python Developer", location="Remote — Canada", city=None, province=None,
                      work_arrangement="remote")
    apply_quality(remote, bundle)
    assert not remote.is_hidden


def test_hidden_for_us_work_authorization(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    jd = JUNIOR_PYTHON_JD.replace("Legally eligible to work in Canada",
                                  "Must be legally authorized to work in the United States")
    job = make_job(db, user, description=jd, location="Remote (US)",
                   city=None, province=None, country="United States", work_arrangement="remote")
    apply_quality(job, bundle)
    assert job.is_hidden
    assert "Requires authorization to work in the United States" in job.hidden_reasons


def test_missing_certification_hides_only_when_enabled(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    jd = JUNIOR_PYTHON_JD.replace("- Legally", "- CompTIA A+ certification (required)\n- Legally")
    job = make_job(db, user, description=jd)
    assert evaluate(job, bundle).hidden_reasons == []  # off by default
    bundle.preferences.quality_filters = {"hide": {"missing_certifications": True}}
    assert evaluate(job, bundle).hidden_reasons == [
        "Requires CompTIA A+ certification, which isn't in your profile"]
    bundle.preferences.required_certifications_available = ["comptia a+"]
    assert evaluate(job, bundle).hidden_reasons == []


def test_salary_level_and_avoided_company_rules(db):
    user = make_user(db)
    bundle = make_profile(db, user, avoid_companies=["Borealis Software Inc."])
    bundle.preferences.quality_filters = {"hide": {"below_min_salary": True, "outside_experience_level": True}}
    job = make_job(db, user, title="Senior Python Developer", experience_level="senior", salary_min=20,
                   salary_max=24, salary_period="hourly")
    reasons = evaluate(job, bundle).hidden_reasons
    assert "Pays up to about $49,920/year, below your minimum of $55,000" in reasons
    assert "Senior role — you're looking for entry level, junior, intermediate roles" in reasons
    assert "You asked to avoid Borealis Software" in reasons


def test_flags(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    job = make_job(db, user, salary_min=None, salary_max=None, employment_type=None,
                   deadline=date.today() + timedelta(days=2), posted_at=utcnow() - timedelta(days=60))
    apply_quality(job, bundle)
    flags = {f["code"]: f for f in job.flags}
    assert {"unclear_salary", "unclear_employment_type", "deadline_approaching", "old_posting"} <= set(flags)
    assert flags["deadline_approaching"]["label"] == "Closes in 2 days"
    assert flags["deadline_approaching"]["severity"] == "warning"
    assert flags["old_posting"]["label"].startswith("Posted 60 days ago")
    bundle.preferences.quality_filters = {"flag": {"unclear_salary": False}}
    apply_quality(job, bundle)
    assert "unclear_salary" not in codes(job)


def test_suspicious_posting_flag(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    jd = ("Work from home and earn $1,500/week! No experience needed. Successful applicants must purchase a $99 "
          "starter kit. Email quick.jobs@gmail.com. Payment by gift card.")
    job = make_job(db, user, title="Data Entry Assistant", company="QuickHire Global Staffing", description=jd)
    apply_quality(job, bundle)
    flag = next(f for f in job.flags if f["code"] == "suspicious_posting")
    assert flag["severity"] == "warning"
    assert "gift cards" in flag["label"] and "free personal email" in flag["label"]


def test_saved_jobs_are_never_hidden_and_user_choices_stick(db):
    user = make_user(db)
    bundle = make_profile(db, user)
    job = make_job(db, user, location="Toronto, ON", city="Toronto", is_saved=True)
    apply_quality(job, bundle)
    assert not job.is_hidden

    unhidden = make_job(db, user, title="Java Developer", location="Toronto, ON", city="Toronto",
                        flags=[USER_UNHIDDEN_FLAG])
    apply_quality(unhidden, bundle)
    assert not unhidden.is_hidden and codes(unhidden) >= {"user_unhidden"}

    user_hidden = make_job(db, user, title="QA Analyst", is_hidden=True,
                           hidden_reasons=[f"{USER_HIDDEN_PREFIX}: not for me"])
    apply_quality(user_hidden, bundle)
    assert user_hidden.is_hidden and user_hidden.hidden_reasons == [f"{USER_HIDDEN_PREFIX}: not for me"]
