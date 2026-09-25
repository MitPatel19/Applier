"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, FlaskConical } from "lucide-react";
import { useResumePerformance } from "@/lib/queries/analytics";
import { pct } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState, ErrorState, SkeletonCard } from "@/components/ui/feedback";
import { Section } from "@/components/ui/layout";
import { ratePct } from "./chart-theme";

const CONFIDENCE: Record<"low" | "medium" | "high", { label: string; tone: BadgeTone }> = {
  low: { label: "Low confidence", tone: "neutral" },
  medium: { label: "Medium confidence", tone: "info" },
  high: { label: "High confidence", tone: "success" },
};

const DEFAULT_DISCLAIMER =
  "These numbers show observed historical performance — not proof of causation. Many factors besides your resume affect whether you get an interview.";

export function ResumePerformanceSection() {
  const { data, isLoading, error, refetch } = useResumePerformance();
  const rows = React.useMemo(() => [...(data?.rows ?? [])].sort((a, b) => b.applications - a.applications), [data]);
  const maxRate = Math.max(...rows.map((r) => ratePct(r.interviews, r.applications)), 1);

  return (
    <Section
      title="Resume performance"
      description="Applications and interviews for each resume you've sent."
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/resumes">
            <FileText /> Manage resumes
          </Link>
        </Button>
      }
    >
      <Callout tone="warning" icon={<FlaskConical />} title="Observed historical performance — not proof of causation">
        {data?.disclaimer || DEFAULT_DISCLAIMER}
      </Callout>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2" role="status" aria-label="Loading resume performance">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : error ? (
        <ErrorState error={error} title="We couldn't load resume performance" onRetry={() => refetch()} compact />
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          icon={<FileText />}
          title="No resume results yet"
          description="Once you've sent a few applications, you'll see how each resume version has performed."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const rate = ratePct(r.interviews, r.applications);
            const conf = CONFIDENCE[r.confidence] ?? CONFIDENCE.low;
            return (
              <li key={r.resume_id ?? r.resume_name}>
                <Card className="h-full p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-text">
                        {r.resume_id ? (
                          <Link href={`/resumes/${r.resume_id}`} className="hover:text-primary hover:underline">
                            {r.resume_name}
                          </Link>
                        ) : (
                          r.resume_name
                        )}
                      </h3>
                    </div>
                    <Badge tone={conf.tone} dot>
                      {conf.label}
                    </Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3">
                    <div>
                      <dt className="text-caption text-subtle">Applications</dt>
                      <dd className="mt-0.5 text-xl font-semibold">{r.applications}</dd>
                    </div>
                    <div>
                      <dt className="text-caption text-subtle">Interviews</dt>
                      <dd className="mt-0.5 text-xl font-semibold">{r.interviews}</dd>
                    </div>
                    <div>
                      <dt className="text-caption text-subtle">Interview rate</dt>
                      <dd className="mt-0.5 text-xl font-semibold">{pct(rate)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(rate / maxRate) * 100}%` }} />
                  </div>
                  {r.note && <p className="mt-3 text-sm text-muted">{r.note}</p>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
