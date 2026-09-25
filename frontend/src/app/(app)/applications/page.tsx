"use client";

import * as React from "react";
import Link from "next/link";
import { Briefcase, CalendarClock, History, Kanban, Search, Send, Sparkles, Trophy, X } from "lucide-react";
import type { Application } from "@/lib/types";
import { useBoard } from "@/lib/queries/applications";
import { cn, pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/layout";
import { Switch } from "@/components/ui/primitives";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useNow } from "@/components/interviews/time";
import { ALL_LANES, HIDDEN_BY_DEFAULT, INTERVIEW_STATUSES, MAIN_LANES, flattenBoard } from "@/components/pipeline/lanes";
import { PipelineBoard, PipelineStageList, useLaneItems } from "@/components/pipeline/pipeline-board";
import { useStatusFlow } from "@/components/pipeline/status-flow";

type MatchFilter = "all" | "80" | "65" | "unscored";
type FocusFilter = "all" | "interview" | "follow_up" | "demo_hidden";

const ALWAYS = () => true;

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Loading pipeline">
      <div className="hidden gap-3.5 overflow-hidden md:flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[18rem] shrink-0 space-y-2.5 rounded-2xl border border-border bg-bg-subtle/70 p-3">
            <Skeleton className="h-5 w-2/5" />
            {Array.from({ length: 3 - (i % 2) }).map((__, j) => (
              <div key={j} className="space-y-2 rounded-xl border border-border bg-surface p-3">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="space-y-3 md:hidden">
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function PipelineStats({ apps }: { apps: Application[] }) {
  const inFlight = apps.filter((a) => ["applied", "confirmed", "recruiter_contacted"].includes(a.status)).length;
  const interviewing = apps.filter((a) => INTERVIEW_STATUSES.includes(a.status)).length;
  const ready = apps.filter((a) => a.status === "ready" || a.status === "reviewing").length;
  const offers = apps.filter((a) => a.status === "offer").length;
  const items = [
    { label: "Ready for review", value: ready, icon: Sparkles, color: "var(--primary)" },
    { label: "Awaiting response", value: inFlight, icon: Send, color: "var(--accent)" },
    { label: "Interviewing", value: interviewing, icon: CalendarClock, color: "var(--warning)" },
    { label: "Offers", value: offers, icon: Trophy, color: "var(--success)" },
  ];
  return (
    <dl className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-card">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4"
            style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
            aria-hidden
          >
            <Icon />
          </span>
          <div className="min-w-0">
            <dt className="truncate text-[11px] text-muted">{label}</dt>
            <dd className="tabular text-lg font-semibold leading-tight">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

export default function PipelinePage() {
  const { data: board, isLoading, error, refetch } = useBoard();
  const flow = useStatusFlow();
  const now = useNow();
  const [showAll, setShowAll] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [match, setMatch] = React.useState<MatchFilter>("all");
  const [focus, setFocus] = React.useState<FocusFilter>("all");
  const deferredQuery = React.useDeferredValue(query);

  const lanes = showAll ? ALL_LANES : MAIN_LANES;
  const filter = React.useCallback(
    (a: Application) => {
      const q = deferredQuery.trim().toLowerCase();
      if (q && !`${a.company_name} ${a.job_title} ${a.location ?? ""}`.toLowerCase().includes(q)) return false;
      if (match === "80" && (a.match_score ?? -1) < 80) return false;
      if (match === "65" && (a.match_score ?? -1) < 65) return false;
      if (match === "unscored" && a.match_score !== null) return false;
      if (focus === "interview" && !a.next_interview_at) return false;
      if (focus === "follow_up" && !a.next_follow_up_at) return false;
      if (focus === "demo_hidden" && a.is_demo) return false;
      return true;
    },
    [deferredQuery, match, focus],
  );
  const laneItems = useLaneItems(board, lanes, filter);
  const allItems = useLaneItems(board, lanes, ALWAYS);
  const laneTotals = React.useMemo(
    () => Object.fromEntries(Object.entries(allItems).map(([k, v]) => [k, v.length])),
    [allItems],
  );

  const apps = React.useMemo(() => flattenBoard(board), [board]);
  const hiddenCount = showAll ? 0 : apps.filter((a) => HIDDEN_BY_DEFAULT.includes(a.status)).length;
  const visibleCount = Object.values(laneItems).reduce((n, l) => n + l.length, 0);
  const filtered = !!deferredQuery.trim() || match !== "all" || focus !== "all";
  const hasDemo = apps.some((a) => a.is_demo);

  const clearFilters = () => {
    setQuery("");
    setMatch("all");
    setFocus("all");
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.12em] text-subtle">
            <Kanban className="size-3.5" /> Applications
          </span>
        }
        title="Pipeline"
        description="Every opportunity from saved to signed. Drag cards between stages, or use a card's menu to move it."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/applications/history">
                <History /> History
              </Link>
            </Button>
            <Button asChild>
              <Link href="/jobs">
                <Briefcase /> Find jobs
              </Link>
            </Button>
          </>
        }
      />

      {isLoading ? (
        <BoardSkeleton />
      ) : error || !board ? (
        <ErrorState error={error} title="We couldn't load your pipeline" onRetry={() => refetch()} />
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<Kanban />}
          title="No Applications Yet"
          description="Your application journey starts here. Save a job or let your agent prepare one, and it will appear on this board."
          action={
            <Button asChild>
              <Link href="/jobs">
                <Briefcase /> Find Jobs
              </Link>
            </Button>
          }
          secondaryAction={
            <Button asChild variant="ghost">
              <Link href="/jobs/recommended">See recommendations</Link>
            </Button>
          }
        />
      ) : (
        <>
          <PipelineStats apps={apps} />

          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="pipeline-search" className="sr-only">
                Search applications
              </label>
              <Input
                id="pipeline-search"
                icon={<Search />}
                placeholder="Search company, role or location"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pr-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:bg-bg-subtle hover:text-text"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <label className="sr-only" htmlFor="pipeline-match">
                Match filter
              </label>
              <Select id="pipeline-match" value={match} onChange={(e) => setMatch(e.target.value as MatchFilter)} className="sm:w-40">
                <option value="all">Any match</option>
                <option value="80">80%+ match</option>
                <option value="65">65%+ match</option>
                <option value="unscored">Not scored</option>
              </Select>
              <label className="sr-only" htmlFor="pipeline-focus">
                Show only
              </label>
              <Select id="pipeline-focus" value={focus} onChange={(e) => setFocus(e.target.value as FocusFilter)} className="sm:w-48">
                <option value="all">All applications</option>
                <option value="interview">With an interview</option>
                <option value="follow_up">With a follow-up</option>
                {hasDemo && <option value="demo_hidden">Hide demo data</option>}
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              <label htmlFor="pipeline-all" className="text-sm font-medium text-text">
                Show all stages
              </label>
              <Switch id="pipeline-all" checked={showAll} onCheckedChange={setShowAll} />
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted" aria-live="polite">
            <span>
              {filtered ? `Showing ${visibleCount} of ${apps.length}` : pluralize(visibleCount, "application")}
              {!showAll && hiddenCount > 0 && (
                <>
                  {" · "}
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => setShowAll(true)}>
                    {hiddenCount} in other stages
                  </button>
                </>
              )}
            </span>
            {filtered && (
              <button type="button" onClick={clearFilters} className="font-medium text-primary hover:underline">
                Clear filters
              </button>
            )}
          </div>

          {filtered && visibleCount === 0 ? (
            <EmptyState
              compact
              icon={<Search />}
              title="No applications match"
              description="Try a different search or clear the filters to see your whole pipeline."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <PipelineBoard board={board} lanes={lanes} laneItems={laneItems} laneTotals={laneTotals} now={now} flow={flow} />
              </div>
              <div className={cn("md:hidden")}>
                <PipelineStageList lanes={lanes} laneItems={laneItems} now={now} flow={flow} />
              </div>
            </>
          )}
        </>
      )}
      {flow.element}
    </div>
  );
}
