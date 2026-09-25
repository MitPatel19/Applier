"use client";

import * as React from "react";
import type { BreakdownRow } from "@/lib/types";
import { pct } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatCount, ratePct } from "./chart-theme";

/** Thin inline meter used inside tables; the number beside it carries the value. */
function InlineMeter({ value, max = 100 }: { value: number; max?: number }) {
  const w = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span className="block h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
      <span className="block h-full rounded-full bg-primary" style={{ width: `${w}%` }} />
    </span>
  );
}

/**
 * "Most successful sources / job titles": applications with application → interview
 * conversion. Rates are computed from raw counts so the display never depends on
 * whether the API sends fractions or percentages.
 */
export function BreakdownCard({
  title,
  description,
  labelHeader,
  rows,
  emptyText,
  limit = 8,
  labelFor,
}: {
  title: string;
  description?: string;
  labelHeader: string;
  rows: BreakdownRow[];
  emptyText: string;
  limit?: number;
  labelFor?: (label: string) => string;
}) {
  const sorted = React.useMemo(
    () =>
      [...rows]
        .filter((r) => r.applications > 0)
        .sort((a, b) => ratePct(b.interviews, b.applications) - ratePct(a.interviews, a.applications) || b.applications - a.applications)
        .slice(0, limit),
    [rows, limit],
  );
  const maxRate = Math.max(...sorted.map((r) => ratePct(r.interviews, r.applications)), 1);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <EmptyState compact title="Not enough data yet" description={emptyText} />
        ) : (
          <div className="-mx-5 overflow-x-auto px-5 scrollbar-thin">
            <table className="w-full min-w-[26rem] text-sm">
              <caption className="sr-only">{title}, sorted by interview rate</caption>
              <thead>
                <tr className="text-left text-caption uppercase tracking-wider text-subtle">
                  <th scope="col" className="pb-2 pr-3 font-medium">
                    {labelHeader}
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">
                    Applied
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">
                    Responses
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">
                    Interviews
                  </th>
                  <th scope="col" className="w-36 pb-2 text-right font-medium">
                    Interview rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((r) => {
                  const rate = ratePct(r.interviews, r.applications);
                  return (
                    <tr key={r.label}>
                      <th scope="row" className="max-w-[14rem] truncate py-2.5 pr-3 text-left font-medium text-text">
                        {labelFor ? labelFor(r.label) : r.label}
                      </th>
                      <td className="tabular py-2.5 pr-3 text-right">{formatCount(r.applications)}</td>
                      <td className="tabular py-2.5 pr-3 text-right text-muted">
                        {r.responses}
                        <span className="ml-1 text-caption text-subtle">({pct(ratePct(r.responses, r.applications))})</span>
                      </td>
                      <td className="tabular py-2.5 pr-3 text-right">{r.interviews}</td>
                      <td className="py-2.5">
                        <span className="flex items-center justify-end gap-2">
                          <InlineMeter value={rate} max={maxRate} />
                          <span className="tabular w-11 shrink-0 text-right font-semibold">{pct(rate)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Horizontal bar list for a single measure (counts per category). One hue for every bar. */
export function BarListCard({
  title,
  description,
  items,
  emptyTitle,
  emptyText,
}: {
  title: string;
  description?: string;
  items: { label: string; count: number; key?: string }[];
  emptyTitle: string;
  emptyText: string;
}) {
  const visible = items.filter((i) => i.count > 0);
  const total = visible.reduce((s, i) => s + i.count, 0);
  const max = Math.max(...visible.map((i) => i.count), 1);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <EmptyState compact title={emptyTitle} description={emptyText} />
        ) : (
          <ul className="space-y-3">
            {visible.map((i) => (
              <li key={i.key ?? i.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-text">{i.label}</span>
                  <span className="shrink-0">
                    <span className="tabular font-semibold">{i.count}</span>
                    <span className="tabular ml-1.5 text-caption text-subtle">{pct(ratePct(i.count, total))}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(i.count / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
