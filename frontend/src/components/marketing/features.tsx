/**
 * Landing-page feature sections. All visuals are illustrative mocks built from the real
 * product components, marked aria-hidden with a short text alternative.
 */

import {
  ArrowDown,
  Building2,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleX,
  Globe,
  GitMerge,
  Lightbulb,
  Lock,
  MapPin,
  MessageSquareQuote,
} from "lucide-react";
import { SourceList, StatusBadge } from "@/components/app/status";
import { Badge } from "@/components/ui/badge";
import { ScoreBar, ScoreRing } from "@/components/ui/score";
import type { ApplicationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ResumeChangesDemo } from "./resume-demo";
import { Reveal } from "./reveal";
import { FeatureSplit, MockWindow } from "./section";

// ---------------------------------------------------------------- discovery
function SourceChip({ label, sub, icon }: { label: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-card">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-muted [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-caption text-subtle">{sub}</p>
      </div>
    </div>
  );
}

function LetterMark({ children }: { children: string }) {
  return <span className="text-[13px] font-bold tracking-tight">{children}</span>;
}

function DiscoveryVisual() {
  return (
    <Reveal>
      <div aria-hidden className="relative rounded-3xl border border-border bg-bg-subtle/60 p-4 sm:p-6">
        <div className="bg-grid pointer-events-none absolute inset-0 rounded-3xl opacity-60" />
        <div className="relative grid gap-2.5 sm:grid-cols-3">
          <SourceChip label="LinkedIn" sub="Full Stack Dev · Toronto" icon={<LetterMark>in</LetterMark>} />
          <SourceChip label="Indeed" sub="Full Stack Developer" icon={<LetterMark>id</LetterMark>} />
          <SourceChip label="Company site" sub="careers.northwind.dev" icon={<Globe />} />
        </div>
        <div className="relative my-3 flex items-center justify-center gap-2 text-caption font-medium text-subtle">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border-strong" />
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 shadow-card">
            <GitMerge className="size-3.5 text-primary" /> 3 postings merged into 1
            <ArrowDown className="size-3.5" />
          </span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border-strong" />
        </div>
        <div className="relative rounded-2xl border border-border bg-surface p-4 shadow-pop">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">Full Stack Developer</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
                Northwind Labs <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" /> Toronto, ON
                </span>
              </p>
            </div>
            <ScoreRing score={84} size={48} stroke={4} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="success" size="xs">
              Strong match
            </Badge>
            <Badge size="xs">Hybrid</Badge>
            <Badge size="xs">$78k–$92k/yr</Badge>
            <Badge size="xs">Posted 2 days ago</Badge>
          </div>
          <p className="mt-3 border-t border-border pt-3 text-sm">
            <SourceList
              sources={[
                { source: "linkedin", source_label: "LinkedIn" },
                { source: "indeed", source_label: "Indeed" },
                { source: "company_site", source_label: "Company Website" },
              ]}
            />
          </p>
        </div>
      </div>
    </Reveal>
  );
}

export function DiscoverySection() {
  return (
    <FeatureSplit
      id="discovery"
      eyebrow="Job discovery"
      title="Every relevant job, from every source — without the duplicates"
      description="Applier searches LinkedIn, Indeed and employer career pages for the roles and locations you care about, then merges repeat postings into a single, clean record."
      points={[
        "Searches on your schedule — manually, daily or several times a day.",
        "Reads public employer career pages directly, no account required.",
        "Flags stale, suspicious or closing-soon postings so you don't waste time.",
      ]}
      visual={<DiscoveryVisual />}
    />
  );
}

// ---------------------------------------------------------------- analysis
function AnalysisVisual() {
  return (
    <Reveal>
      <MockWindow title="Match analysis · Backend Developer at Maple Analytics" className="relative" badge={<Badge tone="primary" size="xs">82%</Badge>}>
        <div aria-hidden>
          <div className="space-y-3">
            <ScoreBar label="Technical skills" score={92} />
            <ScoreBar label="Experience" score={74} />
            <ScoreBar label="Education" score={88} />
            <ScoreBar label="Location & arrangement" score={100} />
            <ScoreBar label="Salary" score={61} />
          </div>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl bg-success-soft/70 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
                <CircleCheck className="size-3.5" /> You have
              </p>
              <p className="mt-1 text-sm text-text">Python, FastAPI, PostgreSQL, REST APIs, Git</p>
            </div>
            <div className="rounded-xl bg-warning-soft/70 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                <CircleAlert className="size-3.5" /> Worth preparing
              </p>
              <p className="mt-1 text-sm text-text">Kubernetes (preferred), 3+ years listed — you have 2</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2.5 rounded-xl border border-border bg-surface-2 p-3">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm text-muted">
              <span className="font-medium text-text">Recommendation: apply.</span> Your API work at your last role maps
              directly to 4 of 5 core responsibilities.
            </p>
          </div>
        </div>
        <p className="sr-only">
          Example match analysis showing an 82% overall match with category scores and the reasons behind them.
        </p>
      </MockWindow>
    </Reveal>
  );
}

export function AnalysisSection() {
  return (
    <FeatureSplit
      id="analysis"
      reverse
      className="bg-surface/50"
      eyebrow="AI job analysis"
      title="Transparent scores. We never hide the reasoning."
      description="Each job is broken down into skills, experience, education, location and salary fit. You see exactly why a job scored the way it did — and what to prepare for."
      points={[
        "Required vs. preferred skills, separated clearly.",
        "Honest recommendation: apply, consider, or skip — with the why.",
        "Tune the weights to match what matters most to you.",
      ]}
      visual={<AnalysisVisual />}
    />
  );
}

// ---------------------------------------------------------------- resume
export function ResumeSection() {
  return (
    <FeatureSplit
      id="resume"
      eyebrow="Resume customization"
      title="Tailored for every role. Never invented."
      description="Applier suggests focused edits — reordering, emphasizing and rewording what you've actually done — and shows every change for you to accept or reject."
      points={[
        "Side-by-side before/after with the reason for each change.",
        "Keyword coverage for applicant tracking systems, without stuffing.",
        "Every version is saved, so you always know what you sent where.",
      ]}
      visual={
        <Reveal>
          <ResumeChangesDemo />
        </Reveal>
      }
    />
  );
}

// ---------------------------------------------------------------- application prep
const READINESS: { label: string; detail: string; state: "ok" | "warning" | "missing" }[] = [
  { label: "Tailored resume", detail: "Approved · Resume_Northwind_FullStack.pdf", state: "ok" },
  { label: "Cover letter", detail: "Professional variant · approved", state: "ok" },
  { label: "Screening answers", detail: "7 of 8 answered", state: "warning" },
  { label: "Salary expectation", detail: "Needs your input", state: "missing" },
];

const STATE_ICON = {
  ok: <CircleCheck className="size-[18px] text-success" />,
  warning: <CircleAlert className="size-[18px] text-warning" />,
  missing: <CircleX className="size-[18px] text-danger" />,
};

function ApplyVisual() {
  return (
    <Reveal>
      <div aria-hidden className="grid gap-3 sm:grid-cols-[1.1fr_1fr]">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-pop">
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-subtle">Application readiness</p>
          <ul className="mt-3 space-y-3">
            {READINESS.map((r) => (
              <li key={r.label} className="flex gap-2.5">
                <span className="mt-0.5">{STATE_ICON[r.state]}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className="block truncate text-caption text-muted">{r.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-pop">
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-subtle">Final preview</p>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              ["Company", "Northwind Labs"],
              ["Position", "Full Stack Developer"],
              ["Resume", "Tailored v3"],
              ["Answers", "7 / 8"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-auto pt-4">
            <span className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-fg opacity-60">
              <Lock className="size-3.5" /> Approve & apply
            </span>
            <p className="mt-2 text-center text-[11px] text-subtle">Resolve 1 item to continue</p>
          </div>
        </div>
      </div>
      <p className="sr-only">
        Example readiness checklist: resume and cover letter ready, screening answers need one more answer, salary expectation
        missing, and an approve button that stays locked until everything is resolved.
      </p>
    </Reveal>
  );
}

export function ApplySection() {
  return (
    <FeatureSplit
      id="apply"
      reverse
      className="bg-surface/50"
      eyebrow="Application preparation"
      title="Walk in prepared. Leave nothing half-done."
      description="Before any application goes out, Applier checks that your documents, answers and details are complete — and shows you a final preview for approval."
      points={[
        "Clear ✅ ready, ⚠️ needs attention and ❌ missing states.",
        "Answers pulled from your profile, marked when they need your confirmation.",
        "You press the final button — always.",
      ]}
      visual={<ApplyVisual />}
    />
  );
}

// ---------------------------------------------------------------- tracking
const BOARD: { title: string; status: ApplicationStatus; items: { role: string; company: string; score: number }[] }[] = [
  {
    title: "Ready",
    status: "ready",
    items: [
      { role: "Python Developer", company: "Borealis Software", score: 81 },
      { role: "IT Support Analyst", company: "Superior Health", score: 76 },
    ],
  },
  {
    title: "Applied",
    status: "applied",
    items: [
      { role: "Full Stack Developer", company: "Northwind Labs", score: 87 },
      { role: "Backend Developer", company: "Maple Analytics", score: 82 },
    ],
  },
  {
    title: "Interview",
    status: "interview",
    items: [{ role: "Junior Developer", company: "Lakeshore Digital", score: 79 }],
  },
  {
    title: "Offer",
    status: "offer",
    items: [{ role: "Systems Administrator", company: "Harbourfront IT", score: 85 }],
  },
];

function TrackingVisual() {
  return (
    <Reveal>
      <div aria-hidden className="-mx-4 overflow-x-auto px-4 pb-2 scrollbar-thin sm:mx-0 sm:px-0">
        <div className="grid min-w-[40rem] grid-cols-4 gap-3">
          {BOARD.map((col) => (
            <div key={col.title} className="rounded-2xl border border-border bg-bg-subtle/70 p-2.5">
              <div className="flex items-center justify-between px-1.5 pb-2">
                <p className="text-xs font-semibold">{col.title}</p>
                <span className="tabular rounded-full bg-surface px-1.5 text-[11px] text-subtle">{col.items.length}</span>
              </div>
              <div className="space-y-2">
                {col.items.map((it) => (
                  <div key={it.role} className="rounded-xl border border-border bg-surface p-3 shadow-card">
                    <p className="truncate text-sm font-medium">{it.role}</p>
                    <p className="truncate text-caption text-muted">{it.company}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <StatusBadge status={col.status} size="xs" />
                      <span className="tabular text-caption font-semibold text-muted">{it.score}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">Example application pipeline board with Ready, Applied, Interview and Offer columns.</p>
    </Reveal>
  );
}

export function TrackingSection() {
  return (
    <FeatureSplit
      id="tracking"
      eyebrow="Application tracking"
      title="Your whole pipeline, always up to date"
      description="Drag applications between stages, see what needs attention today, and let Applier remind you when it's time to follow up."
      points={[
        "Kanban board from discovered to offer.",
        "Follow-up reminders with drafted, editable messages.",
        "Analytics on what's working — by source, role and resume.",
      ]}
      visual={<TrackingVisual />}
    />
  );
}

// ---------------------------------------------------------------- interview
function InterviewVisual() {
  return (
    <Reveal>
      <MockWindow title="Interview prep · Lakeshore Digital" badge={<Badge tone="warning" size="xs">Tomorrow</Badge>}>
        <div aria-hidden>
          <div className="flex items-center gap-3 rounded-xl bg-bg-subtle p-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-warning-soft text-warning">
              <CalendarClock className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Technical interview · Junior Developer</p>
              <p className="text-caption text-muted">Tue 10:00 AM · 45 min · Video call</p>
            </div>
          </div>
          <p className="mt-4 text-caption font-semibold uppercase tracking-[0.12em] text-subtle">Topics to review</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["REST API design", "SQL joins", "React state", "Git workflow", "Testing basics"].map((t) => (
              <span key={t} className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-fg">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-border p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <MessageSquareQuote className="size-3.5 text-primary" /> Likely question
            </p>
            <p className="mt-1 text-sm font-medium">&ldquo;Tell me about a time you debugged a production issue.&rdquo;</p>
            <p className="mt-2 text-caption text-muted">
              Suggested STAR story: <span className="font-medium text-text">Payment webhook outage</span> — from your
              capstone project.
            </p>
          </div>
        </div>
        <p className="sr-only">Example interview prep plan with topics, a likely question and a suggested story from your experience.</p>
      </MockWindow>
    </Reveal>
  );
}

export function InterviewSection() {
  return (
    <FeatureSplit
      id="interview"
      reverse
      className="bg-surface/50"
      eyebrow="Interview preparation"
      title="Show up confident, with a plan built from your experience"
      description="When an interview is scheduled, Applier researches the company and builds a prep plan: likely questions, technical topics and STAR stories drawn from your real work."
      points={[
        "Behavioral and technical questions tailored to the role.",
        "Practice answers and get structured feedback.",
        "Smart questions to ask the interviewer.",
      ]}
      visual={<InterviewVisual />}
    />
  );
}

export function FeatureSections() {
  return (
    <div id="features" className={cn("scroll-mt-20")}>
      <DiscoverySection />
      <AnalysisSection />
      <ResumeSection />
      <ApplySection />
      <TrackingSection />
      <InterviewSection />
    </div>
  );
}
