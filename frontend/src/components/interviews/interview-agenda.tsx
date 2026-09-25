"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarPlus,
  Clock,
  MapPin,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { INTERVIEW_KIND_LABELS } from "@/lib/constants";
import type { Interview } from "@/lib/types";
import { useDeleteInterview, useUpdateInterview } from "@/lib/queries/interviews";
import { cn, formatTime, parseDate } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/primitives";
import { ScheduleInterviewDialog } from "./schedule-interview-dialog";
import { countdown, dayLabel } from "./time";

export const OUTCOME_META: Record<NonNullable<Interview["outcome"]>, { label: string; tone: BadgeTone }> = {
  pending: { label: "Awaiting outcome", tone: "info" },
  passed: { label: "Passed", tone: "success" },
  failed: { label: "Not advanced", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function OutcomeSelect({ interview, className }: { interview: Interview; className?: string }) {
  const update = useUpdateInterview();
  const id = React.useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        Outcome for {INTERVIEW_KIND_LABELS[interview.kind]} at {interview.company_name}
      </label>
      <Select
        id={id}
        value={interview.outcome ?? "pending"}
        disabled={update.isPending}
        className="h-8 w-auto text-xs"
        onChange={(e) =>
          update.mutate(
            { id: interview.id, body: { outcome: e.target.value as NonNullable<Interview["outcome"]> } },
            {
              onSuccess: () => toast.success("Outcome saved"),
              onError: (err) => toast.error(errorMessage(err)),
            },
          )
        }
      >
        {(Object.keys(OUTCOME_META) as NonNullable<Interview["outcome"]>[]).map((o) => (
          <option key={o} value={o}>
            {OUTCOME_META[o].label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function InterviewActions({ interview }: { interview: Interview }) {
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const del = useDeleteInterview();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${interview.company_name} interview`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil /> Edit details
          </DropdownMenuItem>
          {interview.scheduled_at && (
            <DropdownMenuItem asChild>
              <a href={api.url(`/interviews/${interview.id}/ics`)} download>
                <CalendarPlus /> Add to calendar (.ics)
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/applications/${interview.application_id}`}>
              <ArrowRight /> Open application
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setDeleting(true)}>
            <Trash2 /> Delete interview
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ScheduleInterviewDialog open={editing} onOpenChange={setEditing} interview={interview} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this interview?"
        description="Its preparation plan and practice history will be removed."
        confirmLabel="Delete"
        tone="danger"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(
            { id: interview.id, applicationId: interview.application_id },
            {
              onSuccess: () => {
                setDeleting(false);
                toast.success("Interview deleted");
              },
              onError: (err) => toast.error(errorMessage(err)),
            },
          )
        }
      />
    </>
  );
}

export function InterviewRow({ interview, now, past }: { interview: Interview; now: number; past?: boolean }) {
  const d = parseDate(interview.scheduled_at);
  const cd = countdown(interview.scheduled_at, now, interview.duration_minutes ?? 60);
  const startsSoon = d ? d.getTime() - now < 30 * 60_000 && !cd?.past : false;
  return (
    <article
      className={cn(
        "group relative flex gap-3 rounded-xl border bg-surface p-3.5 shadow-card transition-colors hover:border-border-strong sm:gap-4 sm:p-4",
        cd?.live ? "border-success/40" : "border-border",
      )}
    >
      <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-bg-subtle px-1 py-2 text-center">
        {d ? (
          <>
            <span className="tabular text-sm font-semibold leading-tight">{formatTime(d)}</span>
            {interview.duration_minutes && <span className="mt-0.5 text-[11px] text-subtle">{interview.duration_minutes} min</span>}
          </>
        ) : (
          <span className="text-[11px] font-medium text-subtle">Time TBD</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning" size="xs">
            {INTERVIEW_KIND_LABELS[interview.kind] ?? "Interview"}
          </Badge>
          {cd && !past && (
            <span className={cn("text-[11px] font-medium", cd.live ? "text-success" : startsSoon ? "text-warning" : "text-muted")}>
              {cd.live && <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-success align-middle" aria-hidden />}
              {cd.label}
            </span>
          )}
        </div>
        <h3 className="mt-1 text-sm font-semibold leading-snug">
          <Link href={`/interviews/${interview.id}`} className="after:absolute after:inset-0 hover:text-primary focus-visible:outline-none">
            {interview.company_name}
          </Link>
          <span className="font-normal text-muted"> · {interview.job_title}</span>
        </h3>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted">
          {past && d && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" /> {dayLabel(d, now)}
            </span>
          )}
          {interview.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {interview.location}
            </span>
          )}
          {interview.interviewers.length > 0 && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Users className="size-3 shrink-0" /> <span className="truncate">{interview.interviewers.join(", ")}</span>
            </span>
          )}
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 flex-col items-end justify-between gap-2">
        <InterviewActions interview={interview} />
        {past ? (
          <OutcomeSelect interview={interview} />
        ) : interview.meeting_url && (startsSoon || cd?.live) ? (
          <Button asChild size="xs" variant="success">
            <a href={interview.meeting_url} target="_blank" rel="noopener noreferrer">
              <Video /> Join
            </a>
          </Button>
        ) : (
          <Button asChild size="xs" variant="soft" className="hidden sm:inline-flex">
            <Link href={`/interviews/${interview.id}`}>Prepare</Link>
          </Button>
        )}
      </div>
    </article>
  );
}
