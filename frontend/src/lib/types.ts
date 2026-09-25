/**
 * API types — these mirror the Pydantic schemas in backend/app/schemas/*.py.
 * Keep them in sync when the backend contract changes.
 */

// ---------------------------------------------------------------- common
export interface Message {
  message: string;
}
export interface GeneratedText {
  subject: string | null;
  body: string;
  generated_by: "template" | "ai";
}

// ---------------------------------------------------------------- auth
export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "user" | "admin";
  onboarding_completed: boolean;
  created_at: string;
  last_login_at: string | null;
}
export interface SessionOut {
  user: User;
  access_token: string;
  token_type: string;
}

// ---------------------------------------------------------------- profile
export type WorkArrangement = "onsite" | "hybrid" | "remote";
export type JobType = "full_time" | "part_time" | "contract" | "internship" | "co_op" | "temporary";
export type ExperienceLevel = "entry" | "junior" | "intermediate" | "senior" | "lead";
export type SkillCategory =
  | "programming"
  | "frameworks"
  | "databases"
  | "cloud"
  | "devops"
  | "tools"
  | "soft"
  | "certifications"
  | "other";

export interface Profile {
  phone: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  github_url: string | null;
  website_url: string | null;
  headline: string | null;
  summary: string | null;
  years_experience: number | null;
  desired_positions: string[];
  desired_salary: number | null;
  salary_period: "yearly" | "hourly";
  currency: string;
  work_authorization: string | null;
  authorized_countries: string[];
  requires_sponsorship: boolean | null;
  availability: string | null;
  preferred_arrangements: WorkArrangement[];
}
export type ProfileIn = Partial<Profile>;

export interface EducationIn {
  institution: string;
  degree?: string | null;
  program?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  gpa?: string | null;
  location?: string | null;
  coursework?: string[];
  sort_order?: number;
}
export interface Education extends Required<EducationIn> {
  id: number;
}

export interface ExperienceIn {
  company: string;
  position: string;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  responsibilities?: string[];
  achievements?: string[];
  technologies?: string[];
  metrics?: string[];
  sort_order?: number;
}
export interface Experience extends Required<ExperienceIn> {
  id: number;
}

export interface SkillIn {
  name: string;
  category?: SkillCategory | null;
  level?: "beginner" | "intermediate" | "advanced" | "expert" | null;
  years?: number | null;
}
export interface Skill {
  id: number;
  name: string;
  category: SkillCategory;
  level: string | null;
  years: number | null;
}

export interface ProjectIn {
  name: string;
  description?: string | null;
  technologies?: string[];
  responsibilities?: string[];
  results?: string[];
  github_url?: string | null;
  demo_url?: string | null;
  sort_order?: number;
}
export interface Project extends Required<ProjectIn> {
  id: number;
}

export interface CompletenessItem {
  key: string;
  label: string;
  done: boolean;
  weight: number;
}
export interface FullProfile {
  user: User;
  profile: Profile;
  educations: Education[];
  experiences: Experience[];
  skills: Skill[];
  projects: Project[];
  completeness: { percent: number; items: CompletenessItem[] };
}

export interface QualityFilters {
  hide: Record<string, boolean>;
  flag: Record<string, boolean>;
  max_age_days: number;
  deadline_warning_days: number;
}
export interface AgentSettings {
  search_frequency: "manual" | "daily" | "several_daily";
  auto_search: boolean;
  auto_dedupe: boolean;
  auto_analyze: boolean;
  auto_score: boolean;
  auto_customize_resume: boolean;
  auto_cover_letter: boolean;
  auto_company_research: boolean;
  auto_submit: false;
  sources: string[];
  strong_match_threshold: number;
  notify_on_strong_match: boolean;
}
export interface NotificationSettings {
  in_app: boolean;
  email: boolean;
  browser: boolean;
  types: Record<string, boolean>;
}
export interface UISettings {
  theme: "system" | "light" | "dark";
  reduced_motion: boolean;
  high_contrast: boolean;
}
export interface Preferences {
  target_locations: string[];
  job_types: JobType[];
  work_arrangements: WorkArrangement[];
  experience_levels: ExperienceLevel[];
  target_roles: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_period: "yearly" | "hourly";
  currency: string;
  industries: string[];
  preferred_companies: string[];
  avoid_companies: string[];
  technologies: string[];
  required_certifications_available: string[];
  scoring_weights: Record<string, number>;
  quality_filters: QualityFilters;
  agent_settings: AgentSettings;
  notification_settings: NotificationSettings;
  ui_settings: UISettings;
}
export type PreferencesIn = Partial<Omit<Preferences, "scoring_weights" | "agent_settings">>;

export interface ParsedResume {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  headline: string | null;
  summary: string | null;
  skills: SkillIn[];
  experiences: ExperienceIn[];
  educations: EducationIn[];
  projects: ProjectIn[];
  warnings: string[];
}

// ---------------------------------------------------------------- resumes
export interface ResumeLink {
  label: string;
  url: string;
}
export interface ResumeBullet {
  id: string;
  text: string;
}
export interface ResumeContent {
  contact: { name: string; email: string | null; phone: string | null; location: string | null; links: ResumeLink[] };
  headline: string | null;
  summary: string | null;
  skills: { category: string; items: string[] }[];
  experience: {
    id: string;
    source_id: number | null;
    company: string;
    position: string;
    location: string | null;
    start: string | null;
    end: string | null;
    bullets: ResumeBullet[];
    technologies: string[];
  }[];
  projects: {
    id: string;
    source_id: number | null;
    name: string;
    description: string | null;
    technologies: string[];
    bullets: ResumeBullet[];
    url: string | null;
  }[];
  education: {
    id: string;
    institution: string;
    degree: string | null;
    program: string | null;
    start: string | null;
    end: string | null;
    gpa: string | null;
    location: string | null;
    details: string[];
  }[];
  certifications: string[];
  section_order: string[];
}

export interface Resume {
  id: number;
  name: string;
  target_role: string | null;
  version: number;
  status: "active" | "draft" | "archived";
  is_default: boolean;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
  has_file: boolean;
  skills_count: number;
  versions_count: number;
}
export interface ResumeDetail extends Resume {
  content: ResumeContent;
  parsed_text: string | null;
}

export type ResumeChangeType = "emphasize" | "reorder" | "rewrite" | "remove" | "keyword" | "summary";
export interface ResumeChange {
  id: string;
  type: ResumeChangeType;
  section: string;
  item_ref: string | null;
  title: string;
  before: string | null;
  after: string | null;
  reason: string;
  accepted: boolean | null;
}
export interface ResumeVersion {
  id: number;
  resume_id: number;
  job_id: number | null;
  label: string;
  file_name: string;
  status: "draft" | "approved";
  ats_score: number | null;
  created_at: string;
  updated_at: string;
}
export interface ResumeVersionDetail extends ResumeVersion {
  content: ResumeContent;
  base_content: ResumeContent;
  changes: ResumeChange[];
  keywords_matched: string[];
  keywords_missing: string[];
  integrity_notes: string[];
}

export type CoverLetterVariant = "professional" | "short" | "personalized";
export interface CoverLetter {
  id: number;
  job_id: number | null;
  title: string;
  variant: CoverLetterVariant;
  content: string;
  variants: Partial<Record<CoverLetterVariant, string>>;
  status: "draft" | "approved";
  generated_by: "template" | "ai" | "user";
  created_at: string;
  updated_at: string;
  company_name: string | null;
  job_title: string | null;
}

// ---------------------------------------------------------------- jobs
export type SourceKey = "linkedin" | "indeed" | "company_sites";

export interface SearchFilters {
  roles: string[];
  keywords: string[];
  locations: string[];
  remote_regions: string[];
  work_arrangements: WorkArrangement[];
  job_types: JobType[];
  experience_levels: ExperienceLevel[];
  salary_min: number | null;
  salary_period: "yearly" | "hourly";
  posted_within_days: number | null;
  companies: string[];
  exclude_companies: string[];
  industries: string[];
  easy_apply_only: boolean;
}
export interface Interpretation {
  field: string;
  label: string;
  value: string;
}
export interface ParsedQuery {
  text: string;
  filters: SearchFilters;
  interpretation: Interpretation[];
  warnings: string[];
  suggested_name: string;
}
export interface JobSearch {
  id: number;
  name: string;
  query_text: string | null;
  filters: SearchFilters;
  sources: SourceKey[];
  schedule: "manual" | "daily" | "several_daily";
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_result_count: number | null;
  created_at: string;
}
export interface JobSearchIn {
  name: string;
  query_text?: string | null;
  filters: SearchFilters;
  sources?: SourceKey[];
  schedule?: JobSearch["schedule"];
  is_active?: boolean;
}

export type MatchTier = "strong" | "good" | "possible" | "weak";
export interface MatchCategory {
  key: string;
  label: string;
  score: number;
  weight: number;
  applicable: boolean;
  summary: string;
  reasons: string[];
  matched: string[];
  missing: string[];
}
export interface JobMatch {
  job_id: number;
  overall: number;
  tier: MatchTier;
  breakdown: MatchCategory[];
  missing_required: string[];
  missing_preferred: string[];
  recommendation: string;
  should_apply: "apply" | "consider" | "skip";
  concerns: string[];
  weights: Record<string, number>;
  updated_at: string;
}
export interface ScoringWeights {
  weights: Record<string, number>;
  defaults: Record<string, number>;
  labels: Record<string, string>;
}

export interface JobRequirements {
  required_skills: string[];
  preferred_skills: string[];
  education: string[];
  education_level: string | null;
  min_years_experience: number | null;
  max_years_experience: number | null;
  responsibilities: string[];
  technologies: string[];
  certifications: string[];
  keywords: string[];
  soft_skills: string[];
  work_authorization: string | null;
  benefits: string[];
  questions: string[];
}
export interface JobFlag {
  code: string;
  label: string;
  severity: "info" | "warning";
}
export interface JobSource {
  id: number;
  source: string;
  source_label: string;
  url: string | null;
  apply_url: string | null;
  apply_method: "external_link" | "easy_apply" | "ats_form";
  fetched_at: string;
}
export interface JobMatchSummary {
  overall: number;
  tier: MatchTier;
  recommendation: string;
  top_matched: string[];
  top_missing: string[];
}
export interface Job {
  id: number;
  title: string;
  company_name: string;
  company_id: number | null;
  location: string | null;
  work_arrangement: WorkArrangement | null;
  employment_type: JobType | null;
  experience_level: ExperienceLevel | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: "yearly" | "hourly" | null;
  currency: string | null;
  posted_at: string | null;
  deadline: string | null;
  first_seen_at: string;
  is_saved: boolean;
  is_hidden: boolean;
  is_seen: boolean;
  is_demo: boolean;
  flags: JobFlag[];
  hidden_reasons: string[];
  sources: JobSource[];
  match: JobMatchSummary | null;
  application_id: number | null;
  application_status: ApplicationStatus | null;
}
export interface CompanyFact {
  text: string;
  kind: "verified" | "opinion" | "inferred";
  source: string;
  source_url: string | null;
  as_of: string | null;
}
export interface Company {
  id: number;
  name: string;
  industry: string | null;
  website: string | null;
  headquarters: string | null;
  size: string | null;
  locations: string[];
  careers_url: string | null;
  description: string | null;
  products: string[];
  tech_stack: string[];
  benefits: string[];
  facts: CompanyFact[];
  notes: string | null;
  researched_at: string | null;
  is_demo: boolean;
  open_jobs: number;
}
export interface JobDetail extends Job {
  description: string;
  department: string | null;
  requirements: JobRequirements;
  full_match: JobMatch | null;
  company: Company | null;
  duplicates_merged: number;
}
export interface JobCounts {
  all: number;
  recommended: number;
  new: number;
  saved: number;
  closing_soon: number;
  hidden: number;
  strong: number;
  good: number;
  possible: number;
}
export interface JobList {
  items: Job[];
  total: number;
  page: number;
  page_size: number;
  counts: JobCounts;
}
export type JobView = "all" | "recommended" | "new" | "saved" | "closing_soon" | "hidden";
export interface JobListQuery {
  view?: JobView;
  q?: string;
  tier?: MatchTier | "";
  source?: string;
  work_arrangement?: WorkArrangement | "";
  sort?: "match" | "date" | "salary" | "deadline";
  page?: number;
  page_size?: number;
}
export interface ManualJobIn {
  title: string;
  company_name: string;
  location?: string | null;
  url?: string | null;
  description: string;
  work_arrangement?: WorkArrangement | null;
  employment_type?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_period?: "yearly" | "hourly" | null;
  deadline?: string | null;
}

// ---------------------------------------------------------------- applications
export type ApplicationStatus =
  | "discovered"
  | "saved"
  | "reviewing"
  | "ready"
  | "applied"
  | "confirmed"
  | "recruiter_contacted"
  | "interview"
  | "technical_interview"
  | "final_interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "closed";

export interface ReadinessItem {
  key: string;
  label: string;
  state: "ok" | "warning" | "missing";
  detail: string | null;
  resolvable: boolean;
  field: string | null;
  blocking: boolean;
}
export interface Answer {
  id: number;
  question: string;
  answer: string;
  field_type: "text" | "textarea" | "yes_no" | "number" | "select";
  options: string[];
  required: boolean;
  source: "profile" | "generated" | "template" | "user";
  needs_confirmation: boolean;
  confirmed: boolean;
  sort_order: number;
}
export interface StatusChange {
  id: number;
  from_status: string | null;
  to_status: string;
  actor: "user" | "agent" | "email";
  note: string | null;
  changed_at: string;
}
export interface ApplicationDocument {
  id: number;
  kind: "resume" | "cover_letter" | "other";
  file_name: string;
  mime_type: string | null;
  created_at: string;
}
export interface Application {
  id: number;
  job_id: number | null;
  company_name: string;
  job_title: string;
  location: string | null;
  source: string | null;
  url: string | null;
  status: ApplicationStatus;
  board_position: number;
  match_score: number | null;
  resume_id: number | null;
  resume_version_id: number | null;
  cover_letter_id: number | null;
  recruiter_id: number | null;
  date_discovered: string | null;
  prepared_at: string | null;
  approved_at: string | null;
  applied_at: string | null;
  submission_method: "external_link" | "automation" | "manual" | null;
  submission_state: "pending_user" | "submitted" | "failed" | "paused" | null;
  notes: string | null;
  rejection_reason: string | null;
  salary_expectation: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  resume_name: string | null;
  next_interview_at: string | null;
  next_follow_up_at: string | null;
  readiness_summary: Partial<Record<"ok" | "warning" | "missing", number>>;
}
export interface ApplicationDetail extends Application {
  apply_url: string | null;
  job: JobDetail | null;
  match: JobMatch | null;
  company: Company | null;
  resume: Resume | null;
  resume_version: ResumeVersionDetail | null;
  cover_letter: CoverLetter | null;
  answers: Answer[];
  readiness: ReadinessItem[];
  documents: ApplicationDocument[];
  status_history: StatusChange[];
  interviews: { id: number; kind: string; scheduled_at: string | null; outcome: string | null }[];
  follow_ups: { id: number; due_at: string; status: string; channel: string }[];
}
export interface PreviewRow {
  label: string;
  value: string;
  state: "ok" | "warning" | "missing" | "info";
}
export interface ApplicationPreview {
  application_id: number;
  company: string;
  position: string;
  location: string | null;
  source: string | null;
  match: number | null;
  resume_file_name: string | null;
  cover_letter_file_name: string | null;
  answers_completed: number;
  answers_total: number;
  missing: string[];
  concerns: string[];
  status: string;
  can_approve: boolean;
  destination: string | null;
  submission_method: "external_link" | "automation" | "manual";
  rows: PreviewRow[];
}
export interface SubmitResult {
  application_id: number;
  state: "pending_user" | "submitted" | "failed" | "paused";
  message: string;
  apply_url: string | null;
  steps: { label: string; done: boolean; requires_user: boolean }[];
  status: ApplicationStatus;
}
export interface BoardColumn {
  status: ApplicationStatus;
  label: string;
  items: Application[];
}
export interface Board {
  columns: BoardColumn[];
}

// ---------------------------------------------------------------- interviews
export type InterviewKind = "phone_screen" | "recruiter" | "technical" | "behavioral" | "onsite" | "final" | "other";
export interface StarStory {
  title: string;
  source: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  fits_questions: string[];
}
export interface PrepQuestion {
  question: string;
  why: string | null;
  tips: string[];
  suggested_story: string | null;
}
export interface InterviewPrep {
  company_overview: string;
  role_summary: string;
  required_skills: string[];
  technical_topics: { topic: string; why?: string; subtopics?: string[] }[];
  behavioral_questions: PrepQuestion[];
  technical_questions: PrepQuestion[];
  star_stories: StarStory[];
  questions_to_ask: string[];
  relevant_projects: { name: string; why?: string; talking_points?: string[] }[];
  talking_points: string[];
  gaps_to_prepare: string[];
  generated_at: string | null;
}
export interface Interview {
  id: number;
  application_id: number;
  kind: InterviewKind;
  scheduled_at: string | null;
  duration_minutes: number | null;
  location: string | null;
  meeting_url: string | null;
  interviewers: string[];
  notes: string | null;
  outcome: "pending" | "passed" | "failed" | "cancelled" | null;
  created_at: string;
  company_name: string;
  job_title: string;
}
export interface PracticeEntry {
  question: string;
  answer: string;
  feedback: string[];
  score: number;
  created_at: string;
}
export interface InterviewDetail extends Interview {
  prep: InterviewPrep;
  practice_log: PracticeEntry[];
}
export interface InterviewIn {
  application_id: number;
  kind?: InterviewKind;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
  location?: string | null;
  meeting_url?: string | null;
  interviewers?: string[];
  notes?: string | null;
}

// ---------------------------------------------------------------- networking / follow-ups
export interface RecruiterIn {
  name: string;
  title?: string | null;
  company?: string | null;
  kind?: "recruiter" | "hiring_manager" | "contact";
  linkedin_url?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  last_contact_at?: string | null;
  next_follow_up_at?: string | null;
}
export interface Recruiter extends Required<RecruiterIn> {
  id: number;
  created_at: string;
  applications_count: number;
}
export type NetworkingPurpose =
  | "introduction"
  | "follow_up"
  | "thank_you"
  | "referral_request"
  | "informational_interview";

export interface FollowUp {
  id: number;
  application_id: number | null;
  recruiter_id: number | null;
  due_at: string;
  channel: "email" | "dashboard" | "manual";
  status: "pending" | "done" | "dismissed" | "snoozed";
  subject: string | null;
  message: string | null;
  note: string | null;
  completed_at: string | null;
  created_at: string;
  company_name: string | null;
  job_title: string | null;
  recruiter_name: string | null;
  is_overdue: boolean;
}
export interface FollowUpIn {
  application_id?: number | null;
  recruiter_id?: number | null;
  due_at: string;
  channel?: FollowUp["channel"];
  subject?: string | null;
  message?: string | null;
  note?: string | null;
}

// ---------------------------------------------------------------- notifications / templates
export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  priority: "low" | "normal" | "high";
  read_at: string | null;
  created_at: string;
}
export interface NotificationList {
  items: Notification[];
  unread_count: number;
}

export type TemplateKind = "cover_letter" | "question" | "follow_up" | "recruiter_message" | "thank_you";
export interface TemplateIn {
  kind: TemplateKind;
  name: string;
  subject?: string | null;
  body: string;
  question?: string | null;
  is_default?: boolean;
}
export interface Template extends Required<TemplateIn> {
  id: number;
  created_at: string;
  updated_at: string;
}
export interface TemplateRender {
  subject: string | null;
  body: string;
  unresolved: string[];
}

// ---------------------------------------------------------------- integrations
export interface Integration {
  provider: string;
  name: string;
  category: "job_source" | "email" | "calendar";
  description: string;
  status: "connected" | "disconnected" | "error" | "pending" | "unavailable";
  available: boolean;
  availability_note: string | null;
  account_label: string | null;
  scopes: string[];
  scope_explanations: string[];
  connected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

// ---------------------------------------------------------------- agent / audit
export interface AgentStep {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  detail: string | null;
  count: number | null;
  started_at: string | null;
  finished_at: string | null;
}
export interface AgentTask {
  id: number;
  kind: string;
  title: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  trigger: "user" | "schedule" | "system";
  job_search_id: number | null;
  steps: AgentStep[];
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}
export interface AgentSourceStatus {
  key: string;
  label: string;
  status: "ready" | "not_connected" | "demo" | "unavailable";
  note: string | null;
}
export interface AgentStatus {
  running: AgentTask | null;
  last: AgentTask | null;
  next_scheduled_run: string | null;
  search_frequency: string;
  ai_writing_available: boolean;
  demo_mode: boolean;
  sources: AgentSourceStatus[];
}
export interface AuditEntry {
  id: number;
  actor: "user" | "agent" | "system";
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  summary: string;
  details: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------- analytics / dashboard
export interface StatTile {
  key: string;
  label: string;
  value: number;
  unit: string | null;
  delta: number | null;
  hint: string | null;
}
export interface BreakdownRow {
  label: string;
  applications: number;
  responses: number;
  interviews: number;
  offers: number;
  response_rate: number;
  interview_rate: number;
}
export interface Analytics {
  range_days: number;
  tiles: StatTile[];
  timeseries: { date: string; discovered: number; applied: number; interviews: number }[];
  funnel: { key: string; label: string; count: number }[];
  by_source: BreakdownRow[];
  by_title: BreakdownRow[];
  by_resume: BreakdownRow[];
  rejection_reasons: { reason: string; count: number }[];
  status_distribution: { status: string; label: string; count: number }[];
  sample_size_note: string | null;
}
export interface ResumePerformance {
  rows: {
    resume_id: number | null;
    resume_name: string;
    applications: number;
    interviews: number;
    offers: number;
    interview_rate: number;
    confidence: "low" | "medium" | "high";
    note: string;
  }[];
  disclaimer: string;
}
export interface DashboardJob {
  id: number;
  title: string;
  company_name: string;
  location: string | null;
  match: number | null;
  tier: MatchTier | null;
  recommendation: string | null;
  deadline: string | null;
  sources: string[];
  is_saved: boolean;
}
export interface DashboardAction {
  key: string;
  label: string;
  count: number;
  link: string;
  priority: "low" | "normal" | "high";
}
export interface Dashboard {
  greeting_name: string;
  agent_status: "ready" | "searching" | "idle";
  agent_message: string;
  job_search: { found: number; relevant: number; strong: number; new: number };
  applications: { applied: number; interviews: number; awaiting_response: number; offers: number };
  actions: DashboardAction[];
  top_opportunities: DashboardJob[];
  new_jobs: DashboardJob[];
  closing_soon: DashboardJob[];
  saved_jobs: DashboardJob[];
  ready_to_apply: { application_id: number; company: string; title: string; match: number | null }[];
  upcoming_interviews: {
    interview_id: number;
    application_id: number;
    company: string;
    title: string;
    kind: string;
    scheduled_at: string;
  }[];
  follow_ups_due: { follow_up_id: number; application_id: number | null; company: string | null; title: string | null; due_at: string }[];
  pipeline: { status: ApplicationStatus; label: string; count: number }[];
  profile_completeness: number;
  onboarding_completed: boolean;
}
