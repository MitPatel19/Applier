"use client";

import * as React from "react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { Bot, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { AgentStepList } from "@/components/app/agent-progress";
import { SourceList } from "@/components/app/status";
import { Badge } from "@/components/ui/badge";
import { ScoreBar, ScoreRing } from "@/components/ui/score";
import type { AgentStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useHydrated } from "./theme-toggle";

function step(key: string, label: string, status: AgentStep["status"], detail: string | null = null): AgentStep {
  return { key, label, status, detail, count: null, started_at: null, finished_at: null };
}

const SAMPLE_STEPS: AgentStep[] = [
  step("search_linkedin", "Searching LinkedIn", "done", "42 jobs found"),
  step("search_indeed", "Searching Indeed", "done", "31 jobs found"),
  step("search_company_sites", "Checking career pages", "done", "18 jobs found"),
  step("dedupe", "Removing duplicates", "done", "82 unique jobs"),
  step("score", "Scoring your matches", "running"),
  step("recommend", "Picking top jobs", "pending"),
];

const SAMPLE_SOURCES = [
  { source: "linkedin", source_label: "LinkedIn" },
  { source: "indeed", source_label: "Indeed" },
  { source: "company_site", source_label: "Company Website" },
];

/** Parallax offset that only activates after hydration and never under reduced motion. */
function useParallax(progress: MotionValue<number>, distance: number) {
  return useTransform(progress, [0, 1], [0, distance]);
}

function Float({
  children,
  className,
  y,
  enabled,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  y: MotionValue<number>;
  enabled: boolean;
  delay?: number;
}) {
  return (
    <motion.div className={className} style={enabled ? { y } : undefined}>
      <motion.div
        animate={enabled ? { y: [0, -6, 0] } : undefined}
        transition={enabled ? { duration: 6, repeat: Infinity, ease: "easeInOut", delay } : undefined}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function HeroVisual({ className }: { className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  const enabled = hydrated && !reduce;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const yBack = useParallax(scrollYProgress, -30);
  const yFront = useParallax(scrollYProgress, -70);
  const yLeft = useParallax(scrollYProgress, -45);

  return (
    <div ref={ref} className={cn("relative mx-auto w-full max-w-xl lg:mb-20 lg:max-w-none", className)} aria-hidden>
      {/* soft glow */}
      <div className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-gradient-brand opacity-[0.10] blur-3xl" />

      {/* Career agent panel */}
      <Float y={yBack} enabled={enabled} className="relative">
        <div className="glass rounded-2xl border border-border p-5 shadow-pop sm:p-6 lg:w-[80%]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
                <Bot className="size-[18px]" />
              </span>
              <div>
                <p className="text-sm font-semibold">Career Agent</p>
                <p className="text-caption text-subtle">Morning search · Toronto, Remote Canada</p>
              </div>
            </div>
            <Badge tone="primary" size="xs" dot className="[&>span:first-child]:animate-pulse-dot">
              Working
            </Badge>
          </div>
          <AgentStepList steps={SAMPLE_STEPS} className="mt-4" />
        </div>
      </Float>

      {/* Ready to apply card */}
      <Float
        y={yFront}
        enabled={enabled}
        delay={0.8}
        className="relative -mt-3 ml-auto w-[88%] sm:w-[78%] lg:absolute lg:-right-2 lg:top-[30%] lg:mt-0 lg:w-[17.5rem]"
      >
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-pop">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Badge tone="success" size="xs">
                <Sparkles className="size-3" /> Ready to Apply
              </Badge>
              <p className="mt-2 truncate text-sm font-semibold">Junior Full Stack Developer</p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-caption text-muted">
                Northwind Labs · <MapPin className="size-3" /> Toronto, ON
              </p>
            </div>
            <ScoreRing score={87} size={58} stroke={5} />
          </div>
          <SourceList sources={SAMPLE_SOURCES} className="mt-3 block text-caption" />
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-bg-subtle px-3 py-2 text-caption text-muted">
            <ShieldCheck className="size-3.5 shrink-0 text-success" />
            Waiting for your approval
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <span className="flex h-8 items-center justify-center rounded-lg border border-border text-xs font-medium text-muted">
              Review
            </span>
            <span className="flex h-8 items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-fg">
              Approve & apply
            </span>
          </div>
        </div>
      </Float>

      {/* Match breakdown card */}
      <Float
        y={yLeft}
        enabled={enabled}
        delay={1.6}
        className="relative -mt-2 w-[92%] sm:w-[80%] lg:absolute lg:-bottom-24 lg:left-6 lg:mt-0 lg:w-[22rem]"
      >
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-pop">
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-subtle">Why it&apos;s a match</p>
          <div className="mt-3 space-y-2.5">
            <ScoreBar label="Technical skills" score={92} />
            <ScoreBar label="Experience" score={78} />
            <ScoreBar label="Location" score={100} />
          </div>
        </div>
      </Float>
    </div>
  );
}
