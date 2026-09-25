"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, Cog, History, ListFilter, UserRound } from "lucide-react";
import { useAuditFeed } from "@/lib/queries/audit";
import type { AuditEntry } from "@/lib/types";
import { cn, formatTime, parseDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { SettingsPanel } from "./settings-shared";

type ActorFilter = "all" | AuditEntry["actor"];

const ACTORS: Record<AuditEntry["actor"], { label: string; icon: React.ReactNode; className: string }> = {
  user: { label: "You", icon: <UserRound />, className: "bg-primary-soft text-primary-soft-fg" },
  agent: { label: "Agent", icon: <Bot />, className: "bg-accent-soft text-accent" },
  system: { label: "System", icon: <Cog />, className: "bg-bg-subtle text-muted" },
};

const FILTERS: { value: ActorFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "user", label: "You" },
  { value: "agent", label: "Agent" },
  { value: "system", label: "System" },
];

const ENTITY_ROUTES: Record<string, { href: (id: number) => string; label: string }> = {
  application: { href: (id) => `/applications/${id}`, label: "View application" },
  job: { href: (id) => `/jobs/${id}`, label: "View job" },
  resume: { href: (id) => `/resumes/${id}`, label: "View resume" },
  company: { href: (id) => `/companies/${id}`, label: "View company" },
  interview: { href: (id) => `/interviews/${id}`, label: "View interview" },
};

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const base = d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  if (dayKey(d) === dayKey(now)) return { title: base, tag: "Today" };
  if (dayKey(d) === dayKey(yesterday)) return { title: base, tag: "Yesterday" };
  return { title: base, tag: d.toLocaleDateString(undefined, { weekday: "long" }) };
}

function groupByDay(entries: AuditEntry[]) {
  const groups: { key: string; date: Date; items: AuditEntry[] }[] = [];
  for (const e of entries) {
    const d = parseDate(e.created_at);
    if (!d) continue;
    const key = dayKey(d);
    const existing = groups.find((g) => g.key === key);
    if (existing) existing.items.push(e);
    else groups.push({ key, date: d, items: [e] });
  }
  return groups;
}

function AuditSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading activity">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function AuditTab() {
  const [actor, setActor] = React.useState<ActorFilter>("all");
  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useAuditFeed();

  const all = React.useMemo(() => data?.pages.flat() ?? [], [data]);
  const visible = React.useMemo(() => (actor === "all" ? all : all.filter((e) => e.actor === actor)), [all, actor]);
  const groups = React.useMemo(() => groupByDay(visible), [visible]);

  return (
    <SettingsPanel
      title="Audit log"
      description="A complete, time-stamped record of what you, your Career Agent and the system did — nothing happens behind your back."
    >
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by who acted">
        <ListFilter className="size-4 text-subtle" aria-hidden />
        {FILTERS.map((f) => {
          const active = actor === f.value;
          const meta = f.value === "all" ? null : ACTORS[f.value];
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={active}
              onClick={() => setActor(f.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-all [&_svg]:size-3.5",
                active
                  ? "border-primary bg-primary-soft text-primary-soft-fg"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
              )}
            >
              {meta?.icon}
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-6">
        {isLoading ? (
          <AuditSkeleton />
        ) : error ? (
          <ErrorState compact error={error} title="We couldn't load your activity" onRetry={() => refetch()} />
        ) : all.length === 0 ? (
          <EmptyState
            compact
            icon={<History />}
            title="No activity yet"
            description="As you and your Career Agent search, prepare and apply, every step is recorded here."
          />
        ) : (
          <>
            {groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No {FILTERS.find((f) => f.value === actor)?.label.toLowerCase()} activity in the entries loaded so far.
              </p>
            ) : (
              <div className="space-y-7">
                {groups.map((g) => {
                  const label = dayLabel(g.date);
                  return (
                    <section key={g.key} aria-label={`${label.title}`}>
                      <h3 className="flex items-baseline gap-2 text-sm font-semibold text-text">
                        {label.title}
                        <span className="text-caption font-normal text-subtle">{label.tag}</span>
                      </h3>
                      <ol className="relative mt-3 space-y-0.5 before:absolute before:bottom-3 before:left-[5.5rem] before:top-3 before:w-px before:bg-border sm:before:left-[6.375rem]">
                        {g.items.map((e) => {
                          const a = ACTORS[e.actor] ?? ACTORS.system;
                          const route = e.entity_type && e.entity_id ? ENTITY_ROUTES[e.entity_type] : undefined;
                          return (
                            <li key={e.id} className="relative grid grid-cols-[4.25rem_1.5rem_1fr] items-start gap-2 py-1.5 sm:grid-cols-[5rem_1.5rem_1fr] sm:gap-2.5">
                              <time dateTime={parseDate(e.created_at)?.toISOString()} className="tabular pt-0.5 text-right text-caption text-subtle">
                                {formatTime(e.created_at)}
                              </time>
                              <span
                                className={cn("relative z-10 flex size-6 items-center justify-center rounded-full ring-4 ring-surface [&_svg]:size-3.5", a.className)}
                                title={a.label}
                              >
                                {a.icon}
                                <span className="sr-only">{a.label}:</span>
                              </span>
                              <div className="min-w-0 pt-0.5">
                                <p className="text-sm text-text">{e.summary}</p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-subtle">
                                  <span>{a.label}</span>
                                  {route && e.entity_id && (
                                    <Link
                                      href={route.href(e.entity_id)}
                                      className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                                    >
                                      {route.label}
                                      <ArrowUpRight className="size-3" aria-hidden />
                                    </Link>
                                  )}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  );
                })}
              </div>
            )}
            <div className="mt-6 flex justify-center border-t border-border pt-4">
              {hasNextPage ? (
                <Button variant="secondary" size="sm" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
                  Load more
                </Button>
              ) : (
                <p className="text-caption text-subtle">You&apos;ve reached the beginning of your activity.</p>
              )}
            </div>
          </>
        )}
      </div>
    </SettingsPanel>
  );
}
