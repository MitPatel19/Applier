"use client";

/**
 * Onboarding hooks. Query keys intentionally match the ones used elsewhere in the app
 * (["profile"], ["integrations"], ["agent", "settings"], ["preferences"]) so caches stay shared.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AgentSettings,
  AgentTask,
  FullProfile,
  Integration,
  Message,
  ParsedResume,
  Profile,
  ProfileIn,
  ResumeDetail,
  Skill,
  SkillIn,
  User,
} from "@/lib/types";
import { qk } from "./core";

export const onboardingKeys = {
  profile: ["profile"] as const,
  integrations: ["integrations"] as const,
  agentSettings: ["agent", "settings"] as const,
  parsed: (resumeId: number) => ["resumes", resumeId, "parsed"] as const,
};

// ---------------------------------------------------------------- demo
export function useSeedDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Message>("/demo/seed"),
    onSuccess: () => {
      // Everything changes after seeding — drop cached data except the session user.
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    },
  });
}

// ---------------------------------------------------------------- profile
export function useFullProfile(enabled = true) {
  return useQuery({
    queryKey: onboardingKeys.profile,
    queryFn: () => api.get<FullProfile>("/profile"),
    enabled,
  });
}

export function useUploadResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { file: File; name: string; targetRole?: string | null }) => {
      const form = new FormData();
      form.append("file", input.file);
      form.append("name", input.name);
      if (input.targetRole) form.append("target_role", input.targetRole);
      form.append("set_default", "true");
      return api.upload<ResumeDetail>("/resumes", form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resumes"] }),
  });
}

export function useParsedResume(resumeId: number | null) {
  return useQuery({
    queryKey: onboardingKeys.parsed(resumeId ?? 0),
    queryFn: () => api.get<ParsedResume>(`/resumes/${resumeId}/parsed`),
    enabled: !!resumeId,
    staleTime: Infinity,
  });
}

export function useImportProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (parsed: ParsedResume) =>
      api.post<FullProfile>("/profile/import", { parsed, overwrite_personal: false }),
    onSuccess: (profile) => {
      qc.setQueryData(onboardingKeys.profile, profile);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useSaveManualProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { profile: ProfileIn; skills: SkillIn[] }) => {
      const profile = await api.patch<Profile>("/profile", input.profile);
      const skills = input.skills.length
        ? await api.post<Skill[]>("/profile/skills/bulk", { skills: input.skills })
        : [];
      return { profile, skills };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: onboardingKeys.profile });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ---------------------------------------------------------------- integrations
export function useIntegrations() {
  return useQuery({
    queryKey: onboardingKeys.integrations,
    queryFn: () => api.get<Integration[]>("/integrations"),
  });
}

export function useConnectIntegration() {
  return useMutation({
    mutationFn: (provider: string) =>
      api.post<{ authorize_url: string }>(`/integrations/${encodeURIComponent(provider)}/connect`),
  });
}

// ---------------------------------------------------------------- agent
export function useOnboardingAgentSettings() {
  return useQuery({
    queryKey: onboardingKeys.agentSettings,
    queryFn: () => api.get<AgentSettings>("/agent/settings"),
  });
}

export function useSaveAgentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentSettings) =>
      api.patch<AgentSettings>("/agent/settings", { ...body, auto_submit: false }),
    onSuccess: (data) => {
      qc.setQueryData(onboardingKeys.agentSettings, data);
      qc.invalidateQueries({ queryKey: qk.preferences });
      qc.invalidateQueries({ queryKey: qk.agentStatus });
    },
  });
}

export function useStartFirstSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<AgentTask>("/agent/run", { kind: "search" }),
    onSuccess: (task) => {
      qc.setQueryData(["agent", "task", task.id], task);
      qc.invalidateQueries({ queryKey: qk.agentStatus });
    },
  });
}

// ---------------------------------------------------------------- completion
export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch<User>("/users/me", { onboarding_completed: true }),
    onSuccess: (user) => {
      qc.setQueryData<User>(qk.me, user);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
