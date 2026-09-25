"use client";

/**
 * Application preparation & confirmation queries.
 *
 * Query keys: application detail ["applications", id], preview ["applications", id, "preview"].
 * Every mutation invalidates ["applications"] broadly so the pipeline/board/dashboard stay in sync.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Answer, ApplicationDetail, ApplicationPreview, SubmitResult } from "@/lib/types";

export const prepareKeys = {
  all: ["applications"] as const,
  detail: (id: number) => ["applications", id] as const,
  preview: (id: number) => ["applications", id, "preview"] as const,
};

function invalidateApplications(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: prepareKeys.all });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
}

/** Store a fresh ApplicationDetail and refresh the dependent preview. */
function storeDetail(qc: QueryClient, detail: ApplicationDetail) {
  qc.setQueryData(prepareKeys.detail(detail.id), detail);
  qc.invalidateQueries({ queryKey: prepareKeys.preview(detail.id) });
}

export function useApplication(id: number | null | undefined) {
  return useQuery({
    queryKey: prepareKeys.detail(id ?? 0),
    queryFn: () => api.get<ApplicationDetail>(`/applications/${id}`),
    enabled: !!id,
  });
}

export function useApplicationPreview(id: number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: prepareKeys.preview(id ?? 0),
    queryFn: () => api.get<ApplicationPreview>(`/applications/${id}/preview`),
    enabled: !!id && enabled,
  });
}

export interface PrepareBody {
  job_id: number;
  resume_id?: number | null;
  cover_letter_variant?: "professional" | "short" | "personalized";
  include_cover_letter?: boolean | null;
}

export function usePrepareApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PrepareBody) => api.post<ApplicationDetail>("/applications/prepare", body),
    onSuccess: (detail) => {
      storeDetail(qc, detail);
      invalidateApplications(qc);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["resumes"] });
      qc.invalidateQueries({ queryKey: ["cover-letters"] });
    },
  });
}

export interface ApplicationUpdateBody {
  notes?: string | null;
  salary_expectation?: string | null;
  resume_id?: number | null;
  cover_letter_id?: number | null;
}

export function useUpdateApplication(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplicationUpdateBody) => api.patch<ApplicationDetail>(`/applications/${id}`, body),
    onSuccess: (detail) => {
      storeDetail(qc, detail);
      invalidateApplications(qc);
    },
  });
}

export function useRefreshReadiness(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ApplicationDetail>(`/applications/${id}/readiness/refresh`),
    onSuccess: (detail) => {
      storeDetail(qc, detail);
      invalidateApplications(qc);
    },
  });
}

export function useApproveApplication(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { acknowledge_answers: boolean }) =>
      api.post<ApplicationDetail>(`/applications/${id}/approve`, { confirm: true, acknowledge_answers: body.acknowledge_answers }),
    onSuccess: (detail) => storeDetail(qc, detail),
  });
}

export function useSubmitApplication(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SubmitResult>(`/applications/${id}/submit`),
    onSuccess: () => invalidateApplications(qc),
  });
}

export interface ConfirmSubmittedBody {
  submitted: boolean;
  note?: string | null;
  schedule_follow_up?: boolean;
  follow_up_days?: number;
}

export function useConfirmSubmitted(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ConfirmSubmittedBody) => api.post<ApplicationDetail>(`/applications/${id}/confirm-submitted`, body),
    onSuccess: (detail) => {
      storeDetail(qc, detail);
      invalidateApplications(qc);
      qc.invalidateQueries({ queryKey: ["follow-ups"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

// ------------------------------------------------------------------ answers

/** Patch one answer and keep the cached application detail in sync without a refetch. */
function patchAnswerInCache(qc: QueryClient, applicationId: number, answer: Answer) {
  qc.setQueryData<ApplicationDetail>(prepareKeys.detail(applicationId), (prev) =>
    prev ? { ...prev, answers: prev.answers.map((a) => (a.id === answer.id ? answer : a)) } : prev,
  );
  qc.invalidateQueries({ queryKey: prepareKeys.preview(applicationId) });
}

export function useUpdateAnswer(applicationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; answer?: string; confirmed?: boolean }) =>
      api.patch<Answer>(`/application-answers/${id}`, body),
    onSuccess: (answer) => patchAnswerInCache(qc, applicationId, answer),
  });
}

export interface AnswerCreateBody {
  question: string;
  answer?: string;
  field_type?: Answer["field_type"];
  options?: string[];
  required?: boolean;
}

export function useCreateAnswer(applicationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AnswerCreateBody) => api.post<Answer>(`/applications/${applicationId}/answers`, body),
    onSuccess: (answer) => {
      qc.setQueryData<ApplicationDetail>(prepareKeys.detail(applicationId), (prev) =>
        prev ? { ...prev, answers: [...prev.answers, answer] } : prev,
      );
      qc.invalidateQueries({ queryKey: prepareKeys.preview(applicationId) });
    },
  });
}

export function useDeleteAnswer(applicationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/application-answers/${id}`),
    onSuccess: (_, id) => {
      qc.setQueryData<ApplicationDetail>(prepareKeys.detail(applicationId), (prev) =>
        prev ? { ...prev, answers: prev.answers.filter((a) => a.id !== id) } : prev,
      );
      qc.invalidateQueries({ queryKey: prepareKeys.preview(applicationId) });
    },
  });
}

/** Download URL for an approved application document. */
export function applicationDocumentUrl(applicationId: number, docId: number) {
  return api.url(`/applications/${applicationId}/documents/${docId}`);
}
