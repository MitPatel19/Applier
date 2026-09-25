"use client";

/** Account connection (OAuth) hooks. Keys live under ["integrations"]. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AgentTask, Integration } from "@/lib/types";
import { qk } from "./core";

export const integrationKeys = { all: ["integrations"] as const };

export function useIntegrations() {
  return useQuery({ queryKey: integrationKeys.all, queryFn: () => api.get<Integration[]>("/integrations") });
}

/** Starts the OAuth flow. Resolves with the provider's authorize URL; the caller navigates to it. */
export function useConnectIntegration() {
  return useMutation({
    mutationFn: (provider: string) => api.post<{ authorize_url: string }>(`/integrations/${provider}/connect`),
  });
}

export function useDisconnectIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) => api.post<Integration>(`/integrations/${provider}/disconnect`),
    onSuccess: (updated) => {
      qc.setQueryData<Integration[]>(integrationKeys.all, (prev) =>
        prev?.map((i) => (i.provider === updated.provider ? updated : i)),
      );
      qc.invalidateQueries({ queryKey: integrationKeys.all });
      qc.invalidateQueries({ queryKey: qk.agentStatus });
    },
  });
}

export function useSyncEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<AgentTask>("/integrations/email/sync"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationKeys.all });
      qc.invalidateQueries({ queryKey: ["agent"] });
    },
  });
}
