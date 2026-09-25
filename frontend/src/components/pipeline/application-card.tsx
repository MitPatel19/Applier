"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BellRing, CalendarClock, Check, Clock, ExternalLink, MoreHorizontal, Rocket } from "lucide-react";
import { STATUS_LABELS, STATUS_ORDER, STATUS_TONE } from "@/lib/constants";
import type { Application, ApplicationStatus } from "@/lib/types";
import { cn, formatTime, parseDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/ui/score";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/primitives";
import { DemoBadge } from "@/components/app/status";
import { dayLabel, daysSince, shortDate } from "@/components/interviews/time";
import { READY_STATUSES, STATUS_ICON, SUBSTAGE_LABELS, TONE_COLOR, type Lane } from "./lanes";

export function ReadinessMeter({ summary, className }: { summary: Application["readiness_summary"]; className?: string }) {
  const ok = summary.ok ?? 0;
  const warn = summary.warning ?? 0;
  const missing = summary.missing ?? 0;
  const total = ok + warn + missing;
  if (!total) return null;
  const parts = [
    ok ? `${ok} ready` : null,
    warn ? `${warn} to check` : null,
    missing ? `${missing} missing` : null,
  ].filter(Boolean);
  return (
    <div className={className}>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-border/70" aria-hidden>
        <span className="h-full bg-success" style={{ width: `${(ok / total) * 100}%` }} />
        <span className="h-full bg-warning" style={{ width: `${(warn / total) * 100}%` }} />
        <span className="h-full bg-danger" style={{ width: `${(missing / total) * 100}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted">
        <span className="sr-only">Readiness: </span>
        {parts.join(" · ")}
      </p>
    </div>
  );
}

function Indicator({ icon, children, tone }: { icon: React.ReactNode; children: React.ReactNode; tone?: "warning" | "danger" | "primary" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] [&_svg]:size-3",
        tone === "danger" ? "font-medium text-danger" : tone === "warning" ? "font-medium text-warning" : tone === "primary" ? "font-medium text-primary" : "text-muted",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Menu with Open, Review & Apply and a "Move to…" list — the keyboard/touch alternative to dragging. */
export function ApplicationMenu({
  app,
  onMove,
  triggerClassName,
}: {
  app: Application;
  onMove: (status: ApplicationStatus) => void;
  triggerClassName?: string;
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("size-7", triggerClassName)}
          aria-label={`Actions for ${app.job_title} at ${app.company_name}`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[min(70vh,32rem)] w-60 overflow-y-auto scrollbar-thin">
        <DropdownMenuItem onSelect={() => router.push(`/applications/${app.id}`)}>
          <ArrowRight /> Open application
        </DropdownMenuItem>
        {READY_STATUSES.includes(app.status) && (
          <DropdownMenuItem onSelect={() => router.push(`/applications/${app.id}/prepare`)}>
            <Rocket /> Review & Apply
          </DropdownMenuItem>
        )}
        {app.url && (
          <DropdownMenuItem onSelect={() => window.open(app.url ?? "", "_blank", "noopener,noreferrer")}>
            <ExternalLink /> View posting
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Move to…</DropdownMenuLabel>
        {STATUS_ORDER.map((s) => {
          const Icon = STATUS_ICON[s];
          const current = s === app.status;
          return (
            <DropdownMenuItem
              key={s}
              disabled={current}
              onSelect={() => onMove(s)}
              destructive={s === "rejected"}
              aria-current={current ? "true" : undefined}
            >
              <Icon style={{ color: s === "rejected" ? undefined : TONE_COLOR[STATUS_TONE[s]] }} />
              <span className="flex-1">{STATUS_LABELS[s]}</span>
              {current && <Check className="text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Kanban card. Presentational: the board wraps it with sortable behaviour and passes a drag `handle`. */
export function ApplicationCard({
  app,
  lane,
  now,
  onMove,
  handle,
  dragging,
  overlay,
  className,
}: {
  app: Application;
  lane?: Lane;
  now: number;
  onMove: (status: ApplicationStatus) => void;
  handle?: React.ReactNode;
  dragging?: boolean;
  overlay?: boolean;
  className?: string;
}) {
  const showSubstage = lane && lane.statuses.length > 1 && SUBSTAGE_LABELS[app.status] && app.status !== lane.primary;
  const applied = daysSince(app.applied_at, now);
  const added = daysSince(app.date_discovered ?? app.created_at, now);
  const interviewAt = parseDate(app.next_interview_at);
  const interviewSoon = interviewAt ? interviewAt.getTime() - now < 2 * 86_400_000 && interviewAt.getTime() > now - 3_600_000 : false;
  const followAt = parseDate(app.next_follow_up_at);
  const followOverdue = followAt ? followAt.getTime() < now : false;
  const followDays = followAt ? Math.ceil((followAt.getTime() - now) / 86_400_000) : null;
  const isReady = READY_STATUSES.includes(app.status);

  return (
    <article
      className={cn(
        "group/card relative rounded-xl border border-border bg-surface p-3 shadow-card transition-[box-shadow,border-color,transform,opacity] duration-150",
        "hover:border-border-strong hover:shadow-pop",
        dragging && "opacity-40",
        overlay && "rotate-[1.5deg] cursor-grabbing border-primary/50 shadow-pop ring-2 ring-primary/30",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {handle}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted">{app.company_name}</p>
          <h3 className="mt-0.5 text-sm font-semibold leading-snug text-text">
            <Link
              href={`/applications/${app.id}`}
              className="line-clamp-2 rounded-sm hover:text-primary focus-visible:outline-2"
              onPointerDown={(e) => e.stopPropagation()}
              draggable={false}
            >
              {app.job_title}
            </Link>
          </h3>
        </div>
        <div className="flex shrink-0 items-start gap-0.5">
          <ScoreRing score={app.match_score} size={34} stroke={3.5} />
          {!overlay && <ApplicationMenu app={app} onMove={onMove} triggerClassName="-mr-1" />}
        </div>
      </div>

      {(showSubstage || app.is_demo || app.status === "rejected") && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {showSubstage && (
            <Badge tone={STATUS_TONE[app.status]} size="xs" dot>
              {SUBSTAGE_LABELS[app.status]}
            </Badge>
          )}
          {app.status === "rejected" && app.rejection_reason && (
            <Badge tone="danger" size="xs" className="max-w-full truncate">
              {app.rejection_reason}
            </Badge>
          )}
          {app.is_demo && <DemoBadge />}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {applied !== null ? (
          <Indicator icon={<Clock />}>{applied === 0 ? "Applied today" : `Applied ${applied}d ago`}</Indicator>
        ) : added !== null ? (
          <Indicator icon={<Clock />}>{added === 0 ? "Added today" : `Added ${added}d ago`}</Indicator>
        ) : null}
        {interviewAt && (
          <Indicator icon={<CalendarClock />} tone={interviewSoon ? "warning" : "primary"}>
            {dayLabel(interviewAt, now)} · {formatTime(interviewAt)}
          </Indicator>
        )}
        {followAt && (
          <Indicator icon={<BellRing />} tone={followOverdue ? "danger" : followDays !== null && followDays <= 1 ? "warning" : undefined}>
            {followOverdue ? "Follow-up overdue" : followDays !== null && followDays <= 0 ? "Follow up today" : `Follow up ${shortDate(followAt)}`}
          </Indicator>
        )}
      </div>

      {isReady && !overlay && (
        <div className="mt-3 space-y-2.5 border-t border-border pt-2.5">
          <ReadinessMeter summary={app.readiness_summary} />
          <Button asChild size="xs" variant={app.status === "ready" ? "primary" : "soft"} className="w-full">
            <Link href={`/applications/${app.id}/prepare`} onPointerDown={(e) => e.stopPropagation()}>
              <Rocket /> Review & Apply
            </Link>
          </Button>
        </div>
      )}
    </article>
  );
}
