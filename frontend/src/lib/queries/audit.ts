"use client";

/** Audit log feed with cursor pagination (`before_id`). Keys live under ["audit", ...]. */

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuditEntry } from "@/lib/types";

export const AUDIT_PAGE_SIZE = 50;

export const auditKeys = {
  feed: (filters: { entityType?: string; entityId?: number }) => ["audit", "feed", filters] as const,
};

export function useAuditFeed(filters: { entityType?: string; entityId?: number } = {}) {
  return useInfiniteQuery({
    queryKey: auditKeys.feed(filters),
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      api.get<AuditEntry[]>("/audit", {
        limit: AUDIT_PAGE_SIZE,
        before_id: pageParam,
        entity_type: filters.entityType,
        entity_id: filters.entityId,
      }),
    getNextPageParam: (last) => (last.length < AUDIT_PAGE_SIZE ? undefined : last[last.length - 1]?.id),
  });
}
