"use client";

/** Recruiter / networking contacts and message generation. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GeneratedText, NetworkingPurpose, Recruiter, RecruiterIn } from "@/lib/types";

export const recruiterKeys = {
  all: ["recruiters"] as const,
  list: ["recruiters", "list"] as const,
  detail: (id: number) => ["recruiters", id] as const,
};

export interface NetworkingMessageIn {
  purpose: NetworkingPurpose;
  application_id?: number | null;
  job_id?: number | null;
  extra_context?: string | null;
}

export function useRecruiters() {
  return useQuery({ queryKey: recruiterKeys.list, queryFn: () => api.get<Recruiter[]>("/recruiters") });
}

export function useCreateRecruiter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RecruiterIn) => api.post<Recruiter>("/recruiters", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: recruiterKeys.all }),
  });
}

export function useUpdateRecruiter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<RecruiterIn> }) => api.patch<Recruiter>(`/recruiters/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData<Recruiter[]>(recruiterKeys.list, (prev) => prev?.map((r) => (r.id === data.id ? data : r)));
      qc.invalidateQueries({ queryKey: recruiterKeys.all });
    },
  });
}

export function useDeleteRecruiter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/recruiters/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recruiterKeys.all });
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useGenerateRecruiterMessage(id: number) {
  return useMutation({
    mutationFn: (body: NetworkingMessageIn) => api.post<GeneratedText>(`/recruiters/${id}/message`, body),
  });
}
