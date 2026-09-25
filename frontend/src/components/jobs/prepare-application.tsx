"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIsMutating } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { usePrepareApplication } from "@/lib/queries/jobs";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/score";

const STEPS = [
  { label: "Selecting resume", detail: "Picking the resume that best fits this role" },
  { label: "Customizing resume", detail: "Emphasizing relevant experience — never inventing any" },
  { label: "Writing cover letter", detail: "Drafting a letter in your voice" },
  { label: "Preparing answers", detail: "Pre-filling common questions from your profile" },
  { label: "Researching company", detail: "Collecting facts you can use in the application" },
  { label: "Checking requirements", detail: "Flagging anything that needs your attention" },
];

/** Full-screen, accessible progress overlay shown while an application is being prepared. */
function PrepareOverlay({ title, company, complete }: { title: string; company: string; complete: boolean }) {
  const [active, setActive] = React.useState(0);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    panelRef.current?.focus();
    const id = setInterval(() => setActive((a) => Math.min(a + 1, STEPS.length - 1)), 1700);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm animate-fade-in">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prep-title"
        aria-describedby="prep-desc"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-pop outline-none animate-rise"
      >
        <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 h-32" aria-hidden />
        <div className="relative p-6">
          <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow">
            <WandSparkles className="size-5" aria-hidden />
          </span>
          <h2 id="prep-title" className="mt-4 text-h2 font-semibold">
            {complete ? "Ready for your review" : "Preparing your application"}
          </h2>
          <p id="prep-desc" className="mt-1 text-sm text-muted">
            {title} at {company}. This usually takes under a minute. Nothing will be submitted — you&apos;ll review everything next.
          </p>
          <ProgressBar value={complete ? 100 : ((active + 0.5) / STEPS.length) * 100} className="mt-5" size="sm" label="Preparation progress" />
          <ol className="mt-5 space-y-3" aria-live="polite">
            {STEPS.map((s, i) => {
              const state = complete || i < active ? "done" : i === active ? "running" : "pending";
              return (
                <li key={s.label} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                      state === "done" && "bg-success-soft text-success",
                      state === "running" && "bg-primary-soft text-primary",
                      state === "pending" && "border border-border text-subtle",
                    )}
                  >
                    {state === "done" ? (
                      <Check className="size-3.5" strokeWidth={3} aria-hidden />
                    ) : state === "running" ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : null}
                  </span>
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium", state === "pending" ? "text-subtle" : "text-text")}>
                      {s.label}
                      {state === "running" && "…"}
                      <span className="sr-only">{state === "done" ? " — done" : state === "running" ? " — in progress" : " — waiting"}</span>
                    </p>
                    {state === "running" && <p className="text-caption text-muted">{s.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

/**
 * "Prepare Application" — asks the agent to assemble a tailored application package, then
 * takes the user to review it. If an application already exists, it continues that one.
 */
export function PrepareApplicationButton({
  job,
  className,
  size = "lg",
}: {
  job: Pick<Job, "id" | "title" | "company_name" | "application_id">;
  className?: string;
  size?: ButtonProps["size"];
}) {
  const prepare = usePrepareApplication();
  const router = useRouter();
  const [navigating, setNavigating] = React.useState(false);
  const busyElsewhere = useIsMutating({ mutationKey: ["prepare-application"] }) > 0 && !prepare.isPending;

  if (job.application_id) {
    return (
      <Button asChild variant="gradient" size={size} className={className}>
        <Link href={`/applications/${job.application_id}/prepare`}>
          Continue application <ArrowRight />
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="gradient"
        size={size}
        className={className}
        loading={prepare.isPending}
        disabled={busyElsewhere}
        onClick={() =>
          prepare.mutate(job.id, {
            onSuccess: (app) => {
              setNavigating(true);
              toast.success("Your application is ready for review", {
                description:
                  app.status === "reviewing"
                    ? "A few items need your input before you can approve it."
                    : "Check the resume changes, cover letter and answers, then approve when you're happy.",
              });
              router.push(`/applications/${app.id}/prepare`);
            },
            onError: (e) =>
              toast.error("We couldn't prepare this application", {
                description: `${errorMessage(e)} Nothing was submitted. You can try again.`,
              }),
          })
        }
      >
        {!prepare.isPending && <WandSparkles />}
        Prepare Application
      </Button>
      {(prepare.isPending || navigating) && <PrepareOverlay title={job.title} company={job.company_name} complete={navigating} />}
    </>
  );
}
