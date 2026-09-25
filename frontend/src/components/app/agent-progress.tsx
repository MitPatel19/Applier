"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, CircleDashed, Loader2, MinusCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { AgentStep, AgentTask } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Poll an agent task until it finishes. */
export function useAgentTask(taskId: number | null | undefined) {
  return useQuery({
    queryKey: ["agent", "task", taskId],
    queryFn: () => api.get<AgentTask>(`/agent/tasks/${taskId}`),
    enabled: !!taskId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "completed" || s === "failed" || s === "cancelled" ? false : 1200;
    },
  });
}

function StepIcon({ status }: { status: AgentStep["status"] }) {
  switch (status) {
    case "done":
      return (
        <span className="flex size-6 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      );
    case "running":
      return (
        <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Loader2 className="size-3.5 animate-spin" />
        </span>
      );
    case "failed":
      return (
        <span className="flex size-6 items-center justify-center rounded-full bg-warning-soft text-warning">
          <AlertTriangle className="size-3.5" />
        </span>
      );
    case "skipped":
      return (
        <span className="flex size-6 items-center justify-center rounded-full bg-bg-subtle text-subtle">
          <MinusCircle className="size-3.5" />
        </span>
      );
    default:
      return (
        <span className="flex size-6 items-center justify-center rounded-full text-subtle">
          <CircleDashed className="size-4" />
        </span>
      );
  }
}

/**
 * Step-by-step, human-readable view of what the agent is doing:
 *   ● Searching LinkedIn     ✓ 42 jobs found
 *   ● Removing duplicates    ✓ 82 unique jobs
 */
export function AgentStepList({ steps, className }: { steps: AgentStep[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-1", className)} aria-live="polite">
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 py-1.5">
          {i < steps.length - 1 && (
            <span
              className={cn("absolute left-3 top-8 h-[calc(100%-18px)] w-px", s.status === "done" ? "bg-success/40" : "bg-border")}
              aria-hidden
            />
          )}
          <StepIcon status={s.status} />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className={cn("text-sm font-medium", s.status === "pending" ? "text-subtle" : "text-text")}>
              {s.label}
              {s.status === "running" && <span className="ml-1 text-muted">…</span>}
            </p>
            {s.detail && (
              <p className={cn("mt-0.5 text-sm", s.status === "failed" ? "text-warning" : "text-muted")}>
                {s.status === "done" && "✓ "}
                {s.detail}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AgentTaskProgress({ taskId, onDone, className }: { taskId: number; onDone?: (task: AgentTask) => void; className?: string }) {
  const { data } = useAgentTask(taskId);
  const notified = React.useRef(false);
  React.useEffect(() => {
    if (data && ["completed", "failed", "cancelled"].includes(data.status) && !notified.current) {
      notified.current = true;
      onDone?.(data);
    }
  }, [data, onDone]);
  if (!data) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted", className)}>
        <Loader2 className="size-4 animate-spin" /> Starting the agent…
      </div>
    );
  }
  return <AgentStepList steps={data.steps} className={className} />;
}
