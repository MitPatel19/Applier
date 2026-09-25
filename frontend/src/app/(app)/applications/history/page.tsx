"use client";

import * as React from "react";
import Link from "next/link";
import { Briefcase, Download, History, Kanban, Search, X } from "lucide-react";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import type { ApplicationStatus } from "@/lib/types";
import { useApplications } from "@/lib/queries/applications";
import { pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/layout";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import {
  HistoryCards,
  HistoryTable,
  exportCsv,
  sortApplications,
  type SortKey,
  type SortState,
} from "@/components/applications/history-table";

function HistorySkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4" role="status" aria-label="Loading history">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border py-3 last:border-0">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="hidden h-4 w-20 md:block" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

const DEFAULT_DIR: Record<SortKey, SortState["dir"]> = {
  company: "asc",
  title: "asc",
  location: "asc",
  source: "asc",
  discovered: "desc",
  applied: "desc",
  resume: "asc",
  match: "desc",
  status: "asc",
};

export default function ApplicationHistoryPage() {
  const { data, isLoading, error, refetch } = useApplications();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<ApplicationStatus | "">("");
  const [sort, setSort] = React.useState<SortState>({ key: "discovered", dir: "desc" });
  const deferredQuery = React.useDeferredValue(query);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_DIR[key] }));

  const rows = React.useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const filtered = (data ?? []).filter((a) => {
      if (status && a.status !== status) return false;
      if (!q) return true;
      return [a.company_name, a.job_title, a.location, a.source, a.resume_name, a.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    return sortApplications(filtered, sort);
  }, [data, deferredQuery, status, sort]);

  const counts = React.useMemo(() => {
    const c: Partial<Record<ApplicationStatus, number>> = {};
    for (const a of data ?? []) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [data]);

  const filtered = !!deferredQuery.trim() || !!status;

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.12em] text-subtle">
            <History className="size-3.5" /> Applications
          </span>
        }
        title="Application History"
        description="A complete record of every job you've saved, prepared and applied to."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/applications">
                <Kanban /> Pipeline
              </Link>
            </Button>
            <Button variant="secondary" onClick={() => exportCsv(rows)} disabled={!rows.length}>
              <Download /> Export CSV
            </Button>
          </>
        }
      />

      {isLoading ? (
        <HistorySkeleton />
      ) : error ? (
        <ErrorState error={error} title="We couldn't load your application history" onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState
          icon={<History />}
          title="No Applications Yet"
          description="Your application journey starts here. Every job you save or apply to will be recorded in this history."
          action={
            <Button asChild>
              <Link href="/jobs">
                <Briefcase /> Find Jobs
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="history-search" className="sr-only">
                Search history
              </label>
              <Input
                id="history-search"
                icon={<Search />}
                placeholder="Search company, role, location, notes…"
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
            <label htmlFor="history-status" className="sr-only">
              Filter by status
            </label>
            <Select
              id="history-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ApplicationStatus | "")}
              className="sm:w-56"
            >
              <option value="">All statuses ({data.length})</option>
              {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]} ({counts[s]})
                </option>
              ))}
            </Select>
            <label htmlFor="history-sort" className="sr-only">
              Sort by
            </label>
            <Select
              id="history-sort"
              className="md:hidden"
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":") as [SortKey, SortState["dir"]];
                setSort({ key, dir });
              }}
            >
              <option value="discovered:desc">Newest first</option>
              <option value="applied:desc">Recently applied</option>
              <option value="match:desc">Best match</option>
              <option value="company:asc">Company A–Z</option>
              <option value="status:asc">Status</option>
            </Select>
          </div>

          <p className="mb-3 text-sm text-muted" aria-live="polite">
            {filtered ? `${rows.length} of ${pluralize(data.length, "application")}` : pluralize(data.length, "application")}
          </p>

          {rows.length === 0 ? (
            <EmptyState
              compact
              icon={<Search />}
              title="Nothing matches those filters"
              description="Try another search term or status."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setStatus("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <HistoryTable items={rows} sort={sort} onSort={onSort} />
              <HistoryCards items={rows} />
            </>
          )}
        </>
      )}
    </div>
  );
}
