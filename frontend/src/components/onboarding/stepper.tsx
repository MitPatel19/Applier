"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS, stepIndex, type StepKey } from "./steps";

/** Progress indicator. Desktop: labelled steps; mobile: progress bar + current label. */
export function Stepper({
  current,
  done,
  onSelect,
}: {
  current: StepKey;
  done: Set<StepKey>;
  onSelect: (k: StepKey) => void;
}) {
  const idx = stepIndex(current);
  const pct = ((idx + 1) / STEPS.length) * 100;
  return (
    <nav aria-label="Setup progress">
      {/* Mobile */}
      <div className="md:hidden">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{STEPS[idx].label}</span>
          <span className="tabular text-muted">
            Step {idx + 1} of {STEPS.length}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/70"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={idx + 1}
          aria-label="Setup progress"
        >
          <div className="h-full rounded-full bg-gradient-brand transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Desktop */}
      <ol className="hidden items-center md:flex">
        {STEPS.map((s, i) => {
          const isCurrent = s.key === current;
          const isDone = done.has(s.key) && !isCurrent;
          const isPast = i < idx;
          return (
            <li key={s.key} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
              <button
                type="button"
                onClick={() => onSelect(s.key)}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-sm font-medium transition-colors",
                  isCurrent ? "text-text" : "text-muted hover:text-text",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all",
                    isCurrent && "border-transparent bg-gradient-brand text-white shadow-glow",
                    !isCurrent && isDone && "border-transparent bg-success-soft text-success",
                    !isCurrent && !isDone && isPast && "border-border-strong bg-surface text-muted",
                    !isCurrent && !isDone && !isPast && "border-border bg-surface text-subtle",
                  )}
                >
                  {isDone ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <s.icon className="size-4" aria-hidden />}
                </span>
                <span className="hidden whitespace-nowrap lg:inline">{s.label}</span>
                <span className="whitespace-nowrap lg:hidden">{s.short}</span>
                <span className="sr-only">
                  {isCurrent ? " (current step)" : isDone ? " (completed)" : ""}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span
                  className={cn("mx-1 h-px flex-1 transition-colors", i < idx ? "bg-primary/50" : "bg-border")}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
