"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const RANGE_OPTIONS = [
  { value: 7, label: "7 days", short: "7D" },
  { value: 30, label: "30 days", short: "30D" },
  { value: 90, label: "90 days", short: "90D" },
  { value: 365, label: "12 months", short: "1Y" },
] as const;

export type RangeDays = (typeof RANGE_OPTIONS)[number]["value"];

export function isRangeDays(n: number): n is RangeDays {
  return RANGE_OPTIONS.some((o) => o.value === n);
}

/** Segmented date-range control (radio group with arrow-key navigation). */
export function RangeSelect({ value, onChange, className }: { value: RangeDays; onChange: (v: RangeDays) => void; className?: string }) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (index + dir + RANGE_OPTIONS.length) % RANGE_OPTIONS.length;
    onChange(RANGE_OPTIONS[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      className={cn("inline-flex items-center gap-1 rounded-xl border border-border bg-bg-subtle p-1", className)}
    >
      {RANGE_OPTIONS.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
            )}
          >
            <span className="sm:hidden">{o.short}</span>
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
