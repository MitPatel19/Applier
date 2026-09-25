"use client";

/** Analytics hooks. Keys live under ["analytics", ...]. */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Analytics, ResumePerformance } from "@/lib/types";

export const analyticsKeys = {
  all: ["analytics"] as const,
  summary: (rangeDays: number) => ["analytics", "summary", rangeDays] as const,
  resumePerformance: ["analytics", "resume-performance"] as const,
};

export function useAnalytics(rangeDays: number) {
  return useQuery({
    queryKey: analyticsKeys.summary(rangeDays),
    queryFn: () => api.get<Analytics>("/analytics/summary", { range_days: rangeDays }),
    // Hold the previous range on screen while the next one loads (no skeleton flash).
    placeholderData: keepPreviousData,
  });
}

export function useResumePerformance() {
  return useQuery({
    queryKey: analyticsKeys.resumePerformance,
    queryFn: () => api.get<ResumePerformance>("/analytics/resume-performance"),
  });
}
