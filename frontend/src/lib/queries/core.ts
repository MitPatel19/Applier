"use client";

/** Core queries shared by the app shell and many pages. Domain hooks live alongside in lib/queries/*. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AgentStatus, NotificationList, Preferences, User } from "@/lib/types";

export const qk = {
  me: ["me"] as const,
  notifications: ["notifications"] as const,
  agentStatus: ["agent", "status"] as const,
  preferences: ["preferences"] as const,
};

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api.get<User>("/auth/me"), staleTime: 5 * 60_000 });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => {
      qc.clear();
      window.location.href = "/login";
    },
  });
}

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: [...qk.notifications, { unreadOnly }],
    queryFn: () => api.get<NotificationList>("/notifications", { unread: unreadOnly || undefined, limit: 30 }),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | "all") => (id === "all" ? api.post("/notifications/read-all") : api.post(`/notifications/${id}/read`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useAgentStatus() {
  return useQuery({
    queryKey: qk.agentStatus,
    queryFn: () => api.get<AgentStatus>("/agent/status"),
    refetchInterval: (q) => (q.state.data?.running ? 2_000 : 30_000),
  });
}

export function usePreferences() {
  return useQuery({ queryKey: qk.preferences, queryFn: () => api.get<Preferences>("/profile/preferences") });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Preferences>) => api.patch<Preferences>("/profile/preferences", body),
    onSuccess: (data) => qc.setQueryData(qk.preferences, data),
  });
}
