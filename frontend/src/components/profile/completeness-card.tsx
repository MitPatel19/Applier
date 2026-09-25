"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import type { FullProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, Eyebrow } from "@/components/ui/card";
import { ScoreRing } from "@/components/ui/score";
import { scrollToSection } from "@/components/apply/bits";

/** Where each completeness item is fixed. External routes are links; anything else scrolls to a section. */
const TARGET: Record<string, { section?: string; href?: string }> = {
  contact: { section: "personal" },
  links: { section: "personal" },
  headline: { section: "professional" },
  summary: { section: "professional" },
  job_preferences: { section: "professional" },
  work_authorization: { section: "authorization" },
  experience: { section: "experience" },
  education: { section: "education" },
  skills: { section: "skills" },
  projects: { section: "projects" },
  resume: { href: "/resumes" },
};

export function CompletenessCard({ completeness }: { completeness: FullProfile["completeness"] }) {
  const todo = completeness.items.filter((i) => !i.done).sort((a, b) => b.weight - a.weight);
  const done = completeness.items.filter((i) => i.done);
  const pct = completeness.percent;
  const message =
    pct >= 90
      ? "Excellent — Applier has everything it needs to tailor strong applications."
      : pct >= 60
        ? "Good start. A few more details will noticeably improve your matches."
        : "The more Applier knows, the better it matches and tailors — without ever inventing anything.";

  return (
    <Card className="overflow-hidden">
      <div className="h-1 bg-gradient-brand" aria-hidden />
      <div className="p-5">
        <div className="flex items-center gap-4">
          <ScoreRing score={pct} size={72} stroke={6} label="Profile completeness" />
          <div className="min-w-0">
            <Eyebrow>Profile strength</Eyebrow>
            <p className="mt-1 text-sm text-muted">{message}</p>
          </div>
        </div>

        {todo.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold">Next steps</p>
            <ul className="space-y-1">
              {todo.map((i) => {
                const t = TARGET[i.key] ?? { section: "personal" };
                const inner = (
                  <>
                    <Circle className="size-4 shrink-0 text-subtle" aria-hidden />
                    <span className="min-w-0 flex-1">{i.label}</span>
                    <span className="text-caption text-subtle">+{i.weight}%</span>
                    <ArrowRight className="size-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </>
                );
                const cls = "group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-bg-subtle";
                return (
                  <li key={i.key}>
                    {t.href ? (
                      <Link href={t.href} className={cls}>
                        {inner}
                      </Link>
                    ) : (
                      <button type="button" className={cls} onClick={() => t.section && scrollToSection(t.section)}>
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {done.length > 0 && (
          <details className="group/done mt-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-muted hover:text-text">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-success" aria-hidden /> {done.length} completed
              </span>
            </summary>
            <ul className="mt-2 space-y-1">
              {done.map((i) => (
                <li key={i.key} className={cn("flex items-center gap-2.5 px-2 py-1 text-sm text-muted")}>
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /> {i.label}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}
