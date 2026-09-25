"""Optional browser assist for employer ATS forms (DISABLED by default).

Enabled only when ALL of these hold:

* the environment variable ``APPLIER_BROWSER_AUTOMATION=true`` is set,
* the posting's source reports ``apply_method == "ats_form"``,
* Playwright is installed (it is intentionally not a dependency).

What it does: opens the employer's form in a visible browser window, fills fields from the
approved profile and answers, and attaches the approved documents. It ALWAYS stops before
the final submit button and returns ``paused`` so the user reviews and submits the form
themselves. If a CAPTCHA, sign-in/MFA step or an unfamiliar flow is detected, it pauses and
asks the user to complete it. It never clicks the final submit button.
"""

from __future__ import annotations

import importlib.util
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.core.storage import get_storage, safe_filename
from app.models import Application, JobSource, User
from app.services.answers import similarity
from app.services.profile_bundle import load_bundle
from app.services.submission.base import SubmissionOutcome, SubmissionStep, Submitter, manual_steps

log = logging.getLogger("applier.submission.browser")

ENV_FLAG = "APPLIER_BROWSER_AUTOMATION"
_ANSWER_MATCH = 0.62
_BLOCKER_SELECTORS = {
    "captcha": "iframe[src*='captcha'], iframe[src*='recaptcha'], iframe[src*='hcaptcha'], "
               "iframe[src*='turnstile'], .g-recaptcha, .h-captcha",
    "sign_in": "input[type='password']",
    "mfa": "input[autocomplete='one-time-code']",
}
_BLOCKER_MESSAGES = {
    "captcha": "The employer's form shows a verification check (CAPTCHA). Please complete it yourself in the "
               "opened browser window.",
    "sign_in": "The employer's site asks you to sign in. Please sign in yourself in the opened browser window, "
               "then review the form.",
    "mfa": "The employer's site asks for a verification code. Please enter it yourself in the opened browser window.",
}


@dataclass
class _Session:
    playwright: Any
    browser: Any
    page: Any
    workdir: Path


_OPEN_SESSIONS: dict[int, _Session] = {}


def browser_automation_enabled() -> bool:
    return os.environ.get(ENV_FLAG, "").strip().lower() == "true"


def playwright_available() -> bool:
    return importlib.util.find_spec("playwright") is not None


def close_session(application_id: int) -> None:
    """Close the browser window opened for an application and delete its temporary files."""
    session = _OPEN_SESSIONS.pop(application_id, None)
    if session is None:
        return
    try:
        session.browser.close()
        session.playwright.stop()
    finally:
        shutil.rmtree(session.workdir, ignore_errors=True)


def _profile_values(db: Session, app: Application) -> dict[str, str]:
    bundle = load_bundle(db, db.get(User, app.user_id))
    p = bundle.profile
    names = bundle.user.full_name.split()
    values = {
        "first name": names[0] if names else "", "last name": names[-1] if len(names) > 1 else "",
        "full name": bundle.user.full_name, "email": bundle.user.email, "phone": p.phone or "",
        "linkedin": p.linkedin_url or "", "github": p.github_url or "",
        "portfolio": p.portfolio_url or p.website_url or "", "website": p.website_url or p.portfolio_url or "",
        "city": p.city or "", "location": ", ".join(x for x in (p.city, p.province) if x),
    }
    return {k: v for k, v in values.items() if v}


def _materialize_documents(app: Application, workdir: Path) -> dict[str, Path]:
    """Write the exact approved documents to a private temp folder for upload."""
    files: dict[str, Path] = {}
    storage = get_storage()
    for doc in app.documents:
        if doc.file_key and doc.kind in ("resume", "cover_letter"):
            path = workdir / safe_filename(doc.file_name)
            path.write_bytes(storage.get(doc.file_key))
            path.chmod(0o600)
            files[doc.kind] = path
    return files


def _detect_blocker(page: Any) -> str | None:
    for key, selector in _BLOCKER_SELECTORS.items():
        if page.locator(selector).count() > 0:
            return key
    body = (page.inner_text("body") or "").lower()
    return "captcha" if "verify you are human" in body else None


def _field_label(element: Any) -> str:
    return element.evaluate(
        """el => {
            const byFor = el.labels && el.labels.length ? el.labels[0].innerText : "";
            return [byFor, el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.name, el.id]
                .filter(Boolean).join(" ");
        }"""
    ) or ""


def _fill_fields(page: Any, values: dict[str, str], answers: list[tuple[str, str]]) -> int:
    filled = 0
    for element in page.locator("input:visible, textarea:visible, select:visible").all():
        kind = (element.get_attribute("type") or "text").lower()
        if kind in ("file", "hidden", "submit", "button", "checkbox", "radio", "password"):
            continue
        label = _field_label(element).lower().replace("_", " ")
        value = next((v for k, v in values.items() if k in label), None)
        if value is None:
            match = max(answers, key=lambda qa: similarity(label, qa[0]), default=None)
            value = match[1] if match and similarity(label, match[0]) >= _ANSWER_MATCH else None
        if not value:
            continue
        tag = element.evaluate("el => el.tagName").lower()
        if tag == "select":
            element.select_option(label=value)
        else:
            element.fill(value)
        filled += 1
    return filled


def _attach_documents(page: Any, files: dict[str, Path]) -> list[str]:
    attached: list[str] = []
    for element in page.locator("input[type='file']").all():
        label = _field_label(element).lower()
        kind = "cover_letter" if "cover" in label else "resume"
        if kind in files and kind not in attached:
            element.set_input_files(str(files[kind]))
            attached.append(kind)
    return attached


class BrowserAssistSubmitter(Submitter):
    method = "automation"

    @staticmethod
    def supports(app: Application, source: JobSource | None) -> bool:
        return (browser_automation_enabled() and source is not None and source.apply_method == "ats_form"
                and bool(app.apply_url) and playwright_available())

    def submit(self, db: Session, app: Application) -> SubmissionOutcome:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright

        close_session(app.id)
        workdir = Path(tempfile.mkdtemp(prefix=f"applier-{app.id}-"))
        playwright = sync_playwright().start()
        try:
            browser = playwright.chromium.launch(headless=False)
            page = browser.new_page()
            page.goto(app.apply_url, wait_until="domcontentloaded")
            _OPEN_SESSIONS[app.id] = _Session(playwright, browser, page, workdir)
            blocker = _detect_blocker(page)
            if blocker:
                return self._paused(app, _BLOCKER_MESSAGES[blocker])
            answers = [(a.question, a.answer) for a in app.answers if a.answer.strip()]
            filled = _fill_fields(page, _profile_values(db, app), answers)
            attached = _attach_documents(page, _materialize_documents(app, workdir))
        except PlaywrightError:
            log.warning("Browser assist could not complete the form for application %s", app.id, exc_info=True)
            close_session(app.id)
            shutil.rmtree(workdir, ignore_errors=True)
            return SubmissionOutcome(state="pending_user", method="external_link", steps=manual_steps(app),
                                     message="We couldn't fill this form automatically. Please finish on the "
                                             "employer's site with your prepared documents and answers.")
        return self._paused(
            app,
            f"We filled {filled} field{'s' if filled != 1 else ''} and attached {len(attached)} approved "
            "document(s). Review everything in the opened browser window. We stopped before the final submit "
            "button — submit it yourself if it all looks right, then confirm here.",
        )

    def _paused(self, app: Application, message: str) -> SubmissionOutcome:
        steps = [
            SubmissionStep("Open the employer's application form", done=True),
            SubmissionStep("Fill in details from your approved profile and answers", done=True),
            SubmissionStep("Review every field in the opened browser window", requires_user=True),
            SubmissionStep("Complete any verification or CAPTCHA yourself if prompted", requires_user=True),
            SubmissionStep("Press the employer's submit button yourself", requires_user=True),
        ]
        return SubmissionOutcome(state="paused", message=message, method=self.method, steps=steps)
