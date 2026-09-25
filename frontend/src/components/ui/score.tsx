"use client";

/** Score visuals: ring, bars, progress. Scores are always shown with their number (never color alone). */

import * as React from "react";
import { scoreColor } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ScoreRing({
  score,
  size = 56,
  stroke = 5,
  label,
  className,
}: {
  score: number | null | undefined;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(100, score ?? 0));
  const color = scoreColor(score);
  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={score === null || score === undefined ? "Not scored yet" : `${label ?? "Match"} ${value}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (value / 100) * c}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.2,0.7,0.2,1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular font-semibold leading-none" style={{ fontSize: size * 0.28 }}>
          {score === null || score === undefined ? "—" : value}
          {score !== null && score !== undefined && <span style={{ fontSize: size * 0.16 }}>%</span>}
        </span>
      </span>
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  className,
  color,
  label,
  size = "md",
}: {
  value: number;
  max?: number;
  className?: string;
  color?: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const pctVal = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-border/70", size === "sm" ? "h-1.5" : "h-2", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pctVal}%`, background: color ?? "var(--primary)" }}
      />
    </div>
  );
}

/** One row of a score breakdown: "Technical Skills ████████░░ 92%". */
export function ScoreBar({
  label,
  score,
  weight,
  muted,
  className,
}: {
  label: string;
  score: number;
  weight?: number;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-3 sm:grid-cols-[11rem_1fr_3rem]", muted && "opacity-50", className)}>
      <span className="truncate text-sm text-muted">
        {label}
        {weight !== undefined && <span className="ml-1 text-caption text-subtle">×{weight}</span>}
      </span>
      <ProgressBar value={score} color={scoreColor(score)} label={`${label} ${score}%`} />
      <span className="tabular text-right text-sm font-semibold">{muted ? "n/a" : `${score}%`}</span>
    </div>
  );
}
