"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, CalendarClock, MapPin, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { JOB_TYPE_LABELS, WORK_ARRANGEMENT_LABELS } from "@/lib/constants";
import type { Job } from "@/lib/types";
import { cn, daysUntil, formatSalary, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/ui/score";
import { Tooltip } from "@/components/ui/primitives";
import { DemoBadge, SourceList, StatusBadge, TierBadge } from "./status";

export function useToggleSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, save }: { id: number; save: boolean }) =>
      save ? api.post(`/jobs/${id}/save`) : api.del(`/jobs/${id}/save`),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(v.save ? "Saved for later" : "Removed from saved jobs");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function JobMeta({ job, className }: { job: Pick<Job, "location" | "work_arrangement" | "employment_type" | "salary_min" | "salary_max" | "salary_period" | "currency" | "deadline">; className?: string }) {
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period, job.currency);
  const dl = daysUntil(job.deadline);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted", className)}>
      {job.location && (
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-3.5 text-subtle" /> {job.location}
        </span>
      )}
      {job.work_arrangement && <span>{WORK_ARRANGEMENT_LABELS[job.work_arrangement]}</span>}
      {job.employment_type && <span>{JOB_TYPE_LABELS[job.employment_type] ?? job.employment_type}</span>}
      <span className="inline-flex items-center gap-1.5">
        <Wallet className="size-3.5 text-subtle" /> {salary ?? <span className="text-subtle">Salary not listed</span>}
      </span>
      {dl !== null && dl >= 0 && dl <= 14 && (
        <span className={cn("inline-flex items-center gap-1.5", dl <= 5 && "font-medium text-warning")}>
          <CalendarClock className="size-3.5" /> {dl === 0 ? "Closes today" : `Closes in ${dl}d`}
        </span>
      )}
    </div>
  );
}

/** Primary job card used in lists (Discover, Recommended, Saved, Dashboard). */
export function JobCard({ job, className }: { job: Job; className?: string }) {
  const toggle = useToggleSave();
  return (
    <article
      className={cn(
        "group relative rounded-xl border border-border bg-surface p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop sm:p-5",
        !job.is_seen && "before:absolute before:left-0 before:top-5 before:h-8 before:w-[3px] before:rounded-r-full before:bg-primary",
        className,
      )}
    >
      <div className="flex gap-4">
        <ScoreRing score={job.match?.overall} size={54} className="mt-0.5 hidden sm:inline-flex" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-snug">
                <Link href={`/jobs/${job.id}`} className="after:absolute after:inset-0 hover:text-primary focus-visible:outline-none">
                  {job.title}
                </Link>
              </h3>
              <p className="mt-0.5 text-sm text-muted">{job.company_name}</p>
            </div>
            <div className="relative z-10 flex shrink-0 items-center gap-1">
              <ScoreRing score={job.match?.overall} size={42} stroke={4} className="sm:hidden" />
              <Tooltip content={job.is_saved ? "Remove from saved" : "Save for later"}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={job.is_saved ? "Remove from saved" : "Save job"}
                  aria-pressed={job.is_saved}
                  onClick={() => toggle.mutate({ id: job.id, save: !job.is_saved })}
                >
                  {job.is_saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
                </Button>
              </Tooltip>
            </div>
          </div>

          <JobMeta job={job} className="mt-3" />

          {job.match?.recommendation && (
            <p className="mt-3 flex items-start gap-2 text-sm text-muted">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span className="line-clamp-2">{job.match.recommendation}</span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {job.match && <TierBadge tier={job.match.tier} size="xs" />}
            {job.application_status && <StatusBadge status={job.application_status} size="xs" />}
            {job.flags
              .filter((f) => f.severity === "warning")
              .slice(0, 2)
              .map((f) => (
                <Badge key={f.code} tone="warning" size="xs">
                  {f.label}
                </Badge>
              ))}
            {job.is_demo && <DemoBadge />}
            <span className="ml-auto text-xs">
              <SourceList sources={job.sources} />
              <span className="text-subtle"> · {relativeTime(job.posted_at ?? job.first_seen_at)}</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
