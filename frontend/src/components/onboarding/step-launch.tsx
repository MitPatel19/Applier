"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Briefcase, CircleCheck, MapPin, Radar, RotateCw, ShieldCheck } from "lucide-react";
import { AgentTaskProgress } from "@/components/app/agent-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api";
import { useAgentStatus, usePreferences } from "@/lib/queries/core";
import { useCompleteOnboarding, useStartFirstSearch } from "@/lib/queries/onboarding";
import type { AgentTask } from "@/lib/types";
import { cn, titleCase } from "@/lib/utils";
import { StepFooter, StepHeader } from "./step-shell";
import { clearOnboardingSession, readSession, writeSession, type StepProps } from "./steps";

const RESULT_LABELS: Record<string, string> = {
  found: "Jobs found",
  total_found: "Jobs found",
  new: "New jobs",
  unique: "Unique jobs",
  merged_duplicates: "Duplicates merged",
  duplicates: "Duplicates merged",
  analyzed: "Jobs analyzed",
  scored: "Jobs scored",
  strong: "Strong matches",
  strong_matches: "Strong matches",
  good: "Good matches",
  recommended: "Recommended",
};

function summarize(task: AgentTask): { label: string; value: number }[] {
  const fromResult = Object.entries(task.result ?? {})
    .filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]))
    .map(([k, v]) => ({ label: RESULT_LABELS[k] ?? titleCase(k), value: v }));
  if (fromResult.length) return fromResult.slice(0, 4);
  return task.steps
    .filter((s) => typeof s.count === "number")
    .map((s) => ({ label: s.label, value: s.count as number }))
    .slice(-4);
}

function Summary({ task }: { task: AgentTask }) {
  const stats = summarize(task);
  if (!stats.length) return null;
  return (
    <dl className={cn("grid gap-3", stats.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : stats.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-border bg-surface p-4 text-center shadow-card">
          <dd className="tabular text-2xl font-semibold tracking-tight sm:text-3xl">{s.value}</dd>
          <dt className="mt-1 text-caption text-muted">{s.label}</dt>
        </div>
      ))}
    </dl>
  );
}

export function StepLaunch({ onBack }: StepProps) {
  const router = useRouter();
  const start = useStartFirstSearch();
  const complete = useCompleteOnboarding();
  const { data: prefs } = usePreferences();
  const { data: status } = useAgentStatus();

  const [taskId, setTaskIdState] = React.useState<number | null>(() => {
    const v = Number(readSession("task"));
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  const [finished, setFinished] = React.useState<AgentTask | null>(null);

  const setTaskId = (id: number | null) => {
    setTaskIdState(id);
    writeSession("task", id ? String(id) : null);
  };

  const run = () => {
    setFinished(null);
    start.mutate(undefined, {
      onSuccess: (task) => setTaskId(task.id),
      onError: (err) => toast.error(errorMessage(err, "We couldn't start the search. Please try again.")),
    });
  };

  const finish = () =>
    complete.mutate(undefined, {
      onSuccess: () => {
        clearOnboardingSession();
        router.push("/dashboard");
      },
      onError: (err) => toast.error(errorMessage(err, "We couldn't finish setup. Please try again.")),
    });

  const onDone = React.useCallback((task: AgentTask) => setFinished(task), []);

  const running = !!taskId && !finished;
  const succeeded = finished?.status === "completed";
  const failed = finished && finished.status !== "completed";

  const roles = prefs?.target_roles ?? [];
  const locations = prefs?.target_locations ?? [];
  const sources = status?.sources ?? [];

  return (
    <div>
      <StepHeader
        eyebrow="Step 6 · Start searching"
        title={succeeded ? "Your first search is done." : running ? "Your agent is on it." : "Ready for your first search?"}
        description={
          succeeded
            ? "Here's what your agent found. Every job is scored and waiting for you on the dashboard."
            : "Your agent will search every source, remove duplicates and score each job against your profile. It won't apply to anything."
        }
      />

      <div className="relative isolate overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-pop sm:p-8">
        <div className="bg-aurora pointer-events-none absolute inset-0 -z-10 opacity-70" aria-hidden />
        <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-60" aria-hidden />

        <div className="flex items-center gap-3">
          <span
            className={cn(
              "relative flex size-12 items-center justify-center rounded-2xl",
              failed ? "bg-warning-soft text-warning" : "bg-gradient-brand text-white shadow-glow",
            )}
          >
            {running && <span className="absolute inset-0 animate-ping rounded-2xl bg-primary/30 motion-reduce:hidden" aria-hidden />}
            {succeeded ? (
              <CircleCheck className="relative size-6" aria-hidden />
            ) : failed ? (
              <AlertTriangle className="relative size-6" aria-hidden />
            ) : (
              <Radar className="relative size-6" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Career Agent</p>
            <p className="text-sm text-muted">
              {succeeded ? "Search complete" : failed ? "The search didn't finish" : running ? "Searching now — this usually takes under a minute" : "Standing by"}
            </p>
          </div>
          {running && (
            <Badge tone="primary" dot className="ml-auto">
              Live
            </Badge>
          )}
        </div>

        <div className="mt-6">
          {taskId ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-surface/90 p-4 sm:p-5">
                <AgentTaskProgress key={taskId} taskId={taskId} onDone={onDone} />
              </div>
              {succeeded && finished && <Summary task={finished} />}
              {failed && (
                <Callout
                  tone="warning"
                  icon={<AlertTriangle />}
                  title="Some sources couldn't be searched"
                  action={
                    <Button size="sm" variant="secondary" onClick={run} loading={start.isPending}>
                      <RotateCw /> Try again
                    </Button>
                  }
                >
                  {finished?.error || "You can retry now, or head to your dashboard and run a search from there anytime."}
                </Callout>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface/90 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Briefcase className="size-4 text-primary" aria-hidden /> Searching for
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {roles.length ? (
                    roles.slice(0, 6).map((r) => (
                      <Badge key={r} tone="primary">
                        {r}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted">Roles based on your profile</p>
                  )}
                </div>
                <p className="mt-4 flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="size-4 text-primary" aria-hidden /> In
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {locations.length ? (
                    locations.slice(0, 6).map((l) => <Badge key={l}>{l}</Badge>)
                  ) : (
                    <p className="text-sm text-muted">Anywhere that matches your preferences</p>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-surface/90 p-4">
                <p className="text-sm font-semibold">Sources</p>
                <ul className="mt-2.5 space-y-2">
                  {(sources.length
                    ? sources.map((s) => ({ key: s.key, label: s.label, note: s.status === "ready" ? "Ready" : s.status === "demo" ? "Sample data" : s.status === "not_connected" ? "Public listings" : "Unavailable" }))
                    : [
                        { key: "linkedin", label: "LinkedIn", note: "" },
                        { key: "indeed", label: "Indeed", note: "" },
                        { key: "company_sites", label: "Employer career pages", note: "" },
                      ]
                  ).map((s) => (
                    <li key={s.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <CircleCheck className="size-4 text-success" aria-hidden /> {s.label}
                      </span>
                      {s.note && <span className="text-caption text-subtle">{s.note}</span>}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex items-start gap-2 rounded-lg bg-success-soft/50 px-3 py-2 text-caption text-muted">
                  <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
                  Searching never applies to anything. You review every job first.
                </p>
              </div>
            </div>
          )}
        </div>

        {!taskId && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button variant="gradient" size="lg" onClick={run} loading={start.isPending} className="w-full sm:w-auto">
              {!start.isPending && <Radar />}
              {start.isPending ? "Starting your agent…" : "Start my first search"}
            </Button>
          </div>
        )}
      </div>

      <StepFooter
        onBack={running ? undefined : onBack}
        primary={
          taskId ? (
            <Button size="lg" onClick={finish} loading={complete.isPending} className="w-full sm:w-auto" variant={succeeded || failed ? "primary" : "secondary"}>
              {running ? "Continue to dashboard — it'll keep working" : "Go to my dashboard"}
              {!complete.isPending && <ArrowRight />}
            </Button>
          ) : (
            <Button size="lg" variant="ghost" onClick={finish} loading={complete.isPending} className="w-full text-muted sm:w-auto">
              Skip — go to my dashboard
            </Button>
          )
        }
      />
    </div>
  );
}
