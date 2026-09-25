"use client";

/** Shown when an application has no prepared materials yet. Runs POST /applications/prepare. */

import * as React from "react";
import Link from "next/link";
import { ShieldCheck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import type { AgentStep, ApplicationDetail } from "@/lib/types";
import { usePrepareApplication } from "@/lib/queries/prepare";
import { AgentStepList } from "@/components/app/agent-progress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";

const PREP_STEPS: { key: string; label: string; detail: string }[] = [
  { key: "resume", label: "Choosing your best-matching resume", detail: "Picked the resume closest to this role" },
  { key: "tailor", label: "Tailoring your resume to the posting", detail: "Emphasis and wording adjusted — nothing invented" },
  { key: "cover", label: "Drafting a cover letter", detail: "Three versions ready to choose from" },
  { key: "answers", label: "Answering application questions", detail: "Filled from your profile" },
  { key: "research", label: "Researching the company", detail: "Key facts gathered with sources" },
  { key: "readiness", label: "Checking readiness", detail: "Anything missing is flagged for you" },
];

function useSimulatedProgress(active: boolean) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setIdx((i) => Math.min(i + 1, PREP_STEPS.length - 1)), 1400);
    return () => {
      clearInterval(t);
      setIdx(0);
    };
  }, [active]);
  return idx;
}

export function PrepareStart({ detail }: { detail: ApplicationDetail }) {
  const prepare = usePrepareApplication();
  const idx = useSimulatedProgress(prepare.isPending);

  const steps: AgentStep[] = PREP_STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    status: i < idx ? "done" : i === idx ? "running" : "pending",
    detail: i < idx ? s.detail : null,
    count: null,
    started_at: null,
    finished_at: null,
  }));

  const run = () => {
    if (!detail.job_id) return;
    prepare.mutate(
      { job_id: detail.job_id },
      {
        onSuccess: () =>
          toast.success("Your application is prepared", { description: "Review everything below. Nothing is sent until you approve." }),
        onError: (e) => toast.error(errorMessage(e, "Preparation didn't finish. Please try again.")),
      },
    );
  };

  return (
    <Card className="relative overflow-hidden">
      <div className="bg-aurora pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className="relative grid gap-8 p-6 sm:p-8 md:grid-cols-[1fr_minmax(0,22rem)]">
        <div>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-glow">
            <Wand2 className="size-6" aria-hidden />
          </span>
          <h2 className="mt-5 text-h1 font-semibold">Let Applier prepare this application</h2>
          <p className="mt-2 max-w-lg text-muted">
            We&apos;ll tailor your resume, draft a cover letter, answer the application questions and check that nothing is missing. It
            takes about 10 seconds.
          </p>
          <p className="mt-4 flex items-start gap-2 text-sm text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            Preparing never submits anything. You&apos;ll review every document and answer before you decide to apply.
          </p>
          {detail.job_id ? (
            <Button variant="gradient" size="lg" className="mt-6" onClick={run} loading={prepare.isPending}>
              {!prepare.isPending && <Wand2 />} {prepare.isPending ? "Preparing…" : "Prepare application"}
            </Button>
          ) : (
            <Callout tone="warning" className="mt-6" title="This application isn't linked to a job posting">
              Applier needs the job description to tailor your materials.{" "}
              <Link href={`/applications/${detail.id}`} className="font-medium text-primary hover:underline">
                Open the application
              </Link>{" "}
              to manage it manually.
            </Callout>
          )}
          {prepare.isError && (
            <Callout tone="danger" className="mt-4" title="Preparation didn't finish">
              {errorMessage(prepare.error)} Nothing was changed — you can safely try again.
            </Callout>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-surface/80 p-5" aria-live="polite">
          <p className="mb-3 text-caption font-semibold uppercase tracking-[0.12em] text-subtle">
            {prepare.isPending ? "Working on it" : "What we'll do"}
          </p>
          <AgentStepList steps={prepare.isPending ? steps : steps.map((s) => ({ ...s, status: "pending", detail: null }))} />
        </div>
      </div>
    </Card>
  );
}
