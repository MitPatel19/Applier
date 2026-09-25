"""Default submitter: hand off to the employer's site with everything prepared.

The application status is not changed here. It becomes "applied" only after the user
confirms they finished submitting on the employer's site.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Application
from app.services.submission.base import SubmissionOutcome, Submitter, manual_steps


class ExternalLinkSubmitter(Submitter):
    method = "external_link"

    def submit(self, db: Session, app: Application) -> SubmissionOutcome:
        where = f"{app.company_name}'s application page" if app.apply_url or app.url else \
            f"{app.company_name}'s careers site"
        message = (f"Everything is prepared. Finish on {where}: upload your approved documents, paste your answers "
                   "and submit there. Come back and confirm once it's sent — we won't mark it as applied until you do.")
        return SubmissionOutcome(state="pending_user", message=message, method=self.method, steps=manual_steps(app))
