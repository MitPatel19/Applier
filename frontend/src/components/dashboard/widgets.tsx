"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  FlaskConical,
  Rocket,
  Sparkles,
  UserRound,
} from "lucide-react";
import { INTERVIEW_KIND_LABELS, SOURCE_LABELS, STATUS_TONE } from "@/lib/constants";
import type { ApplicationStatus, Dashboard, DashboardAction, DashboardJob } from "@/lib/types";
import { cn, daysUntil, formatDate, formatTime, parseDate, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Eyebrow } from "@/components/ui/card";
import { ProgressBar, ScoreRing } from "@/components/ui/score";
import { TierBadge } from "@/components/app/status";

// ------------------------------------------------------------------ helpers

export function dashboardSourceLabel(sources: string[]) {
  const labels = Array.from(new Set(sources.map((s) => SOURCE_LABELS[s] ?? s)));
  return labels.join(" + ");
}

function Stagger({ i, className, children }: { i: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("animate-rise", className)} style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
      {children}
    </div>
  );
}

function ViewAll({ href, label = "View all" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      {label} <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

function DeadlineText({ deadline }: { deadline: string | null }) {
  const d = daysUntil(deadline);
  if (d === null || d < 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-1", d <= 3 ? "font-medium text-warning" : "text-muted")}>
      <CalendarClock className="size-3.5" aria-hidden />
      {d === 0 ? "Closes today" : d === 1 ? "Closes tomorrow" : `Closes in ${d} days`}
    </span>
  );
}

// ------------------------------------------------------------------ stat groups

export interface StatItem {
  label: string;
  value: number;
  href: string;
  hint?: string;
  emphasis?: boolean;
}

export function StatGroup({ eyebrow, icon, items }: { eyebrow: string; icon: React.ReactNode; items: StatItem[] }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="text-subtle [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((it) => (
          <Link
            key={it.label}
            href={it.href}
            className="group rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-bg-subtle"
          >
            <span
              className={cn(
                "block",
                "tabular text-2xl font-semibold tracking-tight sm:text-[1.75rem]",
                it.emphasis && it.value > 0 && "text-gradient",
              )}
            >
              {it.value}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-sm text-muted group-hover:text-text">
              {it.label}
              <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ action required

const PRIORITY: Record<DashboardAction["priority"], { label: string; bar: string; icon: string }> = {
  high: { label: "High priority", bar: "bg-danger", icon: "bg-danger-soft text-danger" },
  normal: { label: "", bar: "bg-primary", icon: "bg-primary-soft text-primary-soft-fg" },
  low: { label: "", bar: "bg-border-strong", icon: "bg-bg-subtle text-muted" },
};

export function ActionRequired({ actions }: { actions: Dashboard["actions"] }) {
  const sorted = [...actions].sort((a, b) => ["high", "normal", "low"].indexOf(a.priority) - ["high", "normal", "low"].indexOf(b.priority));
  return (
    <Card>
      <CardHeader className="pb-2">
        <div>
          <Eyebrow>Action required</Eyebrow>
          <CardTitle className="mt-1">
            {sorted.length ? `${sorted.length} ${sorted.length === 1 ? "thing needs" : "things need"} you` : "You're all caught up"}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-success-soft/60 px-4 py-3 text-sm text-muted">
            <CheckCircle2 className="size-4 text-success" aria-hidden />
            Nothing is waiting on you. Your agent will let you know when something needs a decision.
          </p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((a, i) => {
              const p = PRIORITY[a.priority];
              return (
                <li key={a.key}>
                  <Stagger i={i}>
                    <Link
                      href={a.link}
                      className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-border-strong hover:shadow-card"
                    >
                      <span className={cn("absolute inset-y-0 left-0 w-[3px]", p.bar)} aria-hidden />
                      <span className={cn("tabular flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold", p.icon)}>
                        {a.count}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{a.label}</span>
                        {p.label && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-caption font-medium text-danger">
                            <CircleAlert className="size-3" aria-hidden /> {p.label}
                          </span>
                        )}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-text" aria-hidden />
                    </Link>
                  </Stagger>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ opportunities

export function OpportunityCard({ job, index = 0 }: { job: DashboardJob; index?: number }) {
  return (
    <Stagger i={index} className="h-full">
      <article className="group relative flex h-full flex-col rounded-xl border border-border bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop sm:p-5">
        <div className="flex items-start gap-4">
          <ScoreRing score={job.match} size={58} stroke={5} />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-snug">
              <Link href={`/jobs/${job.id}`} className="after:absolute after:inset-0 hover:text-primary focus-visible:outline-none">
                {job.title}
              </Link>
            </h3>
            <p className="mt-0.5 truncate text-sm text-muted">
              {job.company_name}
              {job.location && <span className="text-subtle"> · {job.location}</span>}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {job.tier && <TierBadge tier={job.tier} size="xs" />}
              {job.is_saved && (
                <Badge tone="outline" size="xs">
                  <Bookmark className="size-3" aria-hidden /> Saved
                </Badge>
              )}
            </div>
          </div>
        </div>
        {job.recommendation && (
          <p className="mt-3 flex flex-1 items-start gap-2 text-sm text-muted">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="line-clamp-3">{job.recommendation}</span>
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-caption">
          {job.sources.length > 0 ? (
            <span className="text-subtle">
              Found on <span className="font-medium text-text">{dashboardSourceLabel(job.sources)}</span>
            </span>
          ) : (
            <span />
          )}
          <DeadlineText deadline={job.deadline} />
        </div>
      </article>
    </Stagger>
  );
}

export function CompactJobList({ jobs, empty, showDeadline }: { jobs: DashboardJob[]; empty: string; showDeadline?: boolean }) {
  if (!jobs.length) return <p className="rounded-xl bg-bg-subtle px-4 py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {jobs.map((j) => (
        <li key={j.id}>
          <Link href={`/jobs/${j.id}`} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-bg-subtle">
            <ScoreRing score={j.match} size={36} stroke={3.5} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium group-hover:text-primary">{j.title}</span>
              <span className="block truncate text-caption text-muted">
                {j.company_name}
                {j.location && ` · ${j.location}`}
              </span>
            </span>
            {showDeadline ? (
              <span className="shrink-0 text-caption">
                <DeadlineText deadline={j.deadline} />
              </span>
            ) : (
              j.tier && <TierBadge tier={j.tier} size="xs" />
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ ready to apply

export function ReadyToApply({ items, className }: { items: Dashboard["ready_to_apply"]; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div>
          <Eyebrow>Ready to apply</Eyebrow>
          <CardTitle className="mt-1">Waiting for your approval</CardTitle>
        </div>
        {items.length > 0 && <Badge tone="primary">{items.length}</Badge>}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing prepared yet. Open a job you like and choose <span className="font-medium text-text">Prepare Application</span> —
            your agent drafts everything for your review.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <li key={a.application_id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                <ScoreRing score={a.match} size={36} stroke={3.5} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="truncate text-caption text-muted">{a.company}</p>
                </div>
                <Button asChild size="xs" variant="soft">
                  <Link href={`/applications/${a.application_id}/prepare`} aria-label={`Review ${a.title} at ${a.company}`}>
                    Review <ArrowRight />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ interviews

export function UpcomingInterviews({ items, className }: { items: Dashboard["upcoming_interviews"]; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div>
          <Eyebrow>Upcoming interviews</Eyebrow>
          <CardTitle className="mt-1">{items.length ? "Get ready" : "No interviews scheduled"}</CardTitle>
        </div>
        {items.length > 0 && <ViewAll href="/interviews" />}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted">When an application moves to an interview, your prep kit will appear here automatically.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((iv) => {
              const d = parseDate(iv.scheduled_at);
              return (
                <li key={iv.interview_id}>
                  <Link
                    href={`/interviews/${iv.interview_id}`}
                    className="group flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-bg-subtle"
                  >
                    <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-warning-soft py-1.5 text-warning">
                      <span className="text-[10px] font-semibold uppercase tracking-wider">
                        {d ? d.toLocaleDateString(undefined, { month: "short" }) : "—"}
                      </span>
                      <span className="tabular text-lg font-semibold leading-none">{d ? d.getDate() : "?"}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium group-hover:text-primary">{iv.title}</span>
                      <span className="block truncate text-caption text-muted">
                        {iv.company} · {INTERVIEW_KIND_LABELS[iv.kind] ?? "Interview"}
                      </span>
                      <span className="block text-caption text-subtle">
                        {formatTime(iv.scheduled_at)} · {relativeTime(iv.scheduled_at)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ follow-ups

export function FollowUpsDue({ items }: { items: Dashboard["follow_ups_due"] }) {
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div>
          <Eyebrow>Follow-ups due</Eyebrow>
          <CardTitle className="mt-1">Keep the conversation going</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((f) => {
            const overdue = (daysUntil(f.due_at) ?? 0) < 0;
            return (
              <li key={f.follow_up_id}>
                <Link
                  href={f.application_id ? `/applications/${f.application_id}` : "/networking"}
                  className="group flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-bg-subtle"
                >
                  <ClipboardCheck className="size-4 shrink-0 text-subtle" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {f.title ?? "Follow-up"}
                      {f.company && <span className="font-normal text-muted"> · {f.company}</span>}
                    </span>
                    <span className={cn("block text-caption", overdue ? "font-medium text-danger" : "text-subtle")}>
                      {overdue ? `Overdue — was due ${formatDate(f.due_at, { year: undefined })}` : `Due ${relativeTime(f.due_at)}`}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-subtle" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ pipeline

const STAGES: { label: string; statuses: ApplicationStatus[]; color: string }[] = [
  { label: "Reviewing", statuses: ["saved", "reviewing"], color: "var(--info)" },
  { label: "Ready", statuses: ["ready"], color: "var(--primary)" },
  { label: "Applied", statuses: ["applied", "confirmed", "recruiter_contacted"], color: "var(--accent)" },
  { label: "Interviewing", statuses: ["interview", "technical_interview", "final_interview"], color: "var(--warning)" },
  { label: "Offers", statuses: ["offer"], color: "var(--success)" },
];

export function PipelineMini({ pipeline }: { pipeline: Dashboard["pipeline"] }) {
  const counts = STAGES.map((s) => ({
    ...s,
    count: pipeline.filter((p) => s.statuses.includes(p.status)).reduce((n, p) => n + p.count, 0),
  }));
  const closed = pipeline
    .filter((p) => STATUS_TONE[p.status] === "danger" || p.status === "withdrawn" || p.status === "closed")
    .reduce((n, p) => n + p.count, 0);
  const max = Math.max(1, ...counts.map((c) => c.count));
  const total = counts.reduce((n, c) => n + c.count, 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div>
          <Eyebrow>Pipeline</Eyebrow>
          <CardTitle className="mt-1">{total ? `${total} active ${total === 1 ? "application" : "applications"}` : "No active applications"}</CardTitle>
        </div>
        <ViewAll href="/applications" label="Open board" />
      </CardHeader>
      <CardContent>
        <ol className="space-y-2.5" aria-label="Applications by stage">
          {counts.map((c) => (
            <li key={c.label}>
              <Link href="/applications" className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 rounded-md text-sm hover:text-primary">
                <span className="text-muted">{c.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-border/70" aria-hidden>
                  <span
                    className="block h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${c.count ? Math.max(6, (c.count / max) * 100) : 0}%`, background: c.color }}
                  />
                </span>
                <span className="tabular text-right font-semibold">{c.count}</span>
              </Link>
            </li>
          ))}
        </ol>
        {closed > 0 && <p className="mt-3 text-caption text-subtle">{closed} closed or not selected — kept for your analytics.</p>}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ nudges

export function ProfileNudge({ percent }: { percent: number }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="bg-aurora pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <CardContent className="relative pt-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
            <UserRound className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Your profile is {percent}% complete</p>
            <p className="mt-0.5 text-sm text-muted">
              A fuller profile means more accurate match scores and better tailored resumes — without inventing anything.
            </p>
          </div>
        </div>
        <ProgressBar value={percent} className="mt-4" label="Profile completeness" />
        <Button asChild size="sm" variant="secondary" className="mt-4 w-full">
          <Link href="/profile">
            Complete your profile <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function OnboardingBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-brand p-[1px] shadow-glow animate-rise">
      <div className="relative flex flex-col gap-4 rounded-[15px] bg-surface/95 px-5 py-4 sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white">
          <Rocket className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Finish setting up your Career Agent</p>
          <p className="mt-0.5 text-sm text-muted">
            Upload your resume and tell us what you&apos;re looking for. It takes about 3 minutes and makes every recommendation smarter.
          </p>
        </div>
        <Button asChild variant="gradient">
          <Link href="/onboarding">
            Continue setup <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function DemoDataCallout() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-info/30 bg-info-soft/40 px-4 py-2.5 text-sm text-muted">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
      <p>
        <span className="font-medium text-text">You&apos;re viewing demo data.</span> Some jobs are samples so you can explore safely — connect
        real sources in{" "}
        <Link href="/settings?tab=integrations" className="font-medium text-primary hover:underline">
          Settings
        </Link>
        .
      </p>
    </div>
  );
}
