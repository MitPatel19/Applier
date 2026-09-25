import {
  Award,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  Eye,
  Handshake,
  Inbox,
  MessageSquareText,
  Rocket,
  Search,
  Send,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { STATUS_LABELS, STATUS_ORDER, STATUS_TONE } from "@/lib/constants";
import type { Application, ApplicationStatus, Board } from "@/lib/types";

export type Tone = (typeof STATUS_TONE)[ApplicationStatus];

export interface Lane {
  id: string;
  label: string;
  statuses: ApplicationStatus[];
  /** Status an application gets when dropped into this lane from another lane. */
  primary: ApplicationStatus;
  tone: Tone;
  icon: LucideIcon;
  hint: string;
}

export const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--text-subtle)",
  primary: "var(--primary)",
  accent: "var(--accent)",
  info: "var(--info)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

export const STATUS_ICON: Record<ApplicationStatus, LucideIcon> = {
  discovered: Search,
  saved: Bookmark,
  reviewing: Eye,
  ready: Rocket,
  applied: Send,
  confirmed: CheckCircle2,
  recruiter_contacted: MessageSquareText,
  interview: CalendarClock,
  technical_interview: CalendarClock,
  final_interview: CalendarClock,
  offer: Award,
  rejected: XCircle,
  withdrawn: Undo2,
  closed: CircleSlash,
};

/** Short labels for sub-stages shown on cards inside a grouped lane. */
export const SUBSTAGE_LABELS: Partial<Record<ApplicationStatus, string>> = {
  confirmed: "Confirmed",
  recruiter_contacted: "Recruiter contacted",
  interview: "Interview",
  technical_interview: "Technical",
  final_interview: "Final round",
};

const STATUS_HINTS: Record<ApplicationStatus, string> = {
  discovered: "Found by your agent",
  saved: "Bookmarked for later",
  reviewing: "Needs your input",
  ready: "Prepared — awaiting your approval",
  applied: "Submitted",
  confirmed: "Employer confirmed receipt",
  recruiter_contacted: "A recruiter reached out",
  interview: "Interview scheduled",
  technical_interview: "Technical round",
  final_interview: "Final round",
  offer: "Congratulations!",
  rejected: "Not this time",
  withdrawn: "You withdrew",
  closed: "Posting closed",
};

export const INTERVIEW_STATUSES: ApplicationStatus[] = ["interview", "technical_interview", "final_interview"];
export const READY_STATUSES: ApplicationStatus[] = ["ready", "reviewing"];

/** Main journey — sub-stages are grouped into their parent lane and shown as badges on cards. */
export const MAIN_LANES: Lane[] = [
  { id: "saved", label: "Saved", statuses: ["saved"], primary: "saved", tone: "neutral", icon: Bookmark, hint: STATUS_HINTS.saved },
  { id: "reviewing", label: "Reviewing", statuses: ["reviewing"], primary: "reviewing", tone: "info", icon: Eye, hint: STATUS_HINTS.reviewing },
  { id: "ready", label: "Ready to Apply", statuses: ["ready"], primary: "ready", tone: "primary", icon: Rocket, hint: STATUS_HINTS.ready },
  {
    id: "applied",
    label: "Applied",
    statuses: ["applied", "confirmed", "recruiter_contacted"],
    primary: "applied",
    tone: "accent",
    icon: Send,
    hint: "Submitted, confirmed or in touch",
  },
  {
    id: "interview",
    label: "Interviewing",
    statuses: INTERVIEW_STATUSES,
    primary: "interview",
    tone: "warning",
    icon: Handshake,
    hint: "Screens, technical & final rounds",
  },
  { id: "offer", label: "Offer", statuses: ["offer"], primary: "offer", tone: "success", icon: Award, hint: STATUS_HINTS.offer },
];

/** Every status as its own lane. */
export const ALL_LANES: Lane[] = STATUS_ORDER.map((s) => ({
  id: s,
  label: STATUS_LABELS[s],
  statuses: [s],
  primary: s,
  tone: STATUS_TONE[s],
  icon: s === "discovered" ? Inbox : STATUS_ICON[s],
  hint: STATUS_HINTS[s],
}));

export const HIDDEN_BY_DEFAULT: ApplicationStatus[] = STATUS_ORDER.filter(
  (s) => !MAIN_LANES.some((l) => l.statuses.includes(s)),
);

export function flattenBoard(board: Board | undefined): Application[] {
  return board?.columns.flatMap((c) => c.items) ?? [];
}

export function isInterviewStatus(s: ApplicationStatus) {
  return INTERVIEW_STATUSES.includes(s);
}
