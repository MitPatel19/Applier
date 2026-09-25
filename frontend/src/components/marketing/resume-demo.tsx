"use client";

import * as React from "react";
import { Check, ShieldCheck, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Decision = boolean | null;

const CHANGES = [
  {
    id: "c1",
    type: "Rewrite",
    title: "Lead with measurable impact",
    before: "Worked on the internal REST API for the scheduling tool.",
    after: "Built 12 REST endpoints for the scheduling tool in FastAPI, cutting page load time by 35%.",
    reason: "Uses the metric already in your profile; matches “API development” in the posting.",
  },
  {
    id: "c2",
    type: "Reorder",
    title: "Move “Capstone: Inventory Platform” above coursework",
    before: null,
    after: null,
    reason: "Your most relevant React + PostgreSQL project should be seen first.",
  },
  {
    id: "c3",
    type: "Keyword",
    title: "Surface “CI/CD” from your GitHub Actions work",
    before: "Set up automated tests on GitHub.",
    after: "Set up CI/CD with GitHub Actions to run tests on every pull request.",
    reason: "Describes what you already did using the posting's terminology.",
  },
];

/** Interactive example of the resume change review (accept / reject each suggestion). */
export function ResumeChangesDemo() {
  const [decisions, setDecisions] = React.useState<Record<string, Decision>>({ c1: true, c2: null, c3: null });
  const decided = Object.values(decisions).filter((d) => d !== null).length;
  const set = (id: string, d: Decision) => setDecisions((prev) => ({ ...prev, [id]: d }));

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Suggested changes · Full Stack Developer</p>
          <p className="text-caption text-subtle">Interactive example — try accepting or rejecting</p>
        </div>
        <Badge tone="primary" size="xs" className="tabular" aria-live="polite">
          {decided}/{CHANGES.length} reviewed
        </Badge>
      </div>
      <ul className="divide-y divide-border">
        {CHANGES.map((c) => {
          const d = decisions[c.id];
          return (
            <li key={c.id} className={cn("p-4 transition-colors", d === false && "bg-bg-subtle/60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge size="xs" tone="outline">
                      {c.type}
                    </Badge>
                    {d === true && (
                      <Badge size="xs" tone="success">
                        Accepted
                      </Badge>
                    )}
                    {d === false && (
                      <Badge size="xs" tone="neutral">
                        Rejected
                      </Badge>
                    )}
                  </div>
                  <p className={cn("mt-1.5 text-sm font-medium", d === false && "text-muted line-through")}>{c.title}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {d === null ? (
                    <>
                      <button
                        type="button"
                        onClick={() => set(c.id, false)}
                        className="flex size-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
                        aria-label={`Reject: ${c.title}`}
                      >
                        <X className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => set(c.id, true)}
                        className="flex size-8 items-center justify-center rounded-lg bg-success-soft text-success transition-colors hover:brightness-110"
                        aria-label={`Accept: ${c.title}`}
                      >
                        <Check className="size-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => set(c.id, null)}
                      className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:bg-bg-subtle hover:text-text"
                      aria-label={`Undo decision: ${c.title}`}
                    >
                      <Undo2 className="size-3.5" /> Undo
                    </button>
                  )}
                </div>
              </div>
              {c.before && c.after && d !== false && (
                <div className="mt-3 space-y-1.5 text-sm">
                  <p className="rounded-lg bg-danger-soft/50 px-3 py-2 text-muted line-through decoration-danger/40">{c.before}</p>
                  <p className="rounded-lg bg-success-soft/60 px-3 py-2 text-text">{c.after}</p>
                </div>
              )}
              <p className="mt-2 text-caption text-subtle">Why: {c.reason}</p>
            </li>
          );
        })}
      </ul>
      <div className="flex items-start gap-2.5 border-t border-border bg-success-soft/40 px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <p className="text-sm text-muted">
          <span className="font-semibold text-text">Integrity promise:</span> Applier never invents experience, skills,
          titles or results. Every suggestion traces back to your real profile.
        </p>
      </div>
    </div>
  );
}
