"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Bot, Radar, Sparkles } from "lucide-react";
import { useAgentStatus } from "@/lib/queries/core";
import type { Dashboard } from "@/lib/types";
import { cn, greeting, relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Eyebrow } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import { ProgressBar } from "@/components/ui/score";
import { AgentStepList } from "@/components/app/agent-progress";
import { RunAgentButton, taskProgress, useAgentFinishRefresh } from "@/components/agent/run-agent";
import { AgentSchedule, taskResultEntries, TaskStatusBadge } from "@/components/agent/agent-run";

const AGENT_STATE: Record<Dashboard["agent_status"], { label: string; dot: string }> = {
  ready: { label: "Ready", dot: "bg-success" },
  searching: { label: "Searching", dot: "bg-primary animate-pulse-dot" },
  idle: { label: "Idle", dot: "bg-border-strong" },
};

export function DashboardHero({ data }: { data: Dashboard }) {
  const state = AGENT_STATE[data.agent_status] ?? AGENT_STATE.idle;
  const strong = data.job_search.strong;
  return (
    <section
      aria-labelledby="dash-greeting"
      className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
    >
      <div className="bg-aurora pointer-events-none absolute inset-0" aria-hidden />
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative px-5 py-6 sm:px-8 sm:py-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 text-caption font-medium text-muted backdrop-blur">
          <span className={cn("size-2 rounded-full", state.dot)} aria-hidden />
          Career Agent · {state.label}
        </div>
        <h1 id="dash-greeting" className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-4xl">
          {greeting()}, <span className="text-gradient">{data.greeting_name}</span>{" "}
          <span aria-hidden>👋</span>
        </h1>
        <p className="mt-2 max-w-xl text-base text-muted sm:text-lg" aria-live="polite">
          {data.agent_message}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {strong > 0 ? (
            <Button asChild variant="gradient">
              <Link href="/jobs/recommended">
                <Sparkles /> Review {strong} strong {strong === 1 ? "match" : "matches"}
              </Link>
            </Button>
          ) : (
            <RunAgentButton />
          )}
          {strong > 0 ? (
            <RunAgentButton variant="secondary" />
          ) : (
            <Button asChild variant="secondary">
              <Link href="/jobs/search">Build a custom search</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

/** Live agent status: running steps while searching, otherwise the last run's summary. */
export function AgentStatusCard() {
  const { data, isLoading } = useAgentStatus();
  useAgentFinishRefresh();
  if (isLoading) {
    return (
      <Card className="p-5" aria-hidden>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-5 w-40" />
        <div className="mt-5 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </Card>
    );
  }
  if (!data) return null;
  const running = data.running;
  const last = data.last;
  return (
    <Card className={cn("relative overflow-hidden", running && "shadow-glow")}>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow">
              {running ? <Radar className="size-5" aria-hidden /> : <Bot className="size-5" aria-hidden />}
            </span>
            <div>
              <Eyebrow>Agent status</Eyebrow>
              <p className="mt-0.5 font-semibold">{running ? "Searching for you now" : last ? "Standing by" : "Ready for its first run"}</p>
            </div>
          </div>
          <Link href="/agent" className="text-sm font-medium text-primary hover:underline">
            Details
          </Link>
        </div>

        {running ? (
          <div className="mt-4">
            <ProgressBar value={taskProgress(running).percent} size="sm" label="Agent progress" />
            <AgentStepList steps={running.steps} className="mt-4" />
          </div>
        ) : last ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <TaskStatusBadge status={last.status} size="xs" />
              <span>Last run {relativeTime(last.finished_at ?? last.started_at ?? last.created_at)}</span>
            </div>
            {taskResultEntries(last).length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {taskResultEntries(last)
                  .slice(0, 3)
                  .map((r) => (
                    <div key={r.key} className="rounded-lg bg-bg-subtle px-3 py-2">
                      <p className="tabular text-lg font-semibold leading-tight">{r.value}</p>
                      <p className="truncate text-caption text-subtle">{r.label}</p>
                    </div>
                  ))}
              </div>
            )}
            <AgentSchedule status={data} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Run your agent to search LinkedIn, Indeed and employer websites, merge duplicates, and score every job for you.
          </p>
        )}

        {!running && (
          <div className="mt-5 flex gap-2">
            <RunAgentButton className="flex-1" variant={last ? "secondary" : "gradient"} />
            <Button asChild variant="ghost" size="icon" aria-label="Open Career Agent">
              <Link href="/agent">
                <ArrowRight />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
