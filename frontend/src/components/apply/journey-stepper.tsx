import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type JourneyStep = "review" | "confirm" | "apply" | "track";

const STEPS: { key: JourneyStep; label: string; hint: string }[] = [
  { key: "review", label: "Review", hint: "Check documents & answers" },
  { key: "confirm", label: "Confirm", hint: "Give your approval" },
  { key: "apply", label: "Apply", hint: "Finish on the employer's site" },
  { key: "track", label: "Track", hint: "We follow up for you" },
];

/** Review → Confirm → Apply → Track. The user always knows where they are. */
export function JourneyStepper({ current, className }: { current: JourneyStep; className?: string }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Application progress" className={className}>
      <ol className="grid grid-cols-4 gap-1.5 sm:gap-3">
        {STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={s.key} aria-current={active ? "step" : undefined} className="min-w-0">
              <div
                className={cn(
                  "h-1 rounded-full transition-colors duration-500",
                  done ? "bg-success" : active ? "bg-gradient-brand" : "bg-border",
                )}
                aria-hidden
              />
              <div className="mt-2 flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                    done && "bg-success-soft text-success",
                    active && "bg-primary text-primary-fg",
                    !done && !active && "bg-bg-subtle text-subtle",
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("truncate text-xs font-medium sm:text-sm", active ? "text-text" : done ? "text-muted" : "text-subtle")}>
                  {s.label}
                  <span className="sr-only">{done ? " (completed)" : active ? " (current step)" : ""}</span>
                </span>
              </div>
              <p className="mt-0.5 hidden truncate pl-6.5 text-caption text-subtle md:block">{s.hint}</p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
