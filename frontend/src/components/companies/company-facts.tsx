"use client";

import * as React from "react";
import { BadgeCheck, ExternalLink, Lightbulb, MessageSquareQuote } from "lucide-react";
import type { CompanyFact } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export const FACT_KIND: Record<
  CompanyFact["kind"],
  { label: string; plural: string; explain: string; icon: typeof BadgeCheck; chip: string }
> = {
  verified: {
    label: "Verified fact",
    plural: "Verified facts",
    explain: "From the company's own site or official public records.",
    icon: BadgeCheck,
    chip: "bg-success-soft text-success",
  },
  opinion: {
    label: "Third-party opinion",
    plural: "Third-party opinions",
    explain: "From reviews or articles — subjective and may not reflect your experience.",
    icon: MessageSquareQuote,
    chip: "bg-info-soft text-info",
  },
  inferred: {
    label: "Inferred",
    plural: "Inferred by your agent",
    explain: "Your agent's reading of the posting and public info — verify before relying on it.",
    icon: Lightbulb,
    chip: "bg-warning-soft text-warning",
  },
};

const ORDER: CompanyFact["kind"][] = ["verified", "opinion", "inferred"];

/** Recent news-like facts ("press", "news", "blog" sources) — shown as "Recent developments". */
export function isDevelopment(f: CompanyFact) {
  return /news|press|blog|announce/i.test(f.source);
}

export function FactLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-caption text-muted", className)} aria-label="How to read company facts">
      {ORDER.map((k) => {
        const m = FACT_KIND[k];
        return (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("flex size-5 items-center justify-center rounded-md", m.chip)}>
              <m.icon className="size-3" aria-hidden />
            </span>
            {m.label}
          </li>
        );
      })}
    </ul>
  );
}

export function FactItem({ fact }: { fact: CompanyFact }) {
  const m = FACT_KIND[fact.kind] ?? FACT_KIND.inferred;
  return (
    <li className="flex gap-3">
      <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md", m.chip)} title={m.label}>
        <m.icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text">
          <span className="sr-only">{m.label}: </span>
          {fact.text}
        </p>
        <p className="mt-0.5 text-caption text-subtle">
          {fact.source_url ? (
            <a
              href={fact.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-primary hover:underline"
            >
              {fact.source} <ExternalLink className="size-3" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            fact.source
          )}
          {fact.as_of && <> · as of {formatDate(fact.as_of)}</>}
        </p>
      </div>
    </li>
  );
}

/** Company facts grouped by how trustworthy they are, each group clearly labelled. */
export function CompanyFactGroups({ facts, limit, className }: { facts: CompanyFact[]; limit?: number; className?: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const shown = limit && !expanded ? facts.slice(0, limit) : facts;
  const groups = ORDER.map((k) => ({ kind: k, items: shown.filter((f) => f.kind === k) })).filter((g) => g.items.length);
  if (!facts.length) return null;
  return (
    <div className={cn("space-y-5", className)}>
      {groups.map((g) => {
        const m = FACT_KIND[g.kind];
        return (
          <section key={g.kind} aria-label={m.plural}>
            <div className="mb-2.5">
              <p className="text-sm font-semibold">{m.plural}</p>
              <p className="text-caption text-subtle">{m.explain}</p>
            </div>
            <ul className="space-y-3">
              {g.items.map((f, i) => (
                <FactItem key={`${f.text}-${i}`} fact={f} />
              ))}
            </ul>
          </section>
        );
      })}
      {limit && facts.length > limit && (
        <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? "Show fewer" : `Show all ${facts.length} facts`}
        </button>
      )}
    </div>
  );
}
