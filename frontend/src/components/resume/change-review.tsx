"use client";

/**
 * Resume Changes review — every edit Applier made to a tailored resume, grouped by kind, with a
 * before → after diff, the reason, and a per-change Accept / Reject decision. Shared by the
 * application "Ready to Apply" screen and the tailored-version page.
 */

import * as React from "react";
import {
  ArrowDownUp,
  Check,
  CheckCheck,
  FileDown,
  Highlighter,
  KeyRound,
  Lightbulb,
  MinusCircle,
  PenLine,
  ShieldCheck,
  Text as TextIcon,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import type { ResumeChange, ResumeChangeType, ResumeVersionDetail } from "@/lib/types";
import { resumeUrls, useResumeVersion, useVersionDecisions } from "@/lib/queries/resumes";
import { cn, titleCase } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Eyebrow } from "@/components/ui/card";
import { DownloadLink } from "@/components/apply/bits";

export const CHANGE_GROUPS: { type: ResumeChangeType; label: string; icon: LucideIcon; hint: string }[] = [
  { type: "emphasize", label: "Added emphasis", icon: Highlighter, hint: "Existing experience moved forward or highlighted." },
  { type: "reorder", label: "Reordered", icon: ArrowDownUp, hint: "Sections or bullets reordered so the most relevant come first." },
  { type: "rewrite", label: "Rewritten", icon: PenLine, hint: "Wording adjusted to mirror the posting — facts unchanged." },
  { type: "keyword", label: "Keywords", icon: KeyRound, hint: "Keywords from the posting that you already have, surfaced for ATS." },
  { type: "summary", label: "Summary", icon: TextIcon, hint: "Your summary tuned to this role." },
  { type: "remove", label: "Removed", icon: MinusCircle, hint: "Less relevant items dropped to keep the resume focused." },
];

// ------------------------------------------------------------------ word diff

type Segment = { text: string; kind: "same" | "add" | "del" };

/** Word-level LCS diff. Returns null for very long inputs (caller falls back to plain blocks). */
export function wordDiff(before: string, after: string): Segment[] | null {
  const a = before.split(/(\s+)/);
  const b = after.split(/(\s+)/);
  if (a.length * b.length > 250_000) return null;
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: Segment[] = [];
  const push = (text: string, kind: Segment["kind"]) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(a[i], "same");
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push(a[i++], "del");
    } else {
      push(b[j++], "add");
    }
  }
  while (i < n) push(a[i++], "del");
  while (j < m) push(b[j++], "add");
  return out;
}

function DiffBlock({ before, after }: { before: string | null; after: string | null }) {
  const segments = before && after ? wordDiff(before, after) : null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {before !== null && (
        <div className="rounded-lg border border-danger/20 bg-danger-soft/40 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-danger">Before</p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
            {segments
              ? segments
                  .filter((s) => s.kind !== "add")
                  .map((s, k) =>
                    s.kind === "del" ? (
                      <del key={k} className="rounded bg-danger-soft px-0.5 text-danger decoration-danger/60">
                        {s.text}
                      </del>
                    ) : (
                      <span key={k}>{s.text}</span>
                    ),
                  )
              : before}
          </p>
        </div>
      )}
      {after !== null && (
        <div className={cn("rounded-lg border border-success/25 bg-success-soft/40 p-3", before === null && "sm:col-span-2")}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-success">After</p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-text">
            {segments
              ? segments
                  .filter((s) => s.kind !== "del")
                  .map((s, k) =>
                    s.kind === "add" ? (
                      <ins key={k} className="rounded bg-success-soft px-0.5 font-medium text-success no-underline">
                        {s.text}
                      </ins>
                    ) : (
                      <span key={k}>{s.text}</span>
                    ),
                  )
              : after}
          </p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ change row

function DecisionButtons({
  change,
  busy,
  readOnly,
  onDecide,
}: {
  change: ResumeChange;
  busy: boolean;
  readOnly?: boolean;
  onDecide: (accepted: boolean) => void;
}) {
  if (readOnly) {
    return (
      <Badge tone={change.accepted === true ? "success" : change.accepted === false ? "neutral" : "warning"} size="xs">
        {change.accepted === true ? "Accepted" : change.accepted === false ? "Rejected" : "Not reviewed"}
      </Badge>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={`Decision for: ${change.title}`}>
      <Button
        size="xs"
        variant={change.accepted === true ? "success" : "secondary"}
        aria-pressed={change.accepted === true}
        disabled={busy}
        onClick={() => onDecide(true)}
      >
        <Check /> {change.accepted === true ? "Accepted" : "Accept"}
      </Button>
      <Button
        size="xs"
        variant={change.accepted === false ? "danger" : "ghost"}
        aria-pressed={change.accepted === false}
        disabled={busy}
        onClick={() => onDecide(false)}
      >
        <X /> {change.accepted === false ? "Rejected" : "Reject"}
      </Button>
    </div>
  );
}

function ChangeRow({
  change,
  busy,
  readOnly,
  onDecide,
}: {
  change: ResumeChange;
  busy: boolean;
  readOnly?: boolean;
  onDecide: (accepted: boolean) => void;
}) {
  return (
    <li
      className={cn(
        "rounded-xl border p-3.5 transition-colors sm:p-4",
        change.accepted === true && "border-success/30 bg-success-soft/15",
        change.accepted === false && "border-border bg-bg-subtle/60 opacity-75",
        change.accepted === null && "border-border bg-surface",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">{change.title}</p>
          <p className="mt-0.5 text-caption text-subtle">
            {titleCase(change.section)}
            {change.accepted === null && !readOnly && <span className="ml-2 font-medium text-warning">· Needs your decision</span>}
          </p>
        </div>
        <DecisionButtons change={change} busy={busy} readOnly={readOnly} onDecide={onDecide} />
      </div>
      {(change.before !== null || change.after !== null) && (
        <div className="mt-3">
          <DiffBlock before={change.before} after={change.after} />
        </div>
      )}
      <p className="mt-3 flex items-start gap-2 text-sm text-muted">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <span>
          <span className="sr-only">Why: </span>
          {change.reason}
        </span>
      </p>
    </li>
  );
}

// ------------------------------------------------------------------ main

export function ChangeReview({
  version: initial,
  readOnly,
  showDownloads = true,
  className,
}: {
  version: ResumeVersionDetail;
  readOnly?: boolean;
  showDownloads?: boolean;
  className?: string;
}) {
  const { data } = useResumeVersion(initial.id, initial);
  const version = data ?? initial;
  const decide = useVersionDecisions(version.id);
  const [busyIds, setBusyIds] = React.useState<string[]>([]);
  const locked = readOnly || version.status === "approved";

  const run = (decisions: Record<string, boolean>, message?: string) => {
    const ids = Object.keys(decisions);
    setBusyIds((b) => [...b, ...ids]);
    decide.mutate(decisions, {
      onSuccess: () => {
        if (message) toast.success(message);
      },
      onError: (e) => toast.error(errorMessage(e, "We couldn't save that decision. Please try again.")),
      onSettled: () => setBusyIds((b) => b.filter((x) => !ids.includes(x))),
    });
  };

  const pending = version.changes.filter((c) => c.accepted === null);
  const accepted = version.changes.filter((c) => c.accepted === true).length;
  const rejected = version.changes.filter((c) => c.accepted === false).length;
  const groups = CHANGE_GROUPS.map((g) => ({ ...g, items: version.changes.filter((c) => c.type === g.type) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className={cn("space-y-6", className)}>
      {/* Summary + bulk actions */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg-subtle/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">
            {version.changes.length === 0
              ? "No changes were needed"
              : `${version.changes.length} suggested ${version.changes.length === 1 ? "change" : "changes"}`}
          </p>
          <p className="mt-0.5 text-sm text-muted" aria-live="polite">
            {accepted} accepted · {rejected} rejected · {pending.length} awaiting your decision
            {version.status === "approved" && " · Approved"}
          </p>
        </div>
        {!locked && pending.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="soft"
              loading={decide.isPending && busyIds.length > 1}
              onClick={() =>
                run(Object.fromEntries(pending.map((c) => [c.id, true])), `Accepted ${pending.length} ${pending.length === 1 ? "change" : "changes"}`)
              }
            >
              <CheckCheck /> Accept all
            </Button>
          </div>
        )}
      </div>

      <Callout tone="primary" icon={<ShieldCheck />} title="Applier never adds skills or experience you don't have">
        Every change rearranges, emphasizes or rewords facts already in your profile. Rejected changes are reverted in the final
        document. Undecided changes are treated as rejected when the resume is approved.
      </Callout>

      {version.integrity_notes.length > 0 && (
        <ul className="space-y-1.5 text-sm text-muted">
          {version.integrity_notes.map((n) => (
            <li key={n} className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> {n}
            </li>
          ))}
        </ul>
      )}

      {groups.map((g) => {
        const Icon = g.icon;
        return (
          <section key={g.type} aria-labelledby={`chg-${g.type}`} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <h4 id={`chg-${g.type}`} className="text-sm font-semibold">
                  {g.label} <span className="font-normal text-subtle">({g.items.length})</span>
                </h4>
                <p className="text-caption text-subtle">{g.hint}</p>
              </div>
            </div>
            <ul className="space-y-2.5">
              {g.items.map((c) => (
                <ChangeRow
                  key={c.id}
                  change={c}
                  readOnly={locked}
                  busy={busyIds.includes(c.id)}
                  onDecide={(acceptedValue) => {
                    if (c.accepted === acceptedValue) return;
                    run({ [c.id]: acceptedValue });
                  }}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {(version.keywords_matched.length > 0 || version.keywords_missing.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {version.keywords_matched.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <Eyebrow>Keywords matched</Eyebrow>
              <p className="mt-1 text-caption text-subtle">From the posting and present in your resume.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {version.keywords_matched.map((k) => (
                  <Badge key={k} tone="success" size="xs">
                    <Check className="size-3" aria-hidden /> {k}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {version.keywords_missing.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <Eyebrow>Not added (not in your profile)</Eyebrow>
              <p className="mt-1 text-caption text-subtle">
                The posting mentions these, but you haven&apos;t listed them — so we left them out. Add them to your profile only if
                they&apos;re true.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {version.keywords_missing.map((k) => (
                  <Badge key={k} tone="outline" size="xs">
                    {k}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showDownloads && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button asChild size="sm" variant="secondary">
            <a href={resumeUrls.versionRender(version.id, "pdf")} target="_blank" rel="noopener noreferrer">
              <FileDown /> Preview PDF
            </a>
          </Button>
          <DownloadLink href={resumeUrls.versionRender(version.id, "pdf")} variant="ghost">
            Download PDF
          </DownloadLink>
          <DownloadLink href={resumeUrls.versionRender(version.id, "docx")} variant="ghost">
            Download DOCX
          </DownloadLink>
          <span className="ml-auto truncate text-caption text-subtle">{version.file_name}</span>
        </div>
      )}
    </div>
  );
}
