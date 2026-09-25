"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { ArrowLeft, ArrowRight, CalendarClock, Clock, EyeOff, Info, SearchX, TriangleAlert } from "lucide-react";
import { useJob } from "@/lib/queries/jobs";
import type { JobDetail } from "@/lib/types";
import { daysUntil, formatDate, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton, SkeletonCard } from "@/components/ui/feedback";
import { JobMeta } from "@/components/app/job-card";
import { MatchBreakdown } from "@/components/app/match-breakdown";
import { DemoBadge, SourceList, StatusBadge } from "@/components/app/status";
import { JobMoreActions, SaveJobButton } from "@/components/jobs/job-actions";
import { CompanyIntelPanel, JobDescription, RequirementsCard, SourcePostings, VerdictCard } from "@/components/jobs/job-sections";
import { PrepareApplicationButton } from "@/components/jobs/prepare-application";

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading job">
      <Skeleton className="h-4 w-24" />
      <div className="mt-5 space-y-3" aria-hidden>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-12 w-52" />
          <Skeleton className="h-12 w-24" />
        </div>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={6} />
          <SkeletonCard lines={5} />
        </div>
        <div className="space-y-6">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function JobHeader({ job }: { job: JobDetail }) {
  const dl = daysUntil(job.deadline);
  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="bg-aurora pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <div className="relative p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          {job.is_demo && <DemoBadge />}
          {job.is_hidden && (
            <Badge tone="neutral" size="xs">
              <EyeOff className="size-3" aria-hidden /> Hidden
            </Badge>
          )}
          {job.flags.map((f) => (
            <Badge key={f.code} tone={f.severity === "warning" ? "warning" : "info"} size="xs">
              {f.severity === "warning" ? <TriangleAlert className="size-3" aria-hidden /> : <Info className="size-3" aria-hidden />}
              {f.label}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 text-h1 font-semibold sm:text-[2rem] sm:leading-tight">{job.title}</h1>
        <p className="mt-1 text-base">
          {job.company_id ? (
            <Link href={`/companies/${job.company_id}`} className="font-medium text-primary hover:underline">
              {job.company_name}
            </Link>
          ) : (
            <span className="font-medium">{job.company_name}</span>
          )}
          {job.department && <span className="text-muted"> · {job.department}</span>}
        </p>
        <JobMeta job={job} className="mt-4" />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5 text-subtle" aria-hidden />
            Posted {relativeTime(job.posted_at ?? job.first_seen_at)}
          </span>
          {job.deadline && (
            <span className={dl !== null && dl <= 5 && dl >= 0 ? "inline-flex items-center gap-1.5 font-medium text-warning" : "inline-flex items-center gap-1.5"}>
              <CalendarClock className="size-3.5" aria-hidden />
              {dl !== null && dl < 0 ? `Deadline passed (${formatDate(job.deadline)})` : `Apply by ${formatDate(job.deadline)}`}
            </span>
          )}
          <span className="text-sm">
            <SourceList sources={job.sources} />
          </span>
        </div>

        {job.application_id && job.application_status && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/80 px-4 py-3">
            <span className="text-sm text-muted">Your application:</span>
            <StatusBadge status={job.application_status} />
            <Link href={`/applications/${job.application_id}`} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View application <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        )}

        <div className="mt-6 hidden flex-wrap items-center gap-2 sm:flex">
          <PrepareApplicationButton job={job} />
          <SaveJobButton job={job} className="h-12 px-5" />
          <JobMoreActions job={job} />
        </div>
        <div className="mt-5 flex items-center gap-2 sm:hidden">
          <SaveJobButton job={job} className="flex-1" />
          <JobMoreActions job={job} />
        </div>
        {!job.application_id && (
          <p className="mt-3 hidden text-caption text-subtle sm:block">
            Your agent tailors a resume, drafts a cover letter and answers — you review and approve before anything is sent.
          </p>
        )}
      </div>
    </header>
  );
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const job = useJob(Number.isFinite(id) && id > 0 ? id : null);

  if (!Number.isFinite(id) || id <= 0 || (job.error instanceof ApiError && job.error.status === 404)) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="We couldn't find this job"
        description="It may have been removed, or the link is incorrect. Your other jobs are safe."
        action={
          <Button asChild>
            <Link href="/jobs">Back to jobs</Link>
          </Button>
        }
      />
    );
  }
  if (job.isLoading) return <DetailSkeleton />;
  if (job.isError || !job.data) {
    return (
      <ErrorState
        error={job.error}
        title="We couldn't load this job"
        onRetry={() => job.refetch()}
        onContinue={() => router.push("/jobs")}
        continueLabel="Back to jobs"
      />
    );
  }

  const j = job.data;
  return (
    <div className="pb-20 sm:pb-0">
      <Link href="/jobs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Jobs
      </Link>

      <div className="animate-rise">
        <JobHeader job={j} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <VerdictCard job={j} />
          {j.full_match && (
            <Card>
              <CardHeader>
                <CardTitle>Match analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <MatchBreakdown match={j.full_match} />
                <p className="mt-4 text-caption text-subtle">
                  Tap any category to see exactly how it was scored. Adjust weights in{" "}
                  <Link href="/settings" className="text-primary hover:underline">
                    Settings
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          )}
          <RequirementsCard job={j} />
          <JobDescription text={j.description} />
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Company and sources">
          <CompanyIntelPanel company={j.company} companyId={j.company_id} companyName={j.company_name} />
          <SourcePostings sources={j.sources} merged={j.duplicates_merged} />
        </aside>
      </div>

      {/* Sticky mobile action bar (sits above the app's bottom tab bar) */}
      <div className="glass fixed inset-x-0 bottom-[calc(3.85rem+env(safe-area-inset-bottom))] z-30 border-t border-border px-4 py-3 sm:hidden">
        <PrepareApplicationButton job={j} size="md" className="w-full" />
      </div>
    </div>
  );
}
