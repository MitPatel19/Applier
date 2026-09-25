import type { ApplicationStatus, JobType, MatchTier, WorkArrangement, ExperienceLevel } from "./types";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  discovered: "Discovered",
  saved: "Saved",
  reviewing: "Reviewing",
  ready: "Ready to Apply",
  applied: "Applied",
  confirmed: "Application Confirmed",
  recruiter_contacted: "Recruiter Contacted",
  interview: "Interview",
  technical_interview: "Technical Interview",
  final_interview: "Final Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

export const STATUS_ORDER: ApplicationStatus[] = [
  "discovered",
  "saved",
  "reviewing",
  "ready",
  "applied",
  "confirmed",
  "recruiter_contacted",
  "interview",
  "technical_interview",
  "final_interview",
  "offer",
  "rejected",
  "withdrawn",
  "closed",
];

/** Badge tone for each status (see components/ui/badge.tsx). */
export const STATUS_TONE: Record<ApplicationStatus, "neutral" | "primary" | "info" | "success" | "warning" | "danger" | "accent"> = {
  discovered: "neutral",
  saved: "neutral",
  reviewing: "info",
  ready: "primary",
  applied: "accent",
  confirmed: "accent",
  recruiter_contacted: "info",
  interview: "warning",
  technical_interview: "warning",
  final_interview: "warning",
  offer: "success",
  rejected: "danger",
  withdrawn: "neutral",
  closed: "neutral",
};

export const TIER_LABELS: Record<MatchTier, string> = {
  strong: "Strong match",
  good: "Good match",
  possible: "Possible match",
  weak: "Weak match",
};

export const TIER_TONE: Record<MatchTier, "success" | "primary" | "warning" | "neutral"> = {
  strong: "success",
  good: "primary",
  possible: "warning",
  weak: "neutral",
};

/** Color for a 0-100 score (CSS variable). */
export function scoreColor(score: number | null | undefined) {
  if (score === null || score === undefined) return "var(--text-subtle)";
  if (score >= 80) return "var(--success)";
  if (score >= 65) return "var(--primary)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

export const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  company_site: "Company Website",
  company_sites: "Employer Websites",
  greenhouse: "Company Website",
  lever: "Company Website",
  ashby: "Company Website",
  manual: "Added manually",
  demo: "Demo",
};

export const WORK_ARRANGEMENT_LABELS: Record<WorkArrangement, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  co_op: "Co-op",
  temporary: "Temporary",
};

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  entry: "Entry-level",
  junior: "Junior",
  intermediate: "Intermediate",
  senior: "Senior",
  lead: "Lead",
};

export const SKILL_CATEGORY_LABELS: Record<string, string> = {
  programming: "Programming",
  frameworks: "Frameworks",
  databases: "Databases",
  cloud: "Cloud",
  devops: "DevOps",
  tools: "Tools",
  soft: "Soft skills",
  certifications: "Certifications",
  other: "Other",
};

export const INTERVIEW_KIND_LABELS: Record<string, string> = {
  phone_screen: "Phone screen",
  recruiter: "Recruiter call",
  technical: "Technical interview",
  behavioral: "Behavioral interview",
  onsite: "On-site interview",
  final: "Final interview",
  other: "Interview",
};
