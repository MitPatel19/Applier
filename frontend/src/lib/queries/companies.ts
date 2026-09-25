"use client";

/** Company research hooks. Keys live under ["companies", ...]. */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApplicationStatus, Company, Job } from "@/lib/types";

export interface CompanyApplicationRef {
  id: number;
  job_title: string;
  status: ApplicationStatus;
}
export interface CompanyDetailResponse {
  company: Company;
  jobs: Job[];
  applications: CompanyApplicationRef[];
}
export type CompanyUpdate = Partial<
  Pick<Company, "industry" | "website" | "headquarters" | "size" | "careers_url" | "description" | "notes">
>;

export const companyKeys = {
  list: (q: string) => ["companies", "list", q] as const,
  detail: (id: number) => ["companies", "detail", id] as const,
};

export function useCompanies(q = "") {
  return useQuery({
    queryKey: companyKeys.list(q),
    queryFn: () => api.get<Company[]>("/companies", { q }),
    placeholderData: keepPreviousData,
  });
}

export function useCompany(id: number | null) {
  return useQuery({
    queryKey: companyKeys.detail(id ?? 0),
    queryFn: () => api.get<CompanyDetailResponse>(`/companies/${id}`),
    enabled: !!id,
  });
}

export function useUpdateCompany(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CompanyUpdate) => api.patch<Company>(`/companies/${id}`, body),
    onSuccess: (company) => {
      qc.setQueryData<CompanyDetailResponse>(companyKeys.detail(id), (prev) => (prev ? { ...prev, company } : prev));
      qc.invalidateQueries({ queryKey: ["companies", "list"] });
    },
  });
}

/** Refresh company research. Also refreshes any job detail that embeds this company. */
export function useResearchCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<Company>(`/companies/${id}/research`),
    onSuccess: (company) => {
      qc.setQueryData<CompanyDetailResponse>(companyKeys.detail(company.id), (prev) => (prev ? { ...prev, company } : prev));
      qc.invalidateQueries({ queryKey: ["companies", "list"] });
      qc.invalidateQueries({ queryKey: ["jobs", "detail"] });
    },
  });
}
