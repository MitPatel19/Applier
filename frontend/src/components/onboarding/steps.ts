import { Bot, Link2, Rocket, Sparkles, Target, UserRound, type LucideIcon } from "lucide-react";

export const STEP_KEYS = ["welcome", "profile", "goals", "sources", "agent", "launch"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const STEPS: { key: StepKey; label: string; short: string; icon: LucideIcon }[] = [
  { key: "welcome", label: "Welcome", short: "Welcome", icon: Sparkles },
  { key: "profile", label: "Build profile", short: "Profile", icon: UserRound },
  { key: "goals", label: "Career goals", short: "Goals", icon: Target },
  { key: "sources", label: "Connect sources", short: "Sources", icon: Link2 },
  { key: "agent", label: "Agent behavior", short: "Agent", icon: Bot },
  { key: "launch", label: "Start searching", short: "Launch", icon: Rocket },
];

export function isStepKey(v: string | null | undefined): v is StepKey {
  return !!v && (STEP_KEYS as readonly string[]).includes(v);
}

export function stepIndex(k: StepKey) {
  return STEP_KEYS.indexOf(k);
}

// ---------------------------------------------------------------- session persistence
const PREFIX = "applier.onboarding.";

export function readSession(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(PREFIX + key);
    else window.sessionStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage unavailable (private mode) — persistence is best-effort */
  }
}

export function clearOnboardingSession() {
  ["step", "done", "task", "resume", "profile-mode"].forEach((k) => writeSession(k, null));
}

/** Common navigation contract every step receives. */
export interface StepProps {
  onNext: () => void;
  onBack: () => void;
  /** Mark this step as completed (e.g. after a successful save) and advance. */
  onComplete: () => void;
}
