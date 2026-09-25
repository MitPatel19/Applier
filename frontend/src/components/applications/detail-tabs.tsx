"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bot,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Cog,
  Download,
  FileText,
  Mail,
  MessageSquareText,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { INTERVIEW_KIND_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { ApplicationDetail, ApplicationStatus, AuditEntry } from "@/lib/types";
import { useAudit } from "@/lib/queries/applications";
import { cn, formatDate, formatDateTime, parseDate } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { ScheduleInterviewDialog, kindForStatus } from "@/components/interviews/schedule-interview-dialog";
import { dayLabel, timelineStamp, useNow } from "@/components/interviews/time";

// ---------------------------------------------------------------- timeline
type Actor = "user" | "agent" | "system" | "email";

interface TimelineEvent {
  key: string;
  at: string;
  actor: Actor;
  text: React.ReactNode;
  detail?: string | null;
  status?: ApplicationStatus;
}

const ACTOR: Record<Actor, { label: string; icon: LucideIcon; className: string }> = {
  user: { label: "You", icon: UserRound, className: "bg-primary-soft text-primary-soft-fg" },
  agent: { label: "Agent", icon: Bot, className: "bg-accent-soft text-accent" },
  system: { label: "System", icon: Cog, className: "bg-bg-subtle text-muted" },
  email: { label: "Email", icon: Mail, className: "bg-info-soft text-info" },
};

function isStatusLabel(s: string): s is ApplicationStatus {
  return s in STATUS_LABELS;
}

export function buildTimeline(app: ApplicationDetail, audit: AuditEntry[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const statusTimes = app.status_history.map((h) => parseDate(h.changed_at)?.getTime() ?? 0);
  for (const h of app.status_history) {
    const to = isStatusLabel(h.to_status) ? STATUS_LABELS[h.to_status] : h.to_status;
    const from = h.from_status && isStatusLabel(h.from_status) ? STATUS_LABELS[h.from_status] : h.from_status;
    events.push({
      key: `s${h.id}`,
      at: h.changed_at,
      actor: h.actor,
      status: isStatusLabel(h.to_status) ? h.to_status : undefined,
      text: from ? (
        <>
          Moved from <span className="font-medium">{from}</span> to <span className="font-medium">{to}</span>
        </>
      ) : (
        <>
          Added as <span className="font-medium">{to}</span>
        </>
      ),
      detail: h.note,
    });
  }
  for (const a of audit) {
    const t = parseDate(a.created_at)?.getTime() ?? 0;
    const duplicateOfStatus = /status/i.test(a.action) && statusTimes.some((s) => Math.abs(s - t) < 120_000);
    if (duplicateOfStatus) continue;
    events.push({ key: `a${a.id}`, at: a.created_at, actor: a.actor, text: a.summary });
  }
  return events.sort((x, y) => (parseDate(y.at)?.getTime() ?? 0) - (parseDate(x.at)?.getTime() ?? 0));
}

export function TimelineTab({ app }: { app: ApplicationDetail }) {
  const audit = useAudit("application", app.id);
  const events = React.useMemo(() => buildTimeline(app, audit.data ?? []), [app, audit.data]);
  if (audit.isLoading && !app.status_history.length) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading timeline">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      {audit.error && (
        <ErrorState compact className="mb-4" error={audit.error} title="Some activity couldn't be loaded" onRetry={() => audit.refetch()} />
      )}
      {events.length === 0 ? (
        <EmptyState compact icon={<MessageSquareText />} title="No activity yet" description="Status changes and agent actions will appear here." />
      ) : (
        <ol className="relative space-y-1" aria-label="Application timeline">
          <span aria-hidden className="absolute bottom-3 left-4 top-3 w-px bg-border" />
          {events.map((e, i) => {
            const actor = ACTOR[e.actor] ?? ACTOR.system;
            const Icon = actor.icon;
            return (
              <li key={e.key} className={cn("relative flex gap-3.5 rounded-xl py-2.5 pr-2", i === 0 && "animate-rise")}>
                <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface", actor.className)}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-caption text-subtle">
                    <time dateTime={parseDate(e.at)?.toISOString()}>{timelineStamp(e.at)}</time> · {actor.label}
                  </p>
                  <p className="mt-0.5 text-sm text-text">{e.text}</p>
                  {e.detail && <p className="mt-1 rounded-lg bg-bg-subtle px-2.5 py-1.5 text-sm text-muted">{e.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- documents
const DOC_KIND: Record<string, string> = { resume: "Resume", cover_letter: "Cover letter", other: "Document" };

export function DocumentsTab({ app }: { app: ApplicationDetail }) {
  const hasAny = app.documents.length > 0 || app.resume_version_id || app.cover_letter_id;
  if (!hasAny) {
    return (
      <EmptyState
        compact
        icon={<FileText />}
        title="No documents yet"
        description="When Applier prepares this application, the tailored resume and cover letter will be saved here."
        action={
          app.status === "ready" || app.status === "reviewing" || app.status === "saved" || app.status === "discovered" ? (
            <Button asChild>
              <Link href={`/applications/${app.id}/prepare`}>Prepare application</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      {app.documents.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {app.documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 bg-surface px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
                <FileText className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.file_name}</p>
                <p className="text-caption text-subtle">
                  {DOC_KIND[d.kind] ?? "Document"} · Saved {formatDate(d.created_at)}
                </p>
              </div>
              <Button asChild size="sm" variant="secondary">
                <a href={api.url(`/applications/${app.id}/documents/${d.id}`)} download={d.file_name}>
                  <Download /> <span className="hidden sm:inline">Download</span>
                  <span className="sr-only sm:hidden">Download {d.file_name}</span>
                </a>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {app.resume_version_id && (
          <Link
            href={`/resumes/versions/${app.resume_version_id}`}
            className="group flex items-center gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3 hover:border-border-strong"
          >
            <FileText className="size-4 text-subtle" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Tailored resume</span>
              <span className="block truncate text-caption text-subtle">{app.resume_version?.label ?? app.resume_name ?? "View changes"}</span>
            </span>
            <ChevronRight className="size-4 text-subtle group-hover:text-text" aria-hidden />
          </Link>
        )}
        {app.cover_letter_id && (
          <Link
            href={`/cover-letters/${app.cover_letter_id}`}
            className="group flex items-center gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3 hover:border-border-strong"
          >
            <Mail className="size-4 text-subtle" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Cover letter</span>
              <span className="block truncate text-caption text-subtle">{app.cover_letter?.title ?? "View letter"}</span>
            </span>
            <ChevronRight className="size-4 text-subtle group-hover:text-text" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- answers
const ANSWER_SOURCE: Record<string, { label: string; tone: BadgeTone }> = {
  profile: { label: "From profile", tone: "neutral" },
  generated: { label: "Drafted by Applier", tone: "primary" },
  template: { label: "From template", tone: "info" },
  user: { label: "Written by you", tone: "success" },
};

export function AnswersTab({ app }: { app: ApplicationDetail }) {
  const answers = [...app.answers].sort((a, b) => a.sort_order - b.sort_order);
  const editable = ["discovered", "saved", "reviewing", "ready"].includes(app.status);
  if (!answers.length) {
    return (
      <EmptyState
        compact
        icon={<MessageSquareText />}
        title="No application questions"
        description="Screening questions and your answers appear here once the application is prepared."
      />
    );
  }
  return (
    <div className="space-y-3">
      {editable && (
        <p className="text-sm text-muted">
          These are read-only here.{" "}
          <Link href={`/applications/${app.id}/prepare`} className="font-medium text-primary hover:underline">
            Edit answers in Review & Apply
          </Link>
        </p>
      )}
      <ol className="space-y-2.5">
        {answers.map((a, i) => {
          const src = ANSWER_SOURCE[a.source] ?? ANSWER_SOURCE.profile;
          return (
            <li key={a.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium text-text">
                  <span className="tabular mr-1.5 text-subtle">{i + 1}.</span>
                  {a.question}
                  {a.required && <span className="ml-1 text-danger" aria-label="required">*</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={src.tone} size="xs">
                    {src.label}
                  </Badge>
                  {a.needs_confirmation && !a.confirmed && (
                    <Badge tone="warning" size="xs">
                      Needs confirmation
                    </Badge>
                  )}
                  {a.confirmed && (
                    <Badge tone="success" size="xs">
                      <CheckCircle2 className="size-3" /> Confirmed
                    </Badge>
                  )}
                </div>
              </div>
              <p className={cn("mt-2 whitespace-pre-line text-sm", a.answer ? "text-muted" : "italic text-subtle")}>
                {a.answer || "No answer"}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- interviews
const OUTCOME: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Upcoming", tone: "info" },
  passed: { label: "Passed", tone: "success" },
  failed: { label: "Not advanced", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function InterviewsTab({ app }: { app: ApplicationDetail }) {
  const [open, setOpen] = React.useState(false);
  const now = useNow();
  const items = [...app.interviews].sort(
    (a, b) => (parseDate(a.scheduled_at)?.getTime() ?? Infinity) - (parseDate(b.scheduled_at)?.getTime() ?? Infinity),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Each interview gets its own preparation plan, tailored to this role.</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <CalendarPlus /> Schedule interview
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState compact icon={<CalendarPlus />} title="No interviews yet" description="When you land an interview, schedule it here to unlock your preparation center." />
      ) : (
        <ul className="space-y-2.5">
          {items.map((i) => {
            const d = parseDate(i.scheduled_at);
            const past = d ? d.getTime() < now : false;
            const outcome = i.outcome ? OUTCOME[i.outcome] : null;
            return (
              <li key={i.id}>
                <Link
                  href={`/interviews/${i.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong"
                >
                  <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-bg-subtle py-1.5 text-center">
                    {d ? (
                      <>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
                          {d.toLocaleDateString(undefined, { month: "short" })}
                        </span>
                        <span className="tabular text-lg font-semibold leading-tight">{d.getDate()}</span>
                      </>
                    ) : (
                      <span className="px-1 text-[10px] font-medium text-subtle">TBD</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{INTERVIEW_KIND_LABELS[i.kind] ?? "Interview"}</p>
                    <p className="text-caption text-muted">
                      {d ? `${dayLabel(d, now)} · ${formatDateTime(d)}` : "Date not set yet"}
                    </p>
                  </div>
                  {outcome && !(i.outcome === "pending" && past) && (
                    <Badge tone={outcome.tone} size="xs">
                      {outcome.label}
                    </Badge>
                  )}
                  <span className="hidden text-sm font-medium text-primary group-hover:underline sm:inline">Prepare</span>
                  <ChevronRight className="size-4 text-subtle" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <ScheduleInterviewDialog open={open} onOpenChange={setOpen} applicationId={app.id} defaultKind={kindForStatus(app.status)} />
    </div>
  );
}
