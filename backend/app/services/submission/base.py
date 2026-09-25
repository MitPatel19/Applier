"""Submitter interface.

A submitter takes an application the user has explicitly approved and helps get it to the
employer. Submitters must NEVER press a final "submit" button on the user's behalf and must
never bypass CAPTCHA, MFA or other verification. Callers are responsible for checking the
approval before calling ``submit``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy.orm import Session

from app.models import Application

SubmissionState = Literal["pending_user", "submitted", "failed", "paused"]


@dataclass
class SubmissionStep:
    label: str
    done: bool = False
    requires_user: bool = False


@dataclass
class SubmissionOutcome:
    state: SubmissionState
    message: str
    method: str  # external_link | automation | manual
    steps: list[SubmissionStep] = field(default_factory=list)


class Submitter(ABC):
    method: str

    @abstractmethod
    def submit(self, db: Session, app: Application) -> SubmissionOutcome:
        """Hand the approved application off. Must not change ``app.status``."""


def manual_steps(app: Application) -> list[SubmissionStep]:
    """What the user still has to do on the employer's site."""
    steps = [
        SubmissionStep("Open the employer's application page", done=True),
        SubmissionStep("Upload your approved resume", requires_user=True),
    ]
    if any(doc.kind == "cover_letter" for doc in app.documents):
        steps.append(SubmissionStep("Upload your cover letter", requires_user=True))
    steps += [
        SubmissionStep("Paste your prepared answers", requires_user=True),
        SubmissionStep("Complete any verification or CAPTCHA yourself if prompted", requires_user=True),
        SubmissionStep("Submit on the employer's site", requires_user=True),
    ]
    return steps
