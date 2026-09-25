"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Dashboard } from "@/lib/types";

export const dashboardKey = ["dashboard"] as const;

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKey,
    queryFn: () => api.get<Dashboard>("/analytics/dashboard"),
    refetchInterval: 60_000,
  });
}
