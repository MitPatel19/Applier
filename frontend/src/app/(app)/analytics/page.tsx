"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Bookmark,
  CalendarCheck,
  Info,
  MessageSquareReply,
  Percent,
  Radar,
  Search,
  Send,
  Sparkles,
  Trophy,
  XCircle,
} from "lucide-react";
import { useAnalytics } from "@/lib/queries/analytics";
import { SOURCE_LABELS } from "@/lib/constants";
import type { StatTile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState, ErrorState, Skeleton, SkeletonCard } from "@/components/ui/feedback";
import { PageHeader, StatCard } from "@/components/ui/layout";
import { ActivityChart } from "@/components/analytics/activity-chart";
import { BarListCard, BreakdownCard } from "@/components/analytics/breakdown";
import { formatCount } from "@/components/analytics/chart-theme";
import { ConversionFunnel } from "@/components/analytics/funnel";
import { RANGE_OPTIONS, RangeSelect, isRangeDays, type RangeDays } from "@/components/analytics/range-select";
import { ResumePerformanceSection } from "@/components/analytics/resume-performance";

function tileIcon(key: string) {
  const k = key.toLowerCase();
  if (k.includes("reject")) return <XCircle />;
  if (k.includes("offer")) return <Trophy />;
  if (k.includes("interview_rate")) return <Percent />;
  if (k.includes("interview")) return <CalendarCheck />;
  if (k.includes("response")) return <MessageSquareReply />;
  if (k.includes("saved")) return <Bookmark />;
  if (k.includes("discover")) return <Radar />;
  if (k.includes("appl")) return <Send />;
  return <BarChart3 />;
}

function formatTileValue(t: StatTile) {
  if (t.unit === "%") return `${Number.isInteger(t.value) ? t.value : t.value.toFixed(1)}%`;
  return `${formatCount(t.value)}${t.unit && t.unit !== "%" ? ` ${t.unit}` : ""}`;
}

function TileDelta({ tile, rangeDays }: { tile: StatTile; rangeDays: number }) {
  const period = `vs previous ${rangeDays} days`;
  if (tile.delta === null || tile.delta === undefined) return <>{tile.hint ?? period}</>;
  if (tile.delta === 0) return <>No change {period}</>;
  const up = tile.delta > 0;
  const upIsGood = !tile.key.toLowerCase().includes("reject");
  const good = up === upIsGood;
  const amount = Math.abs(Math.round(tile.delta * 10) / 10);
  const unit = tile.unit === "%" ? " pts" : "";
  return (
    <>
      <span className={cn("font-medium", good ? "text-success" : "text-danger")}>
        <span aria-hidden>{up ? "▲" : "▼"}</span>
        <span className="sr-only">{up ? "Up" : "Down"}</span> {amount}
        {unit}
      </span>
      <span>{period}</span>
    </>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading analytics">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
        <SkeletonCard lines={8} />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function AnalyticsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = Number(params.get("range"));
  const range: RangeDays = isRangeDays(raw) ? raw : 30;

  const setRange = (next: RangeDays) => {
    const sp = new URLSearchParams(params.toString());
    if (next === 30) sp.delete("range");
    else sp.set("range", String(next));
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { data, isLoading, error, refetch, isFetching, isPlaceholderData } = useAnalytics(range);
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label ?? `${range} days`;

  const isEmpty = React.useMemo(() => {
    if (!data) return false;
    const tilesZero = data.tiles.every((t) => !t.value);
    const seriesZero = data.timeseries.every((p) => !p.discovered && !p.applied && !p.interviews);
    const funnelZero = data.funnel.every((f) => !f.count);
    return tilesZero && seriesZero && funnelZero;
  }, [data]);

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.12em] text-subtle">
            <BarChart3 className="size-3.5" aria-hidden /> Insights
          </span>
        }
        title="Application analytics"
        description="See what's working in your search — where interviews come from, how your pipeline converts, and which resumes perform best."
        actions={<RangeSelect value={range} onChange={setRange} />}
      />

      <p className="sr-only" aria-live="polite">
        {isFetching ? "Updating analytics…" : data ? `Showing analytics for the last ${rangeLabel}.` : ""}
      </p>

      {isLoading ? (
        <AnalyticsSkeleton />
      ) : error && !data ? (
        <ErrorState error={error} title="We couldn't load your analytics" onRetry={() => refetch()} />
      ) : !data ? null : isEmpty ? (
        <div className="space-y-10">
          <EmptyState
            icon={<Sparkles />}
            title={range === 365 ? "No activity yet" : `No activity in the last ${rangeLabel}`}
            description="Analytics fill in as your Career Agent discovers jobs and you send applications. Start a search, or load sample data to explore how this page works."
            action={
              <Button asChild>
                <Link href="/jobs/search">
                  <Search /> Start a job search
                </Link>
              </Button>
            }
            secondaryAction={
              <Button asChild variant="secondary">
                <Link href="/settings?tab=demo">Load sample data</Link>
              </Button>
            }
          />
          <ResumePerformanceSection />
        </div>
      ) : (
        <div className={cn("space-y-8 transition-opacity", isPlaceholderData && "opacity-60")} aria-busy={isPlaceholderData}>
          {data.sample_size_note && (
            <Callout tone="info" icon={<Info />} title="Small sample size">
              {data.sample_size_note}
            </Callout>
          )}

          <section aria-labelledby="kpi-heading">
            <h2 id="kpi-heading" className="sr-only">
              Key numbers for the last {rangeLabel}
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {data.tiles.map((t) => (
                <StatCard
                  key={t.key}
                  label={t.label}
                  value={formatTileValue(t)}
                  icon={tileIcon(t.key)}
                  hint={<TileDelta tile={t} rangeDays={range} />}
                />
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <ActivityChart data={data.timeseries} rangeDays={range} className="lg:col-span-2" />
            <ConversionFunnel steps={data.funnel} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <BreakdownCard
              title="Most successful sources"
              description="Where your applications turn into interviews."
              labelHeader="Source"
              rows={data.by_source}
              labelFor={(l) => SOURCE_LABELS[l] ?? l}
              emptyText="Apply to a few jobs to compare sources."
            />
            <BreakdownCard
              title="Most successful job titles"
              description="Roles with the best application → interview conversion."
              labelHeader="Job title"
              rows={data.by_title}
              emptyText="Apply to a few jobs to compare job titles."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <BarListCard
              title="Status distribution"
              description="Where your applications are right now."
              items={data.status_distribution.map((s) => ({ key: s.status, label: s.label, count: s.count }))}
              emptyTitle="No applications yet"
              emptyText="Your pipeline breakdown will appear here."
            />
            <BarListCard
              title="Rejection reasons"
              description="Only shown when a reason was known or recorded."
              items={data.rejection_reasons.map((r) => ({ label: r.reason, count: r.count }))}
              emptyTitle="No known reasons"
              emptyText="When a rejection includes a reason, we'll summarize patterns here."
            />
          </div>

          <ResumePerformanceSection />
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <React.Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsContent />
    </React.Suspense>
  );
}
