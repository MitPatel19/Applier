"use client";

/** Career Agent hooks: runs, history, settings and audit activity. Keys live under ["agent", ...]. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AgentSettings, AgentTask, AuditEntry } from "@/lib/types";
import { qk } from "./core";

export const agentKeys = {
  tasks: (limit: number) => ["agent", "tasks", limit] as const,
  settings: ["agent", "settings"] as const,
  audit: (limit: number) => ["audit", limit] as const,
};

export function useAgentTasks(limit = 20) {
  return useQuery({
    queryKey: agentKeys.tasks(limit),
    queryFn: () => api.get<AgentTask[]>("/agent/tasks", { limit }),
    refetchInterval: (q) => (q.state.data?.some((t) => t.status === "running" || t.status === "queued") ? 3_000 : 60_000),
  });
}

/** Start a Career Agent run built from the user's saved preferences. */
export function useRunAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: "search" | "analyze" = "search") => api.post<AgentTask>("/agent/run", { kind }),
    onSuccess: (task) => {
      qc.setQueryData(["agent", "task", task.id], task);
      qc.invalidateQueries({ queryKey: qk.agentStatus });
      qc.invalidateQueries({ queryKey: ["agent", "tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCancelAgentTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<AgentTask>(`/agent/tasks/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent"] }),
  });
}

export function useAgentSettings() {
  return useQuery({ queryKey: agentKeys.settings, queryFn: () => api.get<AgentSettings>("/agent/settings") });
}

export function useUpdateAgentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<AgentSettings>) => api.patch<AgentSettings>("/agent/settings", { ...body, auto_submit: false }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: agentKeys.settings });
      const prev = qc.getQueryData<AgentSettings>(agentKeys.settings);
      if (prev) qc.setQueryData<AgentSettings>(agentKeys.settings, { ...prev, ...body, auto_submit: false });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(agentKeys.settings, ctx.prev);
    },
    onSuccess: (data) => {
      qc.setQueryData(agentKeys.settings, data);
      qc.invalidateQueries({ queryKey: qk.agentStatus });
      qc.invalidateQueries({ queryKey: qk.preferences });
    },
  });
}

export function useAudit(limit = 20) {
  return useQuery({
    queryKey: agentKeys.audit(limit),
    queryFn: () => api.get<AuditEntry[]>("/audit", { limit }),
    refetchInterval: 30_000,
  });
}
