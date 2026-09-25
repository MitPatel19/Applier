"use client";

/** Pick a job + variant and generate a cover letter (all three variants are produced). */

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Search, Sparkles } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { CoverLetter, CoverLetterVariant, JobList } from "@/lib/types";
import { COVER_LETTER_VARIANTS, useGenerateCoverLetter } from "@/lib/queries/cover-letters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Callout, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { ScoreRing } from "@/components/ui/score";

type PickerView = "recommended" | "saved";

function useJobPicker(view: PickerView, enabled: boolean) {
  return useQuery({
    queryKey: ["jobs", "picker", view],
    queryFn: () => api.get<JobList>("/jobs", { view, page_size: 50, sort: "match" }),
    enabled,
  });
}

export function GenerateCoverLetterDialog({
  open,
  onOpenChange,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (cl: CoverLetter) => void;
}) {
  const [view, setView] = React.useState<PickerView>("recommended");
  const [q, setQ] = React.useState("");
  const [jobId, setJobId] = React.useState<number | null>(null);
  const [variant, setVariant] = React.useState<CoverLetterVariant>("professional");
  const jobs = useJobPicker(view, open);
  const generate = useGenerateCoverLetter();
  const needle = q.trim().toLowerCase();
  const items = (jobs.data?.items ?? []).filter(
    (j) => !needle || j.title.toLowerCase().includes(needle) || j.company_name.toLowerCase().includes(needle),
  );

  const submit = () => {
    if (!jobId) return;
    generate.mutate(
      { job_id: jobId, variant },
      {
        onSuccess: (cl) => {
          onOpenChange(false);
          setJobId(null);
          onGenerated(cl);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !generate.isPending && onOpenChange(o)}
      size="lg"
      title="Generate a cover letter"
      description="Choose a job. We'll write three versions from your profile and the posting — you edit and approve."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={generate.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!jobId} loading={generate.isPending}>
            {!generate.isPending && <Sparkles />} {generate.isPending ? "Writing…" : "Generate"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs value={view} onValueChange={(v) => setView(v as PickerView)}>
            <TabsList>
              <TabsTrigger value="recommended">Recommended</TabsTrigger>
              <TabsTrigger value="saved">Saved</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title or company" aria-label="Filter jobs" className="h-9" />
        </div>

        <div role="radiogroup" aria-label="Job" className="max-h-72 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
          {jobs.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
          ) : jobs.error ? (
            <Callout tone="warning">{errorMessage(jobs.error)}</Callout>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
              <Briefcase className="mx-auto mb-2 size-5 text-subtle" aria-hidden />
              {needle ? "No jobs match that filter." : view === "saved" ? "You haven't saved any jobs yet." : "No recommended jobs yet."}{" "}
              <Link href="/jobs" className="font-medium text-primary hover:underline">
                Browse jobs
              </Link>
            </div>
          ) : (
            items.map((j) => {
              const active = jobId === j.id;
              return (
                <button
                  key={j.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setJobId(j.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    active ? "border-primary bg-primary-soft/40 shadow-[0_0_0_3px_var(--primary-soft)]" : "border-border hover:border-border-strong hover:bg-bg-subtle/60",
                  )}
                >
                  <ScoreRing score={j.match?.overall} size={36} stroke={3} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{j.title}</span>
                    <span className="block truncate text-caption text-subtle">
                      {j.company_name}
                      {j.location ? ` · ${j.location}` : ""}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Start with</p>
          <div role="radiogroup" aria-label="Version" className="grid gap-2 sm:grid-cols-3">
            {COVER_LETTER_VARIANTS.map((v) => (
              <button
                key={v.value}
                type="button"
                role="radio"
                aria-checked={variant === v.value}
                onClick={() => setVariant(v.value)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  variant === v.value ? "border-primary bg-primary-soft/40" : "border-border hover:border-border-strong",
                )}
              >
                <span className="block text-sm font-medium">{v.label}</span>
                <span className="mt-0.5 block text-caption text-subtle">{v.hint}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-caption text-subtle">You can switch between versions at any time in the editor.</p>
        </div>

        {generate.isError && (
          <Callout tone="danger" title="We couldn't write the letter">
            {errorMessage(generate.error)}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
