"use client";

/** Application pipeline queries: board, history list, detail, status moves (optimistic) and audit trail. */

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/constants";
import type {
  Application,
  ApplicationDetail,
  ApplicationStatus,
  AuditEntry,
  Board,
} from "@/lib/types";

export interface ApplicationListParams {
  status?: ApplicationStatus | "";
  q?: string;
}

export const appKeys = {
  all: ["applications"] as const,
  board: ["applications", "board"] as const,
  list: (params: ApplicationListParams = {}) => ["applications", "list", params] as const,
  detail: (id: number) => ["applications", id] as const,
  audit: (entityType: string, entityId: number) => ["audit", entityType, entityId] as const,
};

export interface ApplicationUpdateIn {
  notes?: string | null;
  salary_expectation?: string | null;
  recruiter_id?: number | null;
  resume_id?: number | null;
  cover_letter_id?: number | null;
  rejection_reason?: string | null;
}

export interface MoveInput {
  id: number;
  status: ApplicationStatus;
  board_position?: number | null;
  note?: string | null;
  /** Rejection reason saved on the application (only for `rejected`). */
  rejection_reason?: string | null;
}

// ---------------------------------------------------------------- reads
export function useBoard() {
  return useQuery({ queryKey: appKeys.board, queryFn: () => api.get<Board>("/applications/board") });
}

export function useApplications(params: ApplicationListParams = {}) {
  return useQuery({
    queryKey: appKeys.list(params),
    queryFn: () => api.get<Application[]>("/applications", { status: params.status || undefined, q: params.q || undefined }),
  });
}

export function useApplication(id: number | null | undefined) {
  return useQuery({
    queryKey: appKeys.detail(id ?? 0),
    queryFn: () => api.get<ApplicationDetail>(`/applications/${id}`),
    enabled: !!id && Number.isFinite(id),
  });
}

export function useAudit(entityType: string, entityId: number | null | undefined, limit = 100) {
  return useQuery({
    queryKey: appKeys.audit(entityType, entityId ?? 0),
    queryFn: () => api.get<AuditEntry[]>("/audit", { entity_type: entityType, entity_id: entityId ?? undefined, limit }),
    enabled: !!entityId,
  });
}

// ---------------------------------------------------------------- optimistic helpers
/** Returns a new board with the application moved into `status` at `position` (columns re-sorted). */
export function applyMoveToBoard(board: Board, id: number, status: ApplicationStatus, position?: number | null): Board {
  let moving: Application | undefined;
  for (const col of board.columns) {
    const found = col.items.find((a) => a.id === id);
    if (found) moving = found;
  }
  if (!moving) return board;
  const updated: Application = {
    ...moving,
    status,
    board_position: position ?? moving.board_position,
  };
  const hasTarget = board.columns.some((c) => c.status === status);
  const columns = board.columns.map((col) => {
    const items = col.items.filter((a) => a.id !== id);
    if (col.status === status) items.push(updated);
    items.sort((a, b) => a.board_position - b.board_position);
    return { ...col, items };
  });
  if (!hasTarget) columns.push({ status, label: STATUS_LABELS[status], items: [updated] });
  return { columns };
}

function patchApplicationEverywhere(qc: QueryClient, id: number, patch: Partial<Application>) {
  qc.setQueriesData<Application[]>({ queryKey: ["applications", "list"] }, (prev) =>
    Array.isArray(prev) ? prev.map((a) => (a.id === id ? { ...a, ...patch } : a)) : prev,
  );
  qc.setQueryData<ApplicationDetail>(appKeys.detail(id), (prev) => (prev ? { ...prev, ...patch } : prev));
}

function invalidateAfterMove(qc: QueryClient, id: number) {
  qc.invalidateQueries({ queryKey: appKeys.all });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["interviews"] });
  qc.invalidateQueries({ queryKey: ["audit", "application", id] });
}

// ---------------------------------------------------------------- mutations
/**
 * POST /applications/{id}/status with an optimistic update of the board, lists and detail.
 * Rolls back and shows a toast when the server rejects the move.
 */
export function useMoveApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MoveInput) => {
      const res = await api.post<Application>(`/applications/${input.id}/status`, {
        status: input.status,
        board_position: input.board_position ?? undefined,
        note: input.note || undefined,
      });
      if (input.status === "rejected" && input.rejection_reason) {
        await api.patch<ApplicationDetail>(`/applications/${input.id}`, { rejection_reason: input.rejection_reason });
      }
      return res;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: appKeys.all });
      const prevBoard = qc.getQueryData<Board>(appKeys.board);
      const prevLists = qc.getQueriesData<Application[]>({ queryKey: ["applications", "list"] });
      const prevDetail = qc.getQueryData<ApplicationDetail>(appKeys.detail(input.id));
      if (prevBoard) qc.setQueryData<Board>(appKeys.board, applyMoveToBoard(prevBoard, input.id, input.status, input.board_position));
      patchApplicationEverywhere(qc, input.id, {
        status: input.status,
        ...(input.board_position != null ? { board_position: input.board_position } : {}),
        ...(input.rejection_reason ? { rejection_reason: input.rejection_reason } : {}),
      });
      return { prevBoard, prevLists, prevDetail };
    },
    onError: (err, input, ctx) => {
      if (ctx?.prevBoard) qc.setQueryData(appKeys.board, ctx.prevBoard);
      ctx?.prevLists?.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.prevDetail) qc.setQueryData(appKeys.detail(input.id), ctx.prevDetail);
      toast.error(`Couldn't move to ${STATUS_LABELS[input.status]}`, { description: errorMessage(err) });
    },
    onSettled: (_data, _err, input) => invalidateAfterMove(qc, input.id),
  });
}

export function useUpdateApplication(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplicationUpdateIn) => api.patch<ApplicationDetail>(`/applications/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(appKeys.detail(id), data);
      qc.invalidateQueries({ queryKey: ["applications", "list"] });
      qc.invalidateQueries({ queryKey: appKeys.board });
    },
  });
}

export function useDeleteApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/applications/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: appKeys.detail(id) });
      qc.invalidateQueries({ queryKey: appKeys.all });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
