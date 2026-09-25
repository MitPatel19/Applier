"use client";

import * as React from "react";
import { CheckCircle2, ChevronDown, CircleSlash, Info, XCircle } from "lucide-react";
import type { JobMatch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScoreBar, ScoreRing } from "@/components/ui/score";
import { Badge } from "@/components/ui/badge";
import { TierBadge } from "./status";

/**
 * Transparent match score. Shows the overall score, each weighted category, and — on
 * expansion — the exact reasoning, matched items and gaps. Never a black box.
 */
export function MatchBreakdown({ match, className, defaultOpen }: { match: JobMatch; className?: string; defaultOpen?: string }) {
  const [open, setOpen] = React.useState<string | null>(defaultOpen ?? null);
  const applicable = match.breakdown.filter((c) => c.applicable);
  const totalWeight = applicable.reduce((s, c) => s + c.weight, 0) || 1;
  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex items-center gap-4">
        <ScoreRing score={match.overall} size={76} stroke={6} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-h2 font-semibold">{match.overall}% Match</p>
            <TierBadge tier={match.tier} />
          </div>
          <p className="mt-1 text-sm text-muted">{match.recommendation}</p>
        </div>
      </div>

      <div className="space-y-1">
        {match.breakdown.map((c) => {
          const isOpen = open === c.key;
          return (
            <div key={c.key} className={cn("rounded-lg transition-colors", isOpen && "bg-bg-subtle")}>
              <button
                type="button"
                className="w-full rounded-lg px-2 py-2 text-left hover:bg-bg-subtle"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : c.key)}
              >
                <div className="flex items-center gap-2">
                  <ScoreBar label={c.label} score={c.score} muted={!c.applicable} className="flex-1" />
                  <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform", isOpen && "rotate-180")} />
                </div>
              </button>
              {isOpen && (
                <div className="space-y-3 px-3 pb-3 pt-1 text-sm">
                  <p className="text-text">{c.summary}</p>
                  {c.applicable ? (
                    <p className="text-caption text-subtle">
                      Weight {c.weight} of {totalWeight} → contributes {((c.score * c.weight) / totalWeight).toFixed(1)} points
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-caption text-subtle">
                      <CircleSlash className="size-3.5" /> Not enough information in the posting — excluded from the overall score.
                    </p>
                  )}
                  {c.reasons.length > 0 && (
                    <ul className="space-y-1.5">
                      {c.reasons.map((r, i) => (
                        <li key={i} className="flex gap-2 text-muted">
                          <Info className="mt-0.5 size-3.5 shrink-0 text-subtle" /> {r}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(c.matched.length > 0 || c.missing.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {c.matched.map((m) => (
                        <Badge key={`m-${m}`} tone="success" size="xs">
                          <CheckCircle2 className="size-3" /> {m}
                        </Badge>
                      ))}
                      {c.missing.map((m) => (
                        <Badge key={`x-${m}`} tone="danger" size="xs">
                          <XCircle className="size-3" /> {m}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(match.missing_required.length > 0 || match.concerns.length > 0) && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          {match.missing_required.length > 0 && (
            <div>
              <p className="text-sm font-medium">Missing required qualifications</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {match.missing_required.map((m) => (
                  <Badge key={m} tone="danger" size="xs">
                    {m}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {match.missing_preferred.length > 0 && (
            <div>
              <p className="text-sm font-medium">Missing nice-to-haves</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {match.missing_preferred.map((m) => (
                  <Badge key={m} tone="warning" size="xs">
                    {m}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {match.concerns.length > 0 && (
            <div>
              <p className="text-sm font-medium">Things to consider</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted">
                {match.concerns.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
