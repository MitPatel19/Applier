"""Cover letters: specific, cliché-free, and never claiming skills the user doesn't have."""

from __future__ import annotations

import pytest

from app.models import Company, Template
from app.services import cover_letter, llm
from app.services.profile_bundle import load_bundle
from app.services.resume_tailor import job_terms
from tests.prep_fixtures import make_job, seed_profile

CLICHES = ("i am writing to express", "passionate", "synergy", "fast-paced", "leverage", "dynamic")


@pytest.fixture
def seeded(user, db):
    seed_profile(db, user)
    job = make_job(db, user)
    company = Company(user_id=user.id, name="XYZ", normalized_name="xyz", products=["Northstar Scheduling"],
                      facts=[{"text": "Industry: Software", "kind": "verified", "source": "Company profile"}])
    db.add(company)
    db.commit()
    return load_bundle(db, user), job, company


def test_variants_are_specific_and_clean(seeded):
    bundle, job, company = seeded
    variants = cover_letter.generate_variants(bundle, job, company)
    assert set(variants) == {"professional", "short", "personalized"}
    job_skills = set(job_terms(job).skills)
    for text in variants.values():
        low = text.lower()
        assert not any(c in low for c in CLICHES)
        assert llm.unsupported_claims(text, cover_letter.profile_fact_skills(bundle), job_skills) == []
        assert "Kubernetes" not in text and "Terraform" not in text
        assert text.startswith("Dear Hiring Team at XYZ,") and "Mit Patel" in text
        assert "Junior Software Developer" in text
        assert "Northern Tech Solutions" in text  # grounded in real experience
    assert cover_letter.word_count(variants["short"]) <= cover_letter.SHORT_WORD_LIMIT
    assert "Northstar Scheduling" in variants["personalized"]
    assert "Industry: Software" not in variants["personalized"]
    assert "I can start immediately." in variants["professional"]


def test_template_placeholders_are_filled(seeded, db):
    bundle, job, company = seeded
    template = Template(user_id=bundle.user.id, kind="cover_letter", name="Mine",
                        body="Hello {{company}} team — {{first_name}} here about {{job_title}}. {{top_skills}}. "
                             "{{unknown}}Reach me at {{my_email}}.")
    draft = cover_letter.generate(bundle, job, company, template)
    text = draft.variants["professional"]
    assert draft.generated_by == "template"
    assert text.startswith("Hello XYZ team — Mit here about Junior Software Developer.")
    assert "{{" not in text and "mit@example.com" in text


def test_ai_letters_with_unsupported_claims_fall_back(seeded, monkeypatch):
    bundle, job, company = seeded
    fabricated = ("Dear Hiring Team at XYZ,\n\nI have 5 years of experience with Kubernetes and Terraform.\n\n"
                  "Sincerely,\nMit Patel")
    monkeypatch.setattr(llm, "available", lambda: True)
    monkeypatch.setattr(llm, "generate", lambda *a, **k: fabricated)
    draft = cover_letter.generate(bundle, job, company)
    assert draft.generated_by == "template"
    assert all("Kubernetes" not in t for t in draft.variants.values())


def test_ai_letter_is_used_when_it_passes_the_guard(seeded, monkeypatch):
    bundle, job, company = seeded
    honest = ("Dear Hiring Team at XYZ,\n\nAt Northern Tech Solutions I built REST APIs with Django and PostgreSQL "
              "for 3 internal tools.\n\nSincerely,\nMit Patel")
    monkeypatch.setattr(llm, "available", lambda: True)
    monkeypatch.setattr(llm, "generate", lambda *a, **k: honest)
    draft = cover_letter.generate(bundle, job, company)
    assert draft.generated_by == "ai" and draft.variants["short"] == honest


def test_cover_letter_api(auth_client, user, db):
    seed_profile(db, user)
    job = make_job(db, user)
    r = auth_client.post("/api/cover-letters/generate", json={"job_id": job.id, "variant": "short"})
    assert r.status_code == 201, r.text
    letter = r.json()
    assert letter["variant"] == "short" and letter["content"] == letter["variants"]["short"]
    assert letter["company_name"] == "XYZ" and letter["job_title"] == "Junior Software Developer"

    r = auth_client.patch(f"/api/cover-letters/{letter['id']}", json={"variant": "professional"})
    assert r.json()["content"] == letter["variants"]["professional"]
    r = auth_client.patch(f"/api/cover-letters/{letter['id']}", json={"content": "My own words."})
    assert r.json()["content"] == "My own words." and r.json()["generated_by"] == "user"

    r = auth_client.get(f"/api/cover-letters?job_id={job.id}")
    assert [c["id"] for c in r.json()] == [letter["id"]]
    r = auth_client.get(f"/api/cover-letters/{letter['id']}/render?format=pdf")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert "XYZ_Cover_Letter.pdf" in r.headers["content-disposition"]
    assert auth_client.delete(f"/api/cover-letters/{letter['id']}").status_code == 204
    assert auth_client.get(f"/api/cover-letters/{letter['id']}").status_code == 404
