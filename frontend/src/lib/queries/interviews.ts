"use client";

/** Interview scheduling + Interview Preparation Center queries. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Interview, InterviewDetail, InterviewIn, PracticeEntry } from "@/lib/types";

export const interviewKeys = {
  all: ["interviews"] as const,
  list: (upcoming?: boolean) => ["interviews", "list", { upcoming: !!upcoming }] as const,
  detail: (id: number) => ["interviews", id] as const,
};

export type InterviewUpdateIn = Partial<Omit<InterviewIn, "application_id">> & {
  outcome?: Interview["outcome"];
};

export function useInterviews(upcoming?: boolean) {
  return useQuery({
    queryKey: interviewKeys.list(upcoming),
    queryFn: () => api.get<Interview[]>("/interviews", { upcoming: upcoming || undefined }),
  });
}

export function useInterview(id: number | null | undefined) {
  return useQuery({
    queryKey: interviewKeys.detail(id ?? 0),
    queryFn: () => api.get<InterviewDetail>(`/interviews/${id}`),
    enabled: !!id && Number.isFinite(id),
  });
}

function useInvalidateInterviews() {
  const qc = useQueryClient();
  return (applicationId?: number | null) => {
    qc.invalidateQueries({ queryKey: interviewKeys.all });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["applications", "board"] });
    qc.invalidateQueries({ queryKey: ["applications", "list"] });
    if (applicationId) qc.invalidateQueries({ queryKey: ["applications", applicationId] });
  };
}

export function useCreateInterview() {
  const invalidate = useInvalidateInterviews();
  return useMutation({
    mutationFn: (body: InterviewIn) => api.post<InterviewDetail>("/interviews", body),
    onSuccess: (data) => invalidate(data.application_id),
  });
}

export function useUpdateInterview() {
  const qc = useQueryClient();
  const invalidate = useInvalidateInterviews();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: InterviewUpdateIn }) => api.patch<InterviewDetail>(`/interviews/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(interviewKeys.detail(data.id), data);
      invalidate(data.application_id);
    },
  });
}

export function useDeleteInterview() {
  const invalidate = useInvalidateInterviews();
  return useMutation({
    mutationFn: ({ id }: { id: number; applicationId?: number }) => api.del(`/interviews/${id}`),
    onSuccess: (_d, v) => invalidate(v.applicationId),
  });
}

export function useRegeneratePrep(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<InterviewDetail>(`/interviews/${id}/prep/regenerate`),
    onSuccess: (data) => qc.setQueryData(interviewKeys.detail(id), data),
  });
}

export function usePractice(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { question: string; answer: string }) => api.post<PracticeEntry>(`/interviews/${id}/practice`, body),
    onSuccess: (entry) => {
      qc.setQueryData<InterviewDetail>(interviewKeys.detail(id), (prev) =>
        prev ? { ...prev, practice_log: [...prev.practice_log, entry] } : prev,
      );
    },
  });
}
