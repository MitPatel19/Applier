"use client";

import * as React from "react";
import { STATUS_LABELS } from "@/lib/constants";
import type { Application, ApplicationStatus } from "@/lib/types";
import { useMoveApplication } from "@/lib/queries/applications";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/input";
import { ScheduleInterviewDialog, kindForStatus } from "@/components/interviews/schedule-interview-dialog";
import { isInterviewStatus } from "./lanes";

type MovableApp = Pick<Application, "id" | "company_name" | "job_title" | "status" | "board_position">;

const COMMON_REASONS = [
  "No response after interview",
  "Position filled",
  "Looking for more experience",
  "Skills mismatch",
  "Role put on hold",
  "Location / work authorization",
  "Salary mismatch",
];

export interface StatusFlow {
  /** Request a status change (and optionally a new board position). Opens dialogs when needed. */
  request: (app: MovableApp, status: ApplicationStatus, opts?: { board_position?: number; silent?: boolean }) => void;
  /** Dialogs + screen-reader live region. Render once. */
  element: React.ReactNode;
  /** Latest polite announcement (also rendered in `element`). */
  announce: (message: string) => void;
}

/**
 * Centralizes every status change in the product (board drag/drop, "Move to…" menus, detail page).
 * - Rejected → asks for an optional reason first.
 * - Interview stages → offers to schedule the interview right away.
 * - Everything else → optimistic move + toast with Undo.
 */
export function useStatusFlow(): StatusFlow {
  const move = useMoveApplication();
  const [message, setMessage] = React.useState("");
  const [rejecting, setRejecting] = React.useState<{ app: MovableApp; position?: number } | null>(null);
  const [reasonChoice, setReasonChoice] = React.useState("");
  const [reasonText, setReasonText] = React.useState("");
  const [scheduling, setScheduling] = React.useState<{ app: MovableApp; status: ApplicationStatus } | null>(null);

  const announce = React.useCallback((m: string) => {
    setMessage("");
    window.requestAnimationFrame(() => setMessage(m));
  }, []);

  const commit = React.useCallback(
    (app: MovableApp, status: ApplicationStatus, position?: number, extra?: { note?: string; rejection_reason?: string }, silent?: boolean) => {
      const prevStatus = app.status;
      const prevPosition = app.board_position;
      const changed = prevStatus !== status;
      move.mutate(
        { id: app.id, status, board_position: position, note: extra?.note, rejection_reason: extra?.rejection_reason },
        {
          onSuccess: () => {
            if (!changed) {
              announce(`${app.job_title} at ${app.company_name} reordered.`);
              return;
            }
            announce(`${app.job_title} at ${app.company_name} moved to ${STATUS_LABELS[status]}.`);
            if (!silent) {
              toast.success(`Moved to ${STATUS_LABELS[status]}`, {
                description: `${app.company_name} · ${app.job_title}`,
                action: {
                  label: "Undo",
                  onClick: () => move.mutate({ id: app.id, status: prevStatus, board_position: prevPosition }),
                },
              });
            }
            if (isInterviewStatus(status) && !isInterviewStatus(prevStatus)) {
              setScheduling({ app, status });
            }
          },
        },
      );
    },
    [move, announce],
  );

  const request = React.useCallback<StatusFlow["request"]>(
    (app, status, opts) => {
      if (status === app.status && opts?.board_position === undefined) return;
      if (status === "rejected" && app.status !== "rejected") {
        setReasonChoice("");
        setReasonText("");
        setRejecting({ app, position: opts?.board_position });
        return;
      }
      commit(app, status, opts?.board_position, undefined, opts?.silent);
    },
    [commit],
  );

  const reason = (reasonChoice === "__other" ? reasonText : reasonChoice || reasonText).trim();

  const element = (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {message}
      </div>
      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(o) => {
          if (!o) {
            setRejecting(null);
            if (rejecting) announce("Move cancelled.");
          }
        }}
        title="Mark as rejected?"
        description={
          rejecting ? (
            <>
              <span className="font-medium text-text">{rejecting.app.company_name}</span> — {rejecting.app.job_title}. Adding a reason is
              optional, but it helps Applier spot patterns in your analytics.
            </>
          ) : null
        }
        confirmLabel="Move to Rejected"
        tone="danger"
        onConfirm={() => {
          if (!rejecting) return;
          commit(rejecting.app, "rejected", rejecting.position, reason ? { note: reason, rejection_reason: reason } : undefined);
          setRejecting(null);
        }}
      >
        <div className="space-y-3">
          <Field label="Reason (optional)">
            <Select value={reasonChoice} onChange={(e) => setReasonChoice(e.target.value)}>
              <option value="">No reason given</option>
              {COMMON_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="__other">Something else…</option>
            </Select>
          </Field>
          {reasonChoice === "__other" && (
            <Field label="Describe the reason">
              <Textarea rows={2} value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="e.g. They chose an internal candidate" />
            </Field>
          )}
        </div>
      </ConfirmDialog>
      <ScheduleInterviewDialog
        open={!!scheduling}
        onOpenChange={(o) => !o && setScheduling(null)}
        applicationId={scheduling?.app.id}
        defaultKind={kindForStatus(scheduling?.status)}
        reuseUnscheduled
        cancelLabel="Skip for now"
        title="Schedule the interview?"
        description={
          scheduling ? (
            <>
              Nice — <span className="font-medium text-text">{scheduling.app.company_name}</span> moved to {STATUS_LABELS[scheduling.status]}. Add
              the date and time so Applier can build your prep plan and remind you.
            </>
          ) : undefined
        }
      />
    </>
  );

  return { request, element, announce };
}
