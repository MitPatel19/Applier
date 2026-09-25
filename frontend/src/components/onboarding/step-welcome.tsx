"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, FlaskConical, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { useAgentStatus } from "@/lib/queries/core";
import { useCompleteOnboarding, useSeedDemo } from "@/lib/queries/onboarding";
import type { User } from "@/lib/types";
import { ContinueButton, Panel, StepFooter, StepHeader } from "./step-shell";
import { clearOnboardingSession, type StepProps } from "./steps";

const DOES = [
  "Searches LinkedIn, Indeed and employer career pages for roles that fit",
  "Explains every match score with clear, honest reasoning",
  "Suggests resume tweaks and drafts cover letters for your review",
  "Tracks applications, reminds you to follow up and preps you for interviews",
];

const NEVER = [
  "Submit an application without your explicit approval",
  "Invent experience, skills or results you don't have",
  "Ask for or store your job-site passwords",
  "Email employers on your behalf",
];

export function StepWelcome({ user, onComplete }: StepProps & { user: User }) {
  const router = useRouter();
  const seed = useSeedDemo();
  const complete = useCompleteOnboarding();
  const { data: status } = useAgentStatus();
  const [demoUnavailable, setDemoUnavailable] = React.useState(false);
  const firstName = user.full_name.split(/\s+/)[0] || "there";
  const showDemo = !demoUnavailable && status?.demo_mode !== false;
  const exploring = seed.isPending || complete.isPending || (seed.isSuccess && complete.isSuccess);

  const explore = async () => {
    try {
      const res = await seed.mutateAsync();
      toast.success("Sample data is ready", { description: res?.message || "Explore freely — demo items are clearly labelled." });
    } catch {
      setDemoUnavailable(true);
      toast.message("Sample data isn't available right now", {
        description: "No problem — let's set things up with your own details instead.",
      });
      return;
    }
    try {
      await complete.mutateAsync();
      clearOnboardingSession();
      router.push("/dashboard");
    } catch (err) {
      toast.error(errorMessage(err, "We couldn't finish setup. Please try again."));
    }
  };

  return (
    <div>
      <StepHeader
        eyebrow={`Welcome, ${firstName}`}
        title="Meet your personal career agent."
        description="In the next few minutes we'll build your profile, set your goals and run your first search. You can change anything later."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Panel>
          <h2 className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
              <Check className="size-4" strokeWidth={3} aria-hidden />
            </span>
            What it does for you
          </h2>
          <ul className="mt-4 space-y-3">
            {DOES.map((d) => (
              <li key={d} className="flex gap-2.5 text-sm text-muted">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                {d}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="border-success/25 bg-success-soft/25">
          <h2 className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-success-soft text-success">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            What it will never do
          </h2>
          <ul className="mt-4 space-y-3">
            {NEVER.map((d) => (
              <li key={d} className="flex gap-2.5 text-sm text-text">
                <Ban className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                {d}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <StepFooter
        primary={
          <>
            {showDemo && (
              <Button variant="secondary" size="lg" onClick={explore} loading={exploring} className="w-full sm:w-auto">
                {!exploring && <FlaskConical />}
                {exploring ? "Preparing sample data…" : "Explore with sample data"}
              </Button>
            )}
            <ContinueButton onClick={onComplete} disabled={exploring}>
              Let&apos;s set things up
            </ContinueButton>
          </>
        }
      />
    </div>
  );
}
