# Applier API Contract

All endpoints are served under `/api` (FastAPI, `backend/app/api/routers/*.py`). The Next.js
frontend calls them same-origin through a rewrite (`frontend/next.config.ts`).

Schemas referenced below live in `backend/app/schemas/*.py` and are mirrored 1:1 in
`frontend/src/lib/types.ts`. **If you change a schema, update both.**

## Conventions

- **Auth**: httpOnly cookie `applier_session` (browsers) or `Authorization: Bearer <token>` (API clients/tests).
- **CSRF**: cookie-authenticated `POST/PUT/PATCH/DELETE` must send `X-Requested-With: applier` (the frontend `api` client does this).
- **Errors**: always `{"error": {"code", "message", "retryable", "details"}}`. `message` is user-safe.
  Validation errors: status 422, `details = [{"field", "message"}]`.
- **Ownership**: every resource is scoped to the current user; other users' ids return 404 (`get_owned` in `api/deps.py`).
- **Audit**: every meaningful user/agent action calls `services.audit.record(...)` with a human sentence.
- **Datetimes**: naive UTC ISO strings (`2026-09-24T20:45:00`). Dates: `YYYY-MM-DD`.
- Creating returns `201` with the created object; deleting returns `204`.
- List endpoints return plain arrays unless a wrapper schema is named.

## Auth — `routers/auth.py`
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `RegisterIn` | `SessionOut` (201, sets cookie) |
| POST | `/auth/login` | `LoginIn` | `SessionOut` (sets cookie). Rate-limited: 5 failures / 15 min per email+IP → 429 |
| POST | `/auth/logout` | – | 204, clears cookie |
| POST | `/auth/logout-all` | – | 204, increments `token_version` (revokes all sessions) |
| GET | `/auth/me` | – | `UserOut` |
| POST | `/auth/change-password` | `ChangePasswordIn` | 204 (revokes other sessions, re-issues cookie) |

## Users & privacy — `routers/users.py`
| PATCH | `/users/me` | `UserUpdate` | `UserOut` |
| GET | `/users/me/export` | – | JSON attachment of all personal data (`Content-Disposition: attachment`) |
| DELETE | `/users/me` | `DeleteAccountIn` (`password`, `confirm="DELETE"`) | 204 — deletes all rows + stored files |
| GET | `/users/me/privacy` | – | `{stored_data: [{category, count, description}], integrations: [...], retention: str, encryption: str}` |

## Profile — `routers/profile.py`
| GET | `/profile` | – | `FullProfileOut` |
| PATCH | `/profile` | `ProfileIn` | `ProfileOut` |
| POST/PATCH/DELETE | `/profile/educations[/{id}]` | `EducationIn` | `EducationOut` |
| POST/PATCH/DELETE | `/profile/experiences[/{id}]` | `ExperienceIn` | `ExperienceOut` |
| POST/PATCH/DELETE | `/profile/skills[/{id}]` | `SkillIn` | `SkillOut` (category auto-detected via taxonomy) |
| POST | `/profile/skills/bulk` | `SkillBulkIn` | `list[SkillOut]` (adds, skipping duplicates) |
| POST/PATCH/DELETE | `/profile/projects[/{id}]` | `ProjectIn` | `ProjectOut` |
| GET | `/profile/preferences` | – | `PreferencesOut` (defaults filled in) |
| PATCH | `/profile/preferences` | `PreferencesIn` | `PreferencesOut` (changing search prefs triggers match recompute) |
| POST | `/profile/import` | `ProfileImportIn` | `FullProfileOut` — applies a reviewed `ParsedResume` to the profile |

## Resumes — `routers/resumes.py`
| GET | `/resumes` | – | `list[ResumeOut]` |
| POST | `/resumes` | multipart: `file` (PDF/DOCX ≤10MB), `name`, `target_role?`, `set_default?` | `ResumeDetailOut` (parsed) |
| POST | `/resumes/from-profile` | `ResumeCreateFromProfile` | `ResumeDetailOut` |
| GET | `/resumes/{id}` | – | `ResumeDetailOut` |
| PATCH | `/resumes/{id}` | `ResumeUpdate` | `ResumeDetailOut` (content edits bump `version`) |
| POST | `/resumes/{id}/default` | – | `ResumeOut` |
| DELETE | `/resumes/{id}` | – | 204 |
| GET | `/resumes/{id}/file` | – | original upload (download) |
| GET | `/resumes/{id}/parsed` | – | `ParsedResume` (for profile import review) |
| GET | `/resumes/{id}/render?format=pdf\|docx` | – | generated document from structured content |
| GET | `/resumes/{id}/versions` | – | `list[ResumeVersionOut]` |
| POST | `/resumes/tailor` | `TailorIn` | `ResumeVersionDetailOut` |
| GET | `/resumes/versions/{id}` | – | `ResumeVersionDetailOut` |
| POST | `/resumes/versions/{id}/decisions` | `ChangeDecisionIn` | `ResumeVersionDetailOut` (accept/reject changes; content re-derived) |
| POST | `/resumes/versions/{id}/approve` | – | `ResumeVersionDetailOut` (status=approved; pending changes → rejected) |
| GET | `/resumes/versions/{id}/render?format=pdf\|docx` | – | tailored document named `ResumeVersion.file_name` |

## Cover letters — `routers/cover_letters.py`
| GET | `/cover-letters?job_id=` | – | `list[CoverLetterOut]` |
| POST | `/cover-letters/generate` | `CoverLetterGenerateIn` | `CoverLetterOut` (all 3 variants in `variants`) |
| POST | `/cover-letters` | `CoverLetterCreate` | `CoverLetterOut` |
| GET/PATCH/DELETE | `/cover-letters/{id}` | `CoverLetterUpdate` | `CoverLetterOut` (switching `variant` sets `content` to that variant unless content provided) |
| GET | `/cover-letters/{id}/render?format=pdf\|docx` | – | document |

## Jobs — `routers/jobs.py`
| GET | `/jobs` | query: `view=all\|recommended\|new\|saved\|closing_soon\|hidden`, `q`, `tier`, `source`, `work_arrangement`, `sort=match\|date\|salary\|deadline`, `page`, `page_size` | `JobListOut` |
| GET | `/jobs/{id}` | – | `JobDetailOut` (marks seen) |
| POST/DELETE | `/jobs/{id}/save` | – | `JobOut` |
| POST | `/jobs/{id}/hide` | `HideJobIn` | `JobOut` |
| POST | `/jobs/{id}/unhide` | – | `JobOut` |
| POST | `/jobs/{id}/feedback` | `JobFeedbackIn` | `JobOut` |
| POST | `/jobs/{id}/rescore` | – | `JobMatchOut` |
| POST | `/jobs/manual` | `ManualJobIn` | `JobDetailOut` (extracted, deduped, scored) |

View semantics: `recommended` = match tier strong/good, not hidden. `new` = first seen in last 72h and unseen. `closing_soon` = deadline within `quality_filters.deadline_warning_days`. `hidden` = hidden by filters or user. All other views exclude hidden jobs.

## Job searches — `routers/job_searches.py`
| POST | `/job-searches/parse` | `ParseQueryIn` | `ParsedQuery` (natural language → filters; shown before running) |
| GET | `/job-searches` | – | `list[JobSearchOut]` |
| POST | `/job-searches` | `JobSearchIn` | `JobSearchOut` |
| PATCH/DELETE | `/job-searches/{id}` | `JobSearchUpdate` | `JobSearchOut` |
| POST | `/job-searches/run` | `RunSearchIn` | `AgentTaskOut` (202; runs in background) |
| POST | `/job-searches/{id}/run` | – | `AgentTaskOut` |

## Matching — `routers/job_matches.py`
| GET | `/job-matches/weights` | – | `ScoringWeightsOut` |
| PUT | `/job-matches/weights` | `ScoringWeightsIn` | `ScoringWeightsOut` (recomputes all matches) |
| POST | `/job-matches/recompute` | – | `{"updated": int}` |
| GET | `/job-matches/{job_id}` | – | `JobMatchOut` |

Weight keys: `skills, experience, education, location, salary, work_arrangement, employment_type, career, requirements`.

## Companies — `routers/companies.py`
| GET | `/companies?q=` | – | `list[CompanyOut]` |
| GET | `/companies/{id}` | – | `{company: CompanyOut, jobs: list[JobOut], applications: list[{id, job_title, status}]}` |
| PATCH | `/companies/{id}` | `CompanyUpdate` | `CompanyOut` |
| POST | `/companies/{id}/research` | – | `CompanyOut` (facts labelled verified / opinion / inferred) |

## Applications — `routers/applications.py`, `routers/application_answers.py`
| GET | `/applications?status=&q=` | – | `list[ApplicationOut]` |
| GET | `/applications/board` | – | `BoardOut` (all 14 statuses as columns, ordered by `board_position`) |
| POST | `/applications` | `ApplicationCreate` | `ApplicationOut` (201; 409 if one exists for the job) |
| POST | `/applications/prepare` | `PrepareIn` | `ApplicationDetailOut` — selects resume, tailors it, generates cover letter, prepares answers, researches company, computes readiness. Status → `ready` (or `reviewing` when blocking items exist). |
| GET | `/applications/{id}` | – | `ApplicationDetailOut` |
| PATCH | `/applications/{id}` | `ApplicationUpdate` | `ApplicationDetailOut` |
| DELETE | `/applications/{id}` | – | 204 |
| POST | `/applications/{id}/status` | `StatusUpdateIn` | `ApplicationOut` (records history + audit; moving to an interview status auto-creates an `Interview` with prep) |
| GET | `/applications/{id}/preview` | – | `ApplicationPreview` |
| POST | `/applications/{id}/readiness/refresh` | – | `ApplicationDetailOut` |
| POST | `/applications/{id}/approve` | `ApproveIn` | `ApplicationDetailOut` — records explicit per-application approval (`approved_at`). 409 if blocking readiness items or unconfirmed answers (unless `acknowledge_answers`). |
| POST | `/applications/{id}/submit` | – | `SubmitResult` — only valid within 30 min after approval; never without it (403). External-link flow returns `state=pending_user` + `apply_url`; status is NOT set to applied yet. |
| POST | `/applications/{id}/confirm-submitted` | `ConfirmSubmittedIn` | `ApplicationDetailOut` — user confirms they completed the submission; status → `applied`, `applied_at` set, optional follow-up created. `submitted=false` → back to `ready`. |
| GET | `/applications/{id}/documents/{doc_id}` | – | file download |
| POST | `/applications/{id}/answers` | `AnswerIn` | `AnswerOut` |
| PATCH | `/application-answers/{id}` | `AnswerUpdate` | `AnswerOut` (editing sets `source=user`) |
| DELETE | `/application-answers/{id}` | – | 204 |

## Interviews — `routers/interviews.py`
| GET | `/interviews?upcoming=true` | – | `list[InterviewOut]` |
| POST | `/interviews` | `InterviewIn` | `InterviewDetailOut` (prep generated) |
| GET/PATCH/DELETE | `/interviews/{id}` | `InterviewUpdate` | `InterviewDetailOut` |
| POST | `/interviews/{id}/prep/regenerate` | – | `InterviewDetailOut` |
| POST | `/interviews/{id}/practice` | `PracticeIn` | `PracticeEntry` (heuristic STAR feedback) |
| GET | `/interviews/{id}/ics` | – | calendar file |

## Networking — `routers/recruiters.py`
| GET/POST | `/recruiters` | `RecruiterIn` | `RecruiterOut` |
| GET/PATCH/DELETE | `/recruiters/{id}` | `RecruiterUpdate` | `RecruiterOut` |
| POST | `/recruiters/{id}/message` | `NetworkingMessageIn` | `GeneratedText` |

## Follow-ups — `routers/follow_ups.py`
| GET | `/follow-ups?status=pending` | – | `list[FollowUpOut]` |
| GET | `/follow-ups/suggestions` | – | `list[FollowUpSuggestion]` (applied ≥7 days ago, no response, no pending follow-up) |
| POST | `/follow-ups` | `FollowUpIn` | `FollowUpOut` |
| PATCH/DELETE | `/follow-ups/{id}` | `FollowUpUpdate` | `FollowUpOut` |
| POST | `/follow-ups/{id}/complete` | – | `FollowUpOut` |
| POST | `/follow-ups/{id}/generate-message` | – | `GeneratedText` (also saved on the follow-up) |

## Notifications — `routers/notifications.py`
| GET | `/notifications?unread=&limit=` | – | `NotificationListOut` |
| POST | `/notifications/{id}/read` · `/notifications/read-all` | – | 204 |
| DELETE | `/notifications/{id}` | – | 204 |

## Templates — `routers/templates.py`
| GET | `/templates?kind=` | – | `list[TemplateOut]` (defaults seeded on first access) |
| POST | `/templates` | `TemplateIn` | `TemplateOut` |
| PATCH/DELETE | `/templates/{id}` | `TemplateUpdate` | `TemplateOut` |
| POST | `/templates/{id}/render` | `TemplateRenderIn` | `TemplateRenderOut` — placeholders: `{{first_name}} {{full_name}} {{company}} {{job_title}} {{recruiter_name}} {{applied_date}} {{my_email}} {{my_phone}} {{top_skills}}` |

## Integrations — `routers/integrations.py`
| GET | `/integrations` | – | `list[IntegrationOut]` for: linkedin, indeed, gmail, outlook, google_calendar, microsoft_calendar |
| POST | `/integrations/{provider}/connect` | – | `ConnectOut` (OAuth authorize URL with `state`); 400 with friendly message when the server has no OAuth credentials for that provider |
| GET | `/integrations/{provider}/callback?code&state` | – | redirect to `{frontend_url}/settings?tab=integrations&connected=provider` |
| POST | `/integrations/{provider}/disconnect` | – | `IntegrationOut` (tokens deleted) |
| POST | `/integrations/email/sync` | – | `AgentTaskOut` |

## Agent — `routers/agent.py`
| GET | `/agent/status` | – | `AgentStatusOut` |
| GET | `/agent/tasks?limit=` | – | `list[AgentTaskOut]` |
| GET | `/agent/tasks/{id}` | – | `AgentTaskOut` |
| POST | `/agent/tasks/{id}/cancel` | – | `AgentTaskOut` |
| GET/PATCH | `/agent/settings` | `AgentSettings` | `AgentSettings` (`auto_submit` is always false) |
| POST | `/agent/run` | `AgentRunIn` | `AgentTaskOut` — runs a search built from the user's preferences |

Search task steps (in order): `search_linkedin`, `search_indeed`, `search_company_sites`, `dedupe`, `analyze`, `score`, `recommend`. Each step has a human label ("Searching LinkedIn"), a status and a detail ("42 jobs found").

## Audit — `routers/audit.py`
| GET | `/audit?entity_type=&entity_id=&limit=&before_id=` | – | `list[AuditLogOut]` newest first |

## Analytics & dashboard — `routers/analytics.py`
| GET | `/analytics/dashboard` | – | `DashboardOut` |
| GET | `/analytics/summary?range_days=30` | – | `AnalyticsOut` |
| GET | `/analytics/resume-performance` | – | `ResumePerformanceOut` |

`DashboardOut` list item shapes:
- `ready_to_apply`: `{application_id, company, title, match}`
- `upcoming_interviews`: `{interview_id, application_id, company, title, kind, scheduled_at}`
- `follow_ups_due`: `{follow_up_id, application_id, company, title, due_at}`
- `pipeline`: `{status, label, count}`

## Demo — `routers/demo.py` (only when `APPLIER_DEMO_MODE=true`)
| POST | `/demo/seed` | – | `{"message": str}` — fills the current account with a realistic sample profile, resumes, jobs, applications, interviews, follow-ups, notifications and audit history (all demo rows flagged `is_demo`) |
| DELETE | `/demo` | – | 204 — removes demo rows |

## Shared backend services (import contracts)
- `services.profile_bundle.load_bundle(db, user) -> ProfileBundle` — the ONLY source of user facts.
- `services.taxonomy` — `extract_skills(text)`, `canonicalize(name)`, `category_of(name)`, `expand_with_implied(set)`.
- `services.audit.record(db, user_id, action, summary, actor=..., entity_type=..., entity_id=..., details=...)`
- `services.notifications.notify(db, user_id, type, title, body, link=..., priority=...)`
- `services.llm.generate(system, prompt) -> str | None` and `llm.unsupported_claims(text, allowed_skills, job_skills)`.
- `services.sources.base.RawPosting / JobSourceAdapter / SourceError`.
- `services.jd_extract.extract_requirements(description: str, title: str = "") -> dict` (JobRequirements dict).
- `services.matching.DEFAULT_WEIGHTS`, `matching.CATEGORY_LABELS`, `matching.upsert_match(db, job, bundle) -> JobMatch`, `matching.recompute_all(db, user) -> int`.
- `services.jobs_ingest.ingest_postings(db, user, postings: list[RawPosting], *, actor="agent") -> IngestResult` with fields `found, new, merged_duplicates, updated, job_ids`.
- `services.company_research.get_or_create_company(db, user_id, name, **fields) -> Company`, `research_company(db, company) -> Company`.
- `services.sources.demo.DemoSource` — deterministic realistic sample postings (flagged `is_demo`).
- `services.agent.runner.start_search_task(db, user, filters, sources, *, trigger="user", job_search_id=None, query_text=None) -> AgentTask`.
- `services.resume_builder.build_from_profile(bundle) -> dict` (ResumeContent dict).
- `services.application_prep.prepare_application(db, user, job, *, resume_id=None, cover_letter_variant="professional", include_cover_letter=None) -> Application`.
- `services.interview_prep.generate_prep(db, application) -> dict` (InterviewPrep dict).
- `api.serializers.job_out / job_detail_out / match_out / company_out`.
