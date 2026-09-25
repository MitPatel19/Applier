"use client";

import * as React from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import type { Analytics } from "@/lib/types";
import { cn, formatDate, parseDate } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_VARS, formatCount } from "./chart-theme";

type Point = Analytics["timeseries"][number];

const SERIES = [
  { key: "discovered", label: "Jobs discovered", color: "var(--chart-context)", context: true },
  { key: "applied", label: "Applications", color: "var(--chart-1)", context: false },
  { key: "interviews", label: "Interviews", color: "var(--chart-2)", context: false },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

function shortDate(value: string, rangeDays: number) {
  const d = parseDate(value);
  if (!d) return value;
  return rangeDays > 120
    ? d.toLocaleDateString(undefined, { month: "short" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function LegendKey({ color, context }: { color: string; context: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-[3px] w-4 rounded-full", context && "opacity-80")}
      style={{ background: color }}
    />
  );
}

function ChartTooltip({ active, label, byDate }: { active?: boolean; label?: string | number; byDate: Map<string, Point> }) {
  if (!active || label === undefined) return null;
  const row = byDate.get(String(label));
  if (!row) return null;
  return (
    <div className="min-w-44 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm shadow-pop">
      <p className="mb-1.5 text-caption font-medium text-subtle">{formatDate(row.date, { weekday: "short" })}</p>
      <dl className="space-y-1">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2 text-muted">
              <LegendKey color={s.color} context={s.context} />
              {s.label}
            </dt>
            <dd className="tabular font-semibold text-text">{row[s.key]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Activity over time: jobs discovered (gray context wash) vs applications and interviews.
 * One shared y-axis (all three are counts). Always paired with a table view.
 */
export function ActivityChart({ data, rangeDays, className }: { data: Point[]; rangeDays: number; className?: string }) {
  const [view, setView] = React.useState<"chart" | "table">("chart");
  const byDate = React.useMemo(() => new Map(data.map((p) => [p.date, p])), [data]);
  const totals = React.useMemo(() => {
    const t: Record<SeriesKey, number> = { discovered: 0, applied: 0, interviews: 0 };
    for (const p of data) {
      t.discovered += p.discovered;
      t.applied += p.applied;
      t.interviews += p.interviews;
    }
    return t;
  }, [data]);

  const summary = `Over the last ${rangeDays} days: ${totals.discovered} jobs discovered, ${totals.applied} applications and ${totals.interviews} interviews.`;

  return (
    <Card className={className}>
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle>Activity over time</CardTitle>
          <CardDescription>Jobs discovered compared with applications sent and interviews landed.</CardDescription>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-bg-subtle p-0.5" role="group" aria-label="Display as">
          {(
            [
              { v: "chart", label: "Chart", icon: BarChart3 },
              { v: "table", label: "Table", icon: Table2 },
            ] as const
          ).map(({ v, label, icon: Icon }) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                view === v ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-2" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-sm text-muted">
              <LegendKey color={s.color} context={s.context} />
              <span>{s.label}</span>
              <span className="tabular font-semibold text-text">{formatCount(totals[s.key])}</span>
            </li>
          ))}
        </ul>

        {view === "chart" ? (
          <figure className={cn("m-0", CHART_VARS)}>
            <div className="h-64 w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => shortDate(v, rangeDays)}
                    tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border)" }}
                    minTickGap={24}
                    tickMargin={8}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
                    content={({ active, label }) => <ChartTooltip active={active} label={label} byDate={byDate} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="discovered"
                    name="Jobs discovered"
                    stroke="var(--chart-context)"
                    strokeWidth={2}
                    fill="var(--chart-context)"
                    fillOpacity={0.1}
                    dot={false}
                    activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2, fill: "var(--chart-context)" }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="applied"
                    name="Applications"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2, fill: "var(--chart-1)" }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="interviews"
                    name="Interviews"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2, fill: "var(--chart-2)" }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <figcaption className="sr-only">{summary} Switch to the table view for daily values.</figcaption>
          </figure>
        ) : (
          <div className="max-h-80 overflow-auto rounded-lg border border-border scrollbar-thin">
            <table className="w-full text-sm">
              <caption className="sr-only">{summary}</caption>
              <thead className="sticky top-0 bg-surface-2 text-left text-caption uppercase tracking-wider text-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Date
                  </th>
                  {SERIES.map((s) => (
                    <th key={s.key} scope="col" className="px-3 py-2 text-right font-medium">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...data].reverse().map((p) => (
                  <tr key={p.date}>
                    <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-normal text-muted">
                      {formatDate(p.date)}
                    </th>
                    {SERIES.map((s) => (
                      <td key={s.key} className="tabular px-3 py-2 text-right">
                        {p[s.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
