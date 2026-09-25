"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, FileText, StickyNote } from "lucide-react";
import { SOURCE_LABELS, STATUS_LABELS, STATUS_ORDER, scoreColor } from "@/lib/constants";
import type { Application } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { StatusBadge, DemoBadge } from "@/components/app/status";
import { Tooltip } from "@/components/ui/primitives";

export type SortKey = "company" | "title" | "location" | "source" | "discovered" | "applied" | "resume" | "match" | "status";
export interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

export function sourceLabel(source: string | null) {
  if (!source) return "—";
  return SOURCE_LABELS[source] ?? source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortValue(a: Application, key: SortKey): string | number {
  switch (key) {
    case "company":
      return a.company_name.toLowerCase();
    case "title":
      return a.job_title.toLowerCase();
    case "location":
      return (a.location ?? "").toLowerCase();
    case "source":
      return sourceLabel(a.source).toLowerCase();
    case "discovered":
      return a.date_discovered ?? a.created_at ?? "";
    case "applied":
      return a.applied_at ?? "";
    case "resume":
      return (a.resume_name ?? "").toLowerCase();
    case "match":
      return a.match_score ?? -1;
    case "status":
      return STATUS_ORDER.indexOf(a.status);
  }
}

export function sortApplications(items: Application[], sort: SortState) {
  const mul = sort.dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    // Empty values always last
    if (va === "" && vb !== "") return 1;
    if (vb === "" && va !== "") return -1;
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return b.id - a.id;
  });
}

function csvCell(v: string | number | null | undefined) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Client-side CSV export of the rows currently shown. */
export function exportCsv(items: Application[]) {
  const header = [
    "Company",
    "Job title",
    "Location",
    "Source",
    "Date discovered",
    "Date applied",
    "Resume version",
    "Match score",
    "Status",
    "Rejection reason",
    "Notes",
    "Posting URL",
  ];
  const day = (v: string | null) => (v ? v.slice(0, 10) : "");
  const rows = items.map((a) => [
    a.company_name,
    a.job_title,
    a.location,
    sourceLabel(a.source),
    day(a.date_discovered ?? a.created_at),
    day(a.applied_at),
    a.resume_name,
    a.match_score,
    STATUS_LABELS[a.status],
    a.rejection_reason,
    a.notes,
    a.url,
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `applier-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sort: SortState;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("whitespace-nowrap px-3 py-2.5 text-left text-caption font-semibold uppercase tracking-wider text-subtle", className)}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1 rounded-md hover:text-text", active && "text-text")}
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-50")} aria-hidden />
      </button>
    </th>
  );
}

function MatchCell({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-subtle">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-border/70" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${score}%`, background: scoreColor(score) }} />
      </span>
      <span className="tabular text-sm font-semibold">{score}%</span>
    </span>
  );
}

function NotesIndicator({ notes }: { notes: string | null }) {
  if (!notes?.trim()) return <span className="sr-only">No notes</span>;
  return (
    <Tooltip content={<span className="line-clamp-4 whitespace-pre-line">{notes}</span>}>
      <span className="inline-flex text-primary" tabIndex={0} aria-label={`Notes: ${notes.slice(0, 120)}`}>
        <StickyNote className="size-4" />
      </span>
    </Tooltip>
  );
}

function ResumeCell({ app }: { app: Application }) {
  if (!app.resume_name) return <span className="text-subtle">—</span>;
  if (app.resume_version_id)
    return (
      <Link
        href={`/resumes/versions/${app.resume_version_id}`}
        className="inline-flex max-w-44 items-center gap-1.5 truncate text-sm hover:text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        <FileText className="size-3.5 shrink-0 text-subtle" />
        <span className="truncate">{app.resume_name}</span>
      </Link>
    );
  return <span className="block max-w-44 truncate text-sm">{app.resume_name}</span>;
}

export function HistoryTable({ items, sort, onSort }: { items: Application[]; sort: SortState; onSort: (k: SortKey) => void }) {
  const router = useRouter();
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-card md:block">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <caption className="sr-only">Application history, sortable by column</caption>
          <thead className="border-b border-border bg-surface-2">
            <tr>
              <SortHeader label="Company" k="company" sort={sort} onSort={onSort} className="pl-5" />
              <SortHeader label="Job title" k="title" sort={sort} onSort={onSort} />
              <SortHeader label="Location" k="location" sort={sort} onSort={onSort} />
              <SortHeader label="Source" k="source" sort={sort} onSort={onSort} />
              <SortHeader label="Discovered" k="discovered" sort={sort} onSort={onSort} />
              <SortHeader label="Applied" k="applied" sort={sort} onSort={onSort} />
              <SortHeader label="Resume" k="resume" sort={sort} onSort={onSort} />
              <SortHeader label="Match" k="match" sort={sort} onSort={onSort} />
              <SortHeader label="Status" k="status" sort={sort} onSort={onSort} />
              <th scope="col" className="px-3 py-2.5 pr-5">
                <span className="sr-only">Notes</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((a) => (
              <tr
                key={a.id}
                onClick={() => router.push(`/applications/${a.id}`)}
                className="group cursor-pointer transition-colors hover:bg-surface-2"
              >
                <td className="max-w-48 px-3 py-3 pl-5">
                  <span className="block truncate font-medium text-text">{a.company_name}</span>
                </td>
                <td className="max-w-64 px-3 py-3">
                  <Link
                    href={`/applications/${a.id}`}
                    className="line-clamp-2 font-medium text-text hover:text-primary"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {a.job_title}
                  </Link>
                  {a.is_demo && (
                    <span className="mt-1 block">
                      <DemoBadge />
                    </span>
                  )}
                </td>
                <td className="max-w-40 truncate px-3 py-3 text-muted">{a.location ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-muted">{sourceLabel(a.source)}</td>
                <td className="tabular whitespace-nowrap px-3 py-3 text-muted">{formatDate(a.date_discovered ?? a.created_at)}</td>
                <td className="tabular whitespace-nowrap px-3 py-3 text-muted">{a.applied_at ? formatDate(a.applied_at) : <span className="text-subtle">—</span>}</td>
                <td className="px-3 py-3">
                  <ResumeCell app={a} />
                </td>
                <td className="px-3 py-3">
                  <MatchCell score={a.match_score} />
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={a.status} size="xs" />
                </td>
                <td className="px-3 py-3 pr-5">
                  <NotesIndicator notes={a.notes} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HistoryCards({ items }: { items: Application[] }) {
  return (
    <ul className="space-y-2.5 md:hidden">
      {items.map((a) => (
        <li key={a.id}>
          <Link
            href={`/applications/${a.id}`}
            className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-border-strong"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-muted">{a.company_name}</p>
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold">{a.job_title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={a.status} size="xs" />
                {a.match_score !== null && (
                  <span className="tabular text-xs font-semibold" style={{ color: scoreColor(a.match_score) }}>
                    {a.match_score}% match
                  </span>
                )}
                {a.notes?.trim() && <StickyNote className="size-3.5 text-primary" aria-label="Has notes" />}
                {a.is_demo && <DemoBadge />}
              </div>
              <p className="mt-2 text-xs text-subtle">
                {a.applied_at ? `Applied ${formatDate(a.applied_at)}` : `Discovered ${formatDate(a.date_discovered ?? a.created_at)}`}
                {a.source ? ` · ${sourceLabel(a.source)}` : ""}
                {a.location ? ` · ${a.location}` : ""}
              </p>
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 text-subtle" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
