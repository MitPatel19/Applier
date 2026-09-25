"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Bot, CalendarClock, CircleStop, Clock, Hand, Radar, Sparkles, Timer } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useCancelAgentTask } from "@/lib/queries/agent";
import type { AgentStatus, AgentTask } from "@/lib/types";
import { cn, formatDateTime, parseDate, relativeTime, titleCase } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { ProgressBar } from "@/components/ui/score";
import { AgentStepList } from "@/components/app/agent-progress";
import { RunAgentButton, taskProgress } from "./run-agent";

export const TASK_STATUS: Record<AgentTask["status"], { label: string; tone: BadgeTone }> = {
  queued: { label: "Queued", tone: "info" },
  running: { label: "Running", tone: "primary" },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Needs attention", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const TRIGGER_LABEL: Record<AgentTask["trigger"], string> = {
  user: "Started by you",
  schedule: "Scheduled run",
  system: "Started automatically",
};

export const FREQUENCY_LABEL: Record<string, string> = {
  manual: "Only when you ask",
  daily: "Once a day",
  several_daily: "Several times a day",
};

/** "2m 14s" between two timestamps (or until now for a run in progress). */
export function formatDuration(start: string | null, end: string | null) {
  const s = parseDate(start);
  if (!s) return "—";
  const e = parseDate(end) ?? new Date();
  const secs = Math.max(0, Math.round((e.getTime() - s.getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ${secs % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Numeric results of a task ("found: 140", "strong: 8") as friendly label/value pairs. */
export function taskResultEntries(task: AgentTask) {
  return Object.entries(task.result ?? {})
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => ({ key: k, label: titleCase(k), value: v as number }));
}

export function TaskStatusBadge({ status, size }: { status: AgentTask["status"]; size?: "xs" | "sm" }) {
  const s = TASK_STATUS[status];
  return (
    <Badge tone={s.tone} size={size} dot>
      {status === "running" && <span className="sr-only">Currently </span>}
      {s.label}
    </Badge>
  );
}

/** The centerpiece of the Career Agent page: the current (or most recent) run as a live timeline. */
export function AgentRunHero({ status }: { status: AgentStatus }) {
  const task = status.running ?? status.last;
  const cancel = useCancelAgentTask();
  const isLive = !!status.running;

  if (!task) {
    return (
      <EmptyState
        icon={<Bot />}
        title="Your agent hasn't run yet"
        description="Run it once and it will search your connected sources, merge duplicate postings, and score every job against your profile — step by step, right here."
        action={<RunAgentButton label="Run your first search" />}
        secondaryAction={
          <Button asChild variant="secondary">
            <Link href="/jobs/search">Build a custom search</Link>
          </Button>
        }
      />
    );
  }

  const { percent, finished, total } = taskProgress(task);
  const results = taskResultEntries(task);

  return (
    <Card className="relative overflow-hidden">
      <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 h-48 opacity-90" aria-hidden />
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-48 opacity-50" aria-hidden />
      <div className="relative p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className={cn(
                "relative flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-glow",
                isLive ? "bg-gradient-brand" : "bg-gradient-brand opacity-90",
              )}
            >
              {isLive ? <Radar className="size-6" /> : <Bot className="size-6" />}
              {isLive && (
                <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-surface bg-success animate-pulse-dot" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <Eyebrow>{isLive ? "Happening now" : "Last run"}</Eyebrow>
              <h2 className="mt-1 text-h2 font-semibold">{task.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
                <TaskStatusBadge status={task.status} />
                <span className="inline-flex items-center gap-1.5">
                  <Hand className="size-3.5 text-subtle" aria-hidden />
                  {TRIGGER_LABEL[task.trigger]}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5 text-subtle" aria-hidden />
                  <time dateTime={task.started_at ?? task.created_at} title={formatDateTime(task.started_at ?? task.created_at)}>
                    {relativeTime(task.started_at ?? task.created_at)}
                  </time>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="size-3.5 text-subtle" aria-hidden />
                  {formatDuration(task.started_at, task.finished_at)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isLive ? (
              <Button
                variant="secondary"
                loading={cancel.isPending}
                onClick={() =>
                  cancel.mutate(task.id, {
                    onSuccess: () => toast.success("Run stopped", { description: "Jobs found so far are kept. You can run the agent again any time." }),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                <CircleStop /> Stop run
              </Button>
            ) : (
              <RunAgentButton label="Run now" />
            )}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-caption text-subtle">
            <span>
              {finished} of {total} steps
            </span>
            <span className="tabular">{percent}%</span>
          </div>
          <ProgressBar value={percent} label="Run progress" />
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-surface/80 p-4 sm:p-5">
          <AgentStepList steps={task.steps} className="[&_li]:py-2 [&_p:first-child]:text-[15px]" />
        </div>

        {task.status === "failed" && (
          <Callout tone="warning" className="mt-4" title="Part of this run didn't finish">
            {task.error ?? "One of the sources didn't respond."} Anything found before that point was kept. Try again in a few
            minutes, or check your connections in Settings.
          </Callout>
        )}

        {results.length > 0 && !isLive && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {results.slice(0, 4).map((r) => (
              <div key={r.key} className="rounded-xl border border-border bg-surface px-4 py-3">
                <p className="tabular text-xl font-semibold">{r.value}</p>
                <p className="text-caption text-subtle">{r.label}</p>
              </div>
            ))}
          </div>
        )}

        {!isLive && task.status === "completed" && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary-soft/40 px-4 py-3">
            <p className="flex items-center gap-2 text-sm">
              <Sparkles className="size-4 text-primary" aria-hidden />
              <span>
                <span className="font-medium">What&apos;s next:</span> <span className="text-muted">review the recommended jobs and pick what to prepare.</span>
              </span>
            </p>
            <Button asChild size="sm" variant="soft">
              <Link href="/jobs/recommended">
                Review matches <ArrowRight />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Next scheduled run + frequency, used on the agent page and dashboard. */
export function AgentSchedule({ status, className }: { status: AgentStatus; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <CalendarClock className="size-4" />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-medium">
          {status.next_scheduled_run ? (
            <>
              Next run{" "}
              <time dateTime={status.next_scheduled_run} title={formatDateTime(status.next_scheduled_run)}>
                {relativeTime(status.next_scheduled_run)}
              </time>
            </>
          ) : (
            "No run scheduled"
          )}
        </p>
        <p className="text-muted">{FREQUENCY_LABEL[status.search_frequency] ?? titleCase(status.search_frequency)}</p>
      </div>
    </div>
  );
}
