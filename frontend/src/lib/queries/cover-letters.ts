"use client";

/** Cover letter queries. Keys all start with ["cover-letters"]. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CoverLetter, CoverLetterVariant } from "@/lib/types";

export const coverLetterKeys = {
  all: ["cover-letters"] as const,
  list: (jobId?: number | null) => ["cover-letters", "list", { jobId: jobId ?? null }] as const,
  detail: (id: number) => ["cover-letters", id] as const,
};

export const COVER_LETTER_VARIANTS: { value: CoverLetterVariant; label: string; hint: string }[] = [
  { value: "professional", label: "Professional", hint: "Balanced and formal — a safe default." },
  { value: "short", label: "Short", hint: "Three tight paragraphs for busy recruiters." },
  { value: "personalized", label: "More personalized", hint: "Leans on company research and your story." },
];

export const GENERATED_BY_LABELS: Record<CoverLetter["generated_by"], string> = {
  template: "Template",
  ai: "AI-assisted",
  user: "Written by you",
};

export function coverLetterRenderUrl(id: number, format: "pdf" | "docx") {
  return api.url(`/cover-letters/${id}/render`, { format });
}

export function useCoverLetters(jobId?: number | null) {
  return useQuery({
    queryKey: coverLetterKeys.list(jobId),
    queryFn: () => api.get<CoverLetter[]>("/cover-letters", { job_id: jobId ?? undefined }),
  });
}

export function useCoverLetter(id: number | null | undefined) {
  return useQuery({
    queryKey: coverLetterKeys.detail(id ?? 0),
    queryFn: () => api.get<CoverLetter>(`/cover-letters/${id}`),
    enabled: !!id,
  });
}

export function useGenerateCoverLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { job_id: number; variant: CoverLetterVariant; template_id?: number | null }) =>
      api.post<CoverLetter>("/cover-letters/generate", body),
    onSuccess: (cl) => {
      qc.setQueryData(coverLetterKeys.detail(cl.id), cl);
      qc.invalidateQueries({ queryKey: ["cover-letters", "list"] });
    },
  });
}

export interface CoverLetterUpdateBody {
  title?: string;
  content?: string;
  variant?: CoverLetterVariant;
  status?: CoverLetter["status"];
}

export function useUpdateCoverLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CoverLetterUpdateBody & { id: number }) => api.patch<CoverLetter>(`/cover-letters/${id}`, body),
    onSuccess: (cl) => {
      qc.setQueryData(coverLetterKeys.detail(cl.id), cl);
      qc.invalidateQueries({ queryKey: ["cover-letters", "list"] });
      // Applications embed their cover letter.
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useDeleteCoverLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/cover-letters/${id}`),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: coverLetterKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ["cover-letters", "list"] });
    },
  });
}

export function wordCount(text: string) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
