"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Play, Radar } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useAgentStatus } from "@/lib/queries/core";
import { useRunAgent } from "@/lib/queries/agent";
import type { AgentTask } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/score";

/** Share of an agent task's steps that are finished (done / skipped / failed). */
export function taskProgress(task: Pick<AgentTask, "steps">) {
  const total = task.steps.length || 1;
  const finished = task.steps.filter((s) => s.status === "done" || s.status === "skipped" || s.status === "failed").length;
  return { finished, total, percent: Math.round((finished / total) * 100) };
}

/** "Run agent now" — starts a search built from the user's preferences, with clear feedback. */
export function RunAgentButton({
  label = "Run agent now",
  className,
  variant = "gradient",
  size = "md",
}: {
  label?: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const status = useAgentStatus();
  const run = useRunAgent();
  const running = !!status.data?.running;
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      loading={run.isPending}
      disabled={running}
      onClick={() =>
        run.mutate("search", {
          onSuccess: () =>
            toast.success("Your Career Agent is searching", {
              description:
                "It's checking your sources, removing duplicates and scoring every job against your profile. New matches will appear automatically — nothing is submitted without you.",
            }),
          onError: (e) => toast.error("The agent couldn't start", { description: errorMessage(e) }),
        })
      }
    >
      {running ? <Radar className="animate-pulse" /> : <Play />}
      {running ? "Agent is running…" : label}
    </Button>
  );
}

/**
 * Refreshes job lists, the dashboard and agent history when a running agent task finishes, so
 * fresh results appear without a reload. Mount once per page.
 */
export function useAgentFinishRefresh({ notify = true }: { notify?: boolean } = {}) {
  const { data } = useAgentStatus();
  const qc = useQueryClient();
  const lastRunningId = React.useRef<number | null>(null);
  const running = data?.running ?? null;

  React.useEffect(() => {
    if (running) {
      lastRunningId.current = running.id;
      return;
    }
    if (lastRunningId.current !== null && data) {
      lastRunningId.current = null;
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["agent", "tasks"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      if (notify) toast.success("Search finished", { description: "Your jobs have been refreshed with the newest matches." });
    }
  }, [running, data, qc, notify]);

  return running;
}

/** Compact live banner shown while the agent is working (also refreshes lists when it finishes). */
export function AgentRunningBanner({ className }: { className?: string }) {
  const running = useAgentFinishRefresh();

  if (!running) return null;
  const { finished, total, percent } = taskProgress(running);
  const current = running.steps.find((s) => s.status === "running");
  return (
    <div
      className={cn("relative overflow-hidden rounded-xl border border-primary/25 bg-primary-soft/50 px-4 py-3 animate-rise", className)}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="relative flex size-8 items-center justify-center rounded-lg bg-gradient-brand text-white shadow-glow">
          <Radar className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Your agent is working · step {Math.min(finished + 1, total)} of {total}
          </p>
          <p className="truncate text-sm text-muted">{current ? `${current.label}…` : "Wrapping up…"}</p>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link href="/agent">
            Watch live <ArrowRight />
          </Link>
        </Button>
      </div>
      <ProgressBar value={percent} size="sm" className="mt-3" label="Agent progress" />
    </div>
  );
}
