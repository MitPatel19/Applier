from __future__ import annotations

import pytest

from app.services.jd_extract import (
    education_level_of,
    extract_requirements,
    extract_years,
    infer_experience_level,
    infer_fields,
    parse_salary,
    split_sections,
)
from tests.jobs_helpers import JUNIOR_PYTHON_JD


def test_sections_are_split_by_common_headers():
    sections = split_sections(JUNIOR_PYTHON_JD)
    assert sections.has("requirements") and sections.has("preferred") and sections.has("responsibilities")
    assert any("Docker" in line for line in sections.lines("preferred"))


def test_inline_header_content_is_kept():
    sections = split_sections("Requirements: Python and SQL\nNice to have: Docker")
    assert sections.lines("requirements") == ["Python and SQL"]
    assert sections.lines("preferred") == ["Docker"]


def test_required_vs_preferred_skills():
    req = extract_requirements(JUNIOR_PYTHON_JD, "Junior Python Developer")
    assert {"Python", "SQL", "PostgreSQL", "Git", "REST APIs"} <= set(req["required_skills"])
    assert {"Docker", "AWS"} <= set(req["preferred_skills"])
    assert not set(req["required_skills"]) & set(req["preferred_skills"])
    # Skills only named in responsibilities count as preferred, not required.
    assert "pytest" in req["preferred_skills"]


def test_asset_hint_inside_requirements_is_preferred():
    jd = "Requirements\n- Python\n- Kubernetes is an asset\n- Experience with Linux"
    req = extract_requirements(jd)
    assert "Kubernetes" in req["preferred_skills"]
    assert {"Python", "Linux"} <= set(req["required_skills"])


def test_no_sections_falls_back_to_whole_text():
    req = extract_requirements("We need someone who knows Java and Spring Boot to build services.")
    assert {"Java", "Spring Boot"} <= set(req["required_skills"])


@pytest.mark.parametrize("text,expected", [
    ("3+ years of experience with Python", (3.0, None)),
    ("2-4 years of professional experience", (2.0, 4.0)),
    ("2 to 4 years of experience", (2.0, 4.0)),
    ("A minimum of 2 years experience in IT support", (2.0, None)),
    ("At least one year of experience", (1.0, None)),
    ("5 or more years of experience", (5.0, None)),
    ("Two years of relevant experience", (2.0, None)),
    ("We have been in business for 25 years.", (None, None)),
])
def test_years_of_experience(text, expected):
    assert extract_years(text) == expected


def test_education_level_is_the_lowest_acceptable():
    req = extract_requirements("Requirements\n- Bachelor's degree in Computer Science or college diploma")
    assert req["education_level"] == "diploma"
    assert req["education"] == ["Bachelor's degree in Computer Science or college diploma"]
    assert extract_requirements("Requirements\n- Master's degree required")["education_level"] == "master"
    assert education_level_of("Bachelor of Science") == "bachelor"
    assert education_level_of("B.Sc. Computer Science") == "bachelor"
    assert education_level_of("Diploma, Computer Programming") == "diploma"
    assert education_level_of("High school") is None


def test_certifications_work_authorization_benefits_questions():
    jd = JUNIOR_PYTHON_JD.replace("- Legally eligible", "- CompTIA A+ certification (required)\n- Legally eligible")
    req = extract_requirements(jd)
    assert req["certifications"] == ["CompTIA A+"]
    assert req["work_authorization"] == "Legally eligible to work in Canada"
    assert req["benefits"] == ["Health and dental benefits", "RRSP matching"]
    assert req["questions"] == ["Are you legally eligible to work in Canada?"]
    assert req["min_years_experience"] == 1.0 and req["max_years_experience"] == 2.0
    assert req["responsibilities"][0] == "Build REST APIs with Python and Django REST Framework"
    assert "Communication" not in req["required_skills"]


def test_preferred_certification_is_not_required():
    req = extract_requirements("Requirements\n- Windows support\nNice to have\n- CompTIA A+")
    assert req["certifications"] == []
    assert "CompTIA A+" in req["preferred_skills"]


@pytest.mark.parametrize("text,expected", [
    ("Salary: $55,000 - $70,000 per year", (55000, 70000, "yearly", None)),
    ("$65k", (65000, None, "yearly", None)),
    ("$25/hour", (25, None, "hourly", None)),
    ("We pay $28.50 an hour", (29, None, "hourly", None)),
    ("CAD $80,000 per year", (80000, None, "yearly", "CAD")),
    ("USD $120,000 - $140,000", (120000, 140000, "yearly", "USD")),
    ("$55,000 – 70,000 annually", (55000, 70000, "yearly", None)),
])
def test_parse_salary(text, expected):
    s = parse_salary(text)
    assert (s["salary_min"], s["salary_max"], s["salary_period"], s["currency"]) == expected


@pytest.mark.parametrize("text", ["A $500 signing bonus", "Earn $1,500/week", "Annual learning budget of $1,500"])
def test_parse_salary_ignores_non_salary_amounts(text):
    assert parse_salary(text) is None


def test_infer_fields():
    fields = infer_fields("Junior Python Developer", JUNIOR_PYTHON_JD + "\nThis is a hybrid, full-time role. "
                          "Salary: $60,000 - $70,000 per year.", "Thunder Bay, ON")
    assert fields == {"work_arrangement": "hybrid", "employment_type": "full_time", "experience_level": "junior",
                      "salary_min": 60000, "salary_max": 70000, "salary_period": "yearly"}
    assert infer_fields("Python Developer", "This is a fully remote position.", "Canada")["work_arrangement"] == \
        "remote"
    assert infer_fields("Software Developer", "", "Remote - Canada")["work_arrangement"] == "remote"
    assert infer_fields("Java Developer (Contract)", "")["employment_type"] == "contract"
    assert infer_fields("Developer", "This is a 12-month contract position.")["employment_type"] == "contract"
    assert infer_fields("Software Developer Co-op", "")["employment_type"] == "co_op"


@pytest.mark.parametrize("title,years,level", [
    ("Sr. Java Developer", None, "senior"),
    ("Lead Engineer", None, "lead"),
    ("Junior Developer", None, "junior"),
    ("Entry-Level Analyst", None, "entry"),
    ("Software Developer II", None, "intermediate"),
    ("Software Developer", 0.5, "entry"),
    ("Software Developer", 3, "intermediate"),
    ("Software Developer", 6, "senior"),
    ("Software Developer", None, None),
])
def test_experience_level(title, years, level):
    assert infer_experience_level(title, years) == level
