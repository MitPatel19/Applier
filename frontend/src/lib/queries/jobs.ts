"use client";

/** Jobs, job searches and application-prep hooks. Query keys live under ["jobs", ...]. */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AgentTask,
  ApplicationDetail,
  Job,
  JobDetail,
  JobList,
  JobListQuery,
  JobMatch,
  JobSearch,
  JobSearchIn,
  ManualJobIn,
  ParsedQuery,
  SearchFilters,
  SourceKey,
} from "@/lib/types";

export const jobKeys = {
  all: ["jobs"] as const,
  list: (q: JobListQuery) => ["jobs", "list", q] as const,
  detail: (id: number) => ["jobs", "detail", id] as const,
  searches: ["jobs", "searches"] as const,
};

export function useJobs(query: JobListQuery) {
  return useQuery({
    queryKey: jobKeys.list(query),
    queryFn: () => api.get<JobList>("/jobs", { ...query }),
    placeholderData: keepPreviousData,
  });
}

export function useJob(id: number | null) {
  return useQuery({
    queryKey: jobKeys.detail(id ?? 0),
    queryFn: () => api.get<JobDetail>(`/jobs/${id}`),
    enabled: !!id,
  });
}

function useInvalidateJobs() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: jobKeys.all });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useHideJob() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string | null }) =>
      api.post<Job>(`/jobs/${id}/hide`, { reason: reason || null }),
    onSuccess: invalidate,
  });
}

export function useUnhideJob() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: (id: number) => api.post<Job>(`/jobs/${id}/unhide`),
    onSuccess: invalidate,
  });
}

export function useJobFeedback() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: ({ id, feedback }: { id: number; feedback: "interested" | "not_interested" | null }) =>
      api.post<Job>(`/jobs/${id}/feedback`, { feedback }),
    onSuccess: invalidate,
  });
}

export function useRescoreJob() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: (id: number) => api.post<JobMatch>(`/jobs/${id}/rescore`),
    onSuccess: invalidate,
  });
}

export function useAddManualJob() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: (body: ManualJobIn) => api.post<JobDetail>("/jobs/manual", body),
    onSuccess: invalidate,
  });
}

export function usePrepareApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["prepare-application"],
    mutationFn: (jobId: number) => api.post<ApplicationDetail>("/applications/prepare", { job_id: jobId }),
    onSuccess: (data) => {
      qc.setQueryData(["applications", data.id], data);
      qc.invalidateQueries({ queryKey: jobKeys.all });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["applications"], exact: false, predicate: (q) => q.queryKey[1] !== data.id });
    },
  });
}

// ------------------------------------------------------------------ job searches

export function useParseQuery() {
  return useMutation({ mutationFn: (text: string) => api.post<ParsedQuery>("/job-searches/parse", { text }) });
}

export function useJobSearches() {
  return useQuery({ queryKey: jobKeys.searches, queryFn: () => api.get<JobSearch[]>("/job-searches") });
}

export function useCreateJobSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: JobSearchIn) => api.post<JobSearch>("/job-searches", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: jobKeys.searches }),
  });
}

export function useUpdateJobSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<JobSearchIn> & { id: number }) => api.patch<JobSearch>(`/job-searches/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: jobKeys.searches }),
  });
}

export function useDeleteJobSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/job-searches/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: jobKeys.searches }),
  });
}

export function useRunSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { filters: SearchFilters; sources: SourceKey[]; query_text?: string | null; job_search_id?: number | null }) =>
      api.post<AgentTask>("/job-searches/run", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent"] }),
  });
}

export function useRunSavedSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<AgentTask>(`/job-searches/${id}/run`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent"] });
      qc.invalidateQueries({ queryKey: jobKeys.searches });
    },
  });
}

export const EMPTY_FILTERS: SearchFilters = {
  roles: [],
  keywords: [],
  locations: [],
  remote_regions: [],
  work_arrangements: [],
  job_types: [],
  experience_levels: [],
  salary_min: null,
  salary_period: "yearly",
  posted_within_days: null,
  companies: [],
  exclude_companies: [],
  industries: [],
  easy_apply_only: false,
};
