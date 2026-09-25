"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogoMark, Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/queries/core";
import { StepAgent } from "./step-agent";
import { StepGoals } from "./step-goals";
import { StepLaunch } from "./step-launch";
import { StepProfile } from "./step-profile";
import { StepSources } from "./step-sources";
import { StepWelcome } from "./step-welcome";
import { Stepper } from "./stepper";
import { STEP_KEYS, isStepKey, readSession, stepIndex, writeSession, type StepKey, type StepProps } from "./steps";

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg" role="status" aria-label="Loading your setup">
      <LogoMark className="size-10 animate-pulse" />
    </div>
  );
}

function readDone(): Set<StepKey> {
  try {
    const raw = JSON.parse(readSession("done") ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((k): k is StepKey => typeof k === "string" && isStepKey(k)) : []);
  } catch {
    return new Set();
  }
}

export function OnboardingWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: user, error, isLoading } = useMe();

  const urlStep = params.get("step");
  const current: StepKey = isStepKey(urlStep) ? urlStep : (() => {
    const stored = readSession("step");
    return isStepKey(stored) ? stored : "welcome";
  })();

  const [done, setDone] = React.useState<Set<StepKey>>(readDone);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const prevStep = React.useRef<StepKey | null>(null);

  // Auth guard
  React.useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace("/login?next=/onboarding");
    }
  }, [error, router]);

  // Persist the current step; move focus to the new step's heading on change (not on first load).
  React.useEffect(() => {
    writeSession("step", current);
    if (prevStep.current && prevStep.current !== current) {
      contentRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    }
    prevStep.current = current;
  }, [current, user]);

  const goTo = React.useCallback(
    (k: StepKey) => {
      router.replace(`/onboarding?step=${k}`, { scroll: false });
    },
    [router],
  );

  const markDone = (k: StepKey) =>
    setDone((prev) => {
      const next = new Set(prev).add(k);
      writeSession("done", JSON.stringify(Array.from(next)));
      return next;
    });

  if (error && !(error instanceof ApiError && error.status === 401)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
        <div className="max-w-sm text-center" role="alert">
          <LogoMark className="mx-auto size-10" />
          <h1 className="mt-4 text-h2 font-semibold">We couldn&apos;t load your account</h1>
          <p className="mt-2 text-sm text-muted">Please check your connection and try again. Your progress is saved.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (isLoading || !user) return <Splash />;

  const idx = stepIndex(current);
  const nav: StepProps = {
    onNext: () => goTo(STEP_KEYS[Math.min(idx + 1, STEP_KEYS.length - 1)]),
    onBack: () => goTo(STEP_KEYS[Math.max(idx - 1, 0)]),
    onComplete: () => {
      markDone(current);
      goTo(STEP_KEYS[Math.min(idx + 1, STEP_KEYS.length - 1)]);
    },
  };

  let content: React.ReactNode;
  switch (current) {
    case "welcome":
      content = <StepWelcome {...nav} user={user} />;
      break;
    case "profile":
      content = <StepProfile {...nav} />;
      break;
    case "goals":
      content = <StepGoals {...nav} />;
      break;
    case "sources":
      content = <StepSources {...nav} />;
      break;
    case "agent":
      content = <StepAgent {...nav} />;
      break;
    case "launch":
      content = <StepLaunch {...nav} />;
      break;
  }

  return (
    <div className="relative isolate min-h-dvh bg-bg">
      <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem]" aria-hidden />
      <header className="glass sticky top-0 z-30 border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Logo href="/onboarding" />
          <span className="hidden text-sm text-subtle sm:inline">· Setup</span>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-bg-subtle hover:text-text"
            >
              Finish later
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-3 sm:px-6">
          <Stepper current={current} done={done} onSelect={goTo} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <div ref={contentRef} key={current} className="animate-rise">
          {content}
        </div>
      </main>
    </div>
  );
}
