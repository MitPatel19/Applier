"use client";

/** Follow-up reminders (per application / per contact) and message generation. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FollowUp, FollowUpIn, GeneratedText, Template, TemplateKind, TemplateRender } from "@/lib/types";

export interface FollowUpListParams {
  status?: FollowUp["status"] | "";
  application_id?: number;
  recruiter_id?: number;
}

export const followUpKeys = {
  all: ["follow-ups"] as const,
  list: (params: FollowUpListParams = {}) => ["follow-ups", "list", params] as const,
};

export interface FollowUpUpdateIn {
  due_at?: string;
  channel?: FollowUp["channel"];
  status?: FollowUp["status"];
  subject?: string | null;
  message?: string | null;
  note?: string | null;
}

/**
 * Lists follow-ups. The backend documents a `status` filter; application/recruiter filters are
 * passed through and also applied client-side so the result is correct either way.
 */
export function useFollowUps(params: FollowUpListParams = {}) {
  return useQuery({
    queryKey: followUpKeys.list(params),
    queryFn: async () => {
      const items = await api.get<FollowUp[]>("/follow-ups", {
        status: params.status || undefined,
        application_id: params.application_id,
        recruiter_id: params.recruiter_id,
      });
      return items.filter(
        (f) =>
          (params.application_id === undefined || f.application_id === params.application_id) &&
          (params.recruiter_id === undefined || f.recruiter_id === params.recruiter_id),
      );
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (f?: Pick<FollowUp, "application_id"> | null) => {
    qc.invalidateQueries({ queryKey: followUpKeys.all });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["applications", "board"] });
    if (f?.application_id) qc.invalidateQueries({ queryKey: ["applications", f.application_id] });
  };
}

export function useCreateFollowUp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: FollowUpIn) => api.post<FollowUp>("/follow-ups", body),
    onSuccess: (data) => invalidate(data),
  });
}

export function useUpdateFollowUp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: FollowUpUpdateIn }) => api.patch<FollowUp>(`/follow-ups/${id}`, body),
    onSuccess: (data) => invalidate(data),
  });
}

export function useCompleteFollowUp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => api.post<FollowUp>(`/follow-ups/${id}/complete`),
    onSuccess: (data) => invalidate(data),
  });
}

export function useDeleteFollowUp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id }: { id: number; applicationId?: number | null }) => api.del(`/follow-ups/${id}`),
    onSuccess: (_d, v) => invalidate({ application_id: v.applicationId ?? null }),
  });
}

export function useGenerateFollowUpMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<GeneratedText>(`/follow-ups/${id}/generate-message`),
    onSuccess: () => qc.invalidateQueries({ queryKey: followUpKeys.all }),
  });
}

// ---------------------------------------------------------------- message templates (starting points)
export function useMessageTemplates(kind: TemplateKind) {
  return useQuery({
    // Same key/shape as lib/queries/templates.ts so template edits refresh these starting points.
    queryKey: ["templates", "list", kind] as const,
    queryFn: () => api.get<Template[]>("/templates", { kind }),
    staleTime: 5 * 60_000,
  });
}

export function useRenderTemplate() {
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; application_id?: number | null; recruiter_id?: number | null }) =>
      api.post<TemplateRender>(`/templates/${id}/render`, body),
  });
}
