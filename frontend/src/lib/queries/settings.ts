"use client";

/**
 * Settings hooks: scoring weights, privacy & account security, demo data.
 * Preferences live in ./core (usePreferences/useUpdatePreferences); agent settings in ./agent.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Preferences, PreferencesIn, ScoringWeights } from "@/lib/types";
import { qk } from "./core";

/** PUT /job-matches/weights may report how many jobs were rescored. */
export type ScoringWeightsSaveResult = ScoringWeights & {
  recalculated?: number;
  rescored?: number;
  jobs_rescored?: number;
};

export interface PrivacyInfo {
  stored_data: { category: string; count: number; description: string }[];
  integrations: { provider?: string; name?: string; status?: string; account_label?: string | null }[];
  retention: string;
  encryption: string;
}

export const settingsKeys = {
  weights: ["scoring-weights"] as const,
  privacy: ["privacy"] as const,
};

/**
 * Optimistic preferences patch for instant-apply toggles (notifications, appearance).
 * Always send whole nested objects (e.g. the full `notification_settings`), since the API
 * replaces nested settings objects rather than deep-merging them.
 */
export function usePatchPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PreferencesIn) => api.patch<Preferences>("/profile/preferences", body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.preferences });
      const prev = qc.getQueryData<Preferences>(qk.preferences);
      if (prev) qc.setQueryData<Preferences>(qk.preferences, { ...prev, ...body } as Preferences);
      return { prev };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.preferences, ctx.prev);
    },
    onSuccess: (data) => qc.setQueryData(qk.preferences, data),
  });
}

export function useScoringWeights() {
  return useQuery({ queryKey: settingsKeys.weights, queryFn: () => api.get<ScoringWeights>("/job-matches/weights") });
}

export function useUpdateScoringWeights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (weights: Record<string, number>) => api.put<ScoringWeightsSaveResult>("/job-matches/weights", { weights }),
    onSuccess: (data) => {
      qc.setQueryData<ScoringWeights>(settingsKeys.weights, { weights: data.weights, defaults: data.defaults, labels: data.labels });
      // Every match score changed.
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: qk.preferences });
    },
  });
}

export function usePrivacy() {
  return useQuery({
    queryKey: settingsKeys.privacy,
    queryFn: () => api.get<PrivacyInfo>("/users/me/privacy"),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) => api.post<void>("/auth/change-password", body),
  });
}

export function useLogoutAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/auth/logout-all"),
    onSuccess: () => {
      qc.clear();
      // Full reload: drops every cached query and in-memory state from the revoked session.
      window.location.replace("/login");
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api.del<void>("/users/me", { password, confirm: "DELETE" }),
    onSuccess: () => {
      qc.clear();
      window.location.replace("/");
    },
  });
}

export function useSeedDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ message: string }>("/demo/seed"),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useClearDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del<void>("/demo"),
    onSuccess: () => qc.invalidateQueries(),
  });
}
