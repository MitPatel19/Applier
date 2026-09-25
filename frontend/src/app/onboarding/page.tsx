import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoMark } from "@/components/app/logo";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const metadata: Metadata = {
  title: "Set up your career agent",
  description: "Build your profile, set your goals and start your first job search.",
};

function Fallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg" role="status" aria-label="Loading your setup">
      <LogoMark className="size-10 animate-pulse" />
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <OnboardingWizard />
    </Suspense>
  );
}
