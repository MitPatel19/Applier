"use client";

/** Application templates (cover letters, answers, messages). Keys live under ["templates", ...]. */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Application, Template, TemplateIn, TemplateKind, TemplateRender } from "@/lib/types";

export type TemplateUpdate = Partial<Omit<TemplateIn, "kind">>;

export const templateKeys = {
  all: ["templates"] as const,
  list: (kind: TemplateKind | "all") => ["templates", "list", kind] as const,
  applicationOptions: ["templates", "application-options"] as const,
};

export function useTemplates(kind: TemplateKind | "all") {
  return useQuery({
    queryKey: templateKeys.list(kind),
    queryFn: () => api.get<Template[]>("/templates", { kind: kind === "all" ? undefined : kind }),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TemplateIn) => api.post<Template>("/templates", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", "list"] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: TemplateUpdate }) => api.patch<Template>(`/templates/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", "list"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", "list"] }),
  });
}

/**
 * Server-side render of a saved template (optionally filled from an application).
 * `version` (the template's updated_at) re-renders after every save.
 */
export function useTemplateRender(id: number | null, applicationId: number | null, version: string | null, enabled = true) {
  return useQuery({
    queryKey: ["templates", "render", id, applicationId, version] as const,
    queryFn: () => api.post<TemplateRender>(`/templates/${id}/render`, { application_id: applicationId }),
    enabled: enabled && id !== null,
    placeholderData: keepPreviousData,
  });
}

/** Lightweight list of applications for the "preview with…" picker. */
export function useApplicationOptions() {
  return useQuery({
    queryKey: templateKeys.applicationOptions,
    queryFn: () => api.get<Application[]>("/applications"),
    select: (apps) => apps.map((a) => ({ id: a.id, label: `${a.job_title} · ${a.company_name}` })),
    staleTime: 60_000,
  });
}
