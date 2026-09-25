"use client";

/** Resume Center queries. Keys all start with ["resumes"]. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ParsedResume, Resume, ResumeContent, ResumeDetail, ResumeVersion, ResumeVersionDetail } from "@/lib/types";

export const resumeKeys = {
  all: ["resumes"] as const,
  list: ["resumes", "list"] as const,
  detail: (id: number) => ["resumes", id] as const,
  versions: (id: number) => ["resumes", id, "versions"] as const,
  version: (versionId: number) => ["resumes", "versions", versionId] as const,
  parsed: (id: number) => ["resumes", id, "parsed"] as const,
};

export type DocFormat = "pdf" | "docx";

export const resumeUrls = {
  render: (id: number, format: DocFormat) => api.url(`/resumes/${id}/render`, { format }),
  file: (id: number) => api.url(`/resumes/${id}/file`),
  versionRender: (versionId: number, format: DocFormat) => api.url(`/resumes/versions/${versionId}/render`, { format }),
};

export function useResumes() {
  return useQuery({ queryKey: resumeKeys.list, queryFn: () => api.get<Resume[]>("/resumes") });
}

export function useResume(id: number | null | undefined) {
  return useQuery({
    queryKey: resumeKeys.detail(id ?? 0),
    queryFn: () => api.get<ResumeDetail>(`/resumes/${id}`),
    enabled: !!id,
  });
}

export function useResumeVersions(id: number | null | undefined) {
  return useQuery({
    queryKey: resumeKeys.versions(id ?? 0),
    queryFn: () => api.get<ResumeVersion[]>(`/resumes/${id}/versions`),
    enabled: !!id,
  });
}

export function useResumeVersion(versionId: number | null | undefined, initialData?: ResumeVersionDetail | null) {
  return useQuery({
    queryKey: resumeKeys.version(versionId ?? 0),
    queryFn: () => api.get<ResumeVersionDetail>(`/resumes/versions/${versionId}`),
    enabled: !!versionId,
    initialData: initialData ?? undefined,
  });
}

export function useParsedResume(id: number | null | undefined) {
  return useQuery({
    queryKey: resumeKeys.parsed(id ?? 0),
    queryFn: () => api.get<ParsedResume>(`/resumes/${id}/parsed`),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export interface UploadResumeInput {
  file: File;
  name: string;
  target_role?: string;
  set_default?: boolean;
}

export function useUploadResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadResumeInput) => {
      const form = new FormData();
      form.append("file", input.file);
      form.append("name", input.name);
      if (input.target_role) form.append("target_role", input.target_role);
      form.append("set_default", String(!!input.set_default));
      return api.upload<ResumeDetail>("/resumes", form);
    },
    onSuccess: (r) => {
      qc.setQueryData(resumeKeys.detail(r.id), r);
      qc.invalidateQueries({ queryKey: resumeKeys.list });
    },
  });
}

export function useCreateResumeFromProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; target_role?: string | null; set_default?: boolean }) =>
      api.post<ResumeDetail>("/resumes/from-profile", body),
    onSuccess: (r) => {
      qc.setQueryData(resumeKeys.detail(r.id), r);
      qc.invalidateQueries({ queryKey: resumeKeys.list });
    },
  });
}

export interface ResumeUpdateBody {
  name?: string;
  target_role?: string | null;
  status?: Resume["status"];
  content?: ResumeContent;
}

export function useUpdateResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ResumeUpdateBody & { id: number }) => api.patch<ResumeDetail>(`/resumes/${id}`, body),
    onSuccess: (r) => {
      qc.setQueryData(resumeKeys.detail(r.id), r);
      qc.invalidateQueries({ queryKey: resumeKeys.list });
    },
  });
}

export function useSetDefaultResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<Resume>(`/resumes/${id}/default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: resumeKeys.all }),
  });
}

export function useDeleteResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/resumes/${id}`),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: resumeKeys.detail(id) });
      qc.invalidateQueries({ queryKey: resumeKeys.list });
    },
  });
}

export function useVersionDecisions(versionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (decisions: Record<string, boolean>) =>
      api.post<ResumeVersionDetail>(`/resumes/versions/${versionId}/decisions`, { decisions }),
    onSuccess: (v) => {
      qc.setQueryData(resumeKeys.version(v.id), v);
      // The application detail embeds the version — keep it in sync.
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useApproveVersion(versionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ResumeVersionDetail>(`/resumes/versions/${versionId}/approve`),
    onSuccess: (v) => {
      qc.setQueryData(resumeKeys.version(v.id), v);
      qc.invalidateQueries({ queryKey: resumeKeys.versions(v.resume_id) });
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
