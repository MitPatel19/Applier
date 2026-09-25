"use client";

import * as React from "react";
import { ArrowDown } from "lucide-react";
import type { Analytics } from "@/lib/types";
import { pct } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount, ratePct } from "./chart-theme";

type Step = Analytics["funnel"][number];

/**
 * Conversion funnel (Discovered → Applied → Responded → Interview → Offer).
 * Ordered stages share one hue; bar length is relative to the first stage and every step
 * states its conversion from the previous one in text (never color alone).
 */
export function ConversionFunnel({ steps, className }: { steps: Step[]; className?: string }) {
  const top = Math.max(steps[0]?.count ?? 0, 1);
  const overall = steps.length > 1 ? ratePct(steps[steps.length - 1].count, steps[0].count) : 0;

  return (
    <Card className={className}>
      <CardHeader>
        <div>
          <CardTitle>Conversion funnel</CardTitle>
          <CardDescription>How opportunities move from discovery to offer.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1" aria-label="Funnel stages">
          {steps.map((s, i) => {
            const prev = i > 0 ? steps[i - 1] : null;
            const width = Math.max((s.count / top) * 100, s.count > 0 ? 3 : 0);
            const stepRate = prev ? ratePct(s.count, prev.count) : null;
            return (
              <li key={s.key}>
                {prev && (
                  <p className="flex items-center gap-1.5 py-1 pl-1 text-caption text-subtle">
                    <ArrowDown className="size-3" aria-hidden />
                    <span>
                      <span className="tabular font-medium text-muted">{prev.count ? pct(stepRate, 0) : "—"}</span> step
                      conversion
                    </span>
                  </p>
                )}
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium text-text">{s.label}</span>
                  <span className="tabular font-semibold">{formatCount(s.count)}</span>
                </div>
                <div className="mt-1.5 h-2.5 w-full rounded-full bg-bg-subtle" aria-hidden>
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        {steps.length > 1 && (
          <p className="mt-4 border-t border-border pt-3 text-sm text-muted">
            Overall, <span className="tabular font-semibold text-text">{pct(overall, 1)}</span> of{" "}
            {steps[0].label.toLowerCase()} reached {steps[steps.length - 1].label.toLowerCase()}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
