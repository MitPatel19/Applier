"use client";

/**
 * Application Preview — the exact summary of what will be sent, where, and whether it's ready.
 * Desktop: sticky side column. Mobile: sticky action bar + bottom sheet with the same content.
 */

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { AlertTriangle, CheckCircle2, ChevronUp, Globe, Info, Lock, Rocket, ScanEye, X, XCircle } from "lucide-react";
import type { ApplicationPreview, PreviewRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";

const ROW_ICON = {
  ok: { icon: CheckCircle2, cls: "text-success", sr: "Ready" },
  warning: { icon: AlertTriangle, cls: "text-warning", sr: "Needs attention" },
  missing: { icon: XCircle, cls: "text-danger", sr: "Missing" },
  info: { icon: null, cls: "", sr: "" },
} as const;

function Row({ row }: { row: PreviewRow }) {
  const meta = ROW_ICON[row.state];
  const Icon = meta.icon;
  return (
    <div className="py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">{row.label}</dt>
      <dd className="mt-0.5 flex items-start gap-1.5 text-sm font-medium text-text">
        {Icon && <Icon className={cn("mt-0.5 size-4 shrink-0", meta.cls)} aria-hidden />}
        {meta.sr && <span className="sr-only">{meta.sr}: </span>}
        <span className="min-w-0 break-words">{row.value}</span>
      </dd>
    </div>
  );
}

export function applyDisabledReason(preview: ApplicationPreview | undefined): string | null {
  if (!preview) return "Loading your application preview…";
  if (preview.can_approve) return null;
  if (preview.missing.length) {
    return `Resolve ${preview.missing.length === 1 ? "this" : "these"} first: ${preview.missing.join(", ")}.`;
  }
  return "Some required items still need attention — see Application Readiness.";
}

function methodCopy(preview: ApplicationPreview) {
  const host = preview.destination;
  if (preview.submission_method === "external_link") {
    return `After you confirm, we open ${host ?? "the employer's application page"} and you submit it yourself. Applier never submits without you.`;
  }
  if (preview.submission_method === "automation") {
    return `After you confirm, Applier fills the form on ${host ?? "the employer's site"}. It pauses for anything that needs you, like CAPTCHAs or sign-in codes.`;
  }
  return "This employer takes applications directly (for example by email). We'll give you everything you need to send it.";
}

export function PreviewContent({
  preview,
  onReview,
  onApply,
  onCancel,
  applying,
}: {
  preview: ApplicationPreview;
  onReview: () => void;
  onApply: () => void;
  onCancel: () => void;
  applying?: boolean;
}) {
  const reason = applyDisabledReason(preview);
  const reasonId = React.useId();
  return (
    <div>
      <dl className="divide-y divide-border">
        {preview.rows.map((r) => (
          <Row key={r.label} row={r} />
        ))}
      </dl>

      {preview.destination && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-bg-subtle px-3 py-2.5 text-caption text-muted">
          <Globe className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
          <span>
            <span className="font-medium text-text">Destination: {preview.destination}</span>
            <br />
            {methodCopy(preview)}
          </span>
        </p>
      )}

      <div className="mt-4 space-y-2">
        <Button variant="secondary" className="w-full" onClick={onReview}>
          <ScanEye /> Review Application
        </Button>
        <Button
          variant="gradient"
          size="lg"
          className="w-full"
          onClick={onApply}
          disabled={!!reason}
          loading={applying}
          aria-describedby={reason ? reasonId : undefined}
        >
          {!applying && <Rocket />} Apply Now
        </Button>
        {reason && (
          <p id={reasonId} className="flex items-start gap-1.5 text-caption text-warning">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {reason}
          </p>
        )}
        <Button variant="ghost" className="w-full" onClick={onCancel}>
          Cancel
        </Button>
        <p className="flex items-start gap-1.5 text-caption text-subtle">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Cancel keeps everything as a draft. Nothing is sent until you
          press Apply Now and confirm.
        </p>
      </div>
    </div>
  );
}

export function PreviewPanelSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
      <Skeleton className="h-12 w-full rounded-xl" />
    </div>
  );
}

/** Sticky bar for small screens, sitting above the app's bottom tab bar. */
export function MobileApplyBar({
  preview,
  onApply,
  applying,
  children,
}: {
  preview: ApplicationPreview | undefined;
  onApply: () => void;
  applying?: boolean;
  /** Full preview content shown in the bottom sheet (receives a function that closes it). */
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const reason = applyDisabledReason(preview);
  const answers = preview ? `${preview.answers_completed}/${preview.answers_total} answers` : "";
  return (
    <>
      <div
        className="glass fixed inset-x-0 bottom-[calc(3.9rem+env(safe-area-inset-bottom))] z-30 border-t border-border px-4 py-2.5 shadow-pop lg:hidden"
        role="region"
        aria-label="Apply actions"
      >
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left"
            aria-haspopup="dialog"
          >
            <ChevronUp className="size-4 shrink-0 text-subtle" aria-hidden />
            <span className="min-w-0">
              <span className={cn("block truncate text-sm font-semibold", reason ? "text-warning" : "text-success")}>
                {!preview ? "Loading…" : reason ? (preview.missing.length ? `${preview.missing.length} to resolve` : "Needs attention") : "Ready to apply"}
              </span>
              <span className="block truncate text-caption text-subtle">{answers} · Tap for preview</span>
            </span>
          </button>
          <Button variant="gradient" onClick={onApply} disabled={!!reason} loading={applying} className="shrink-0">
            {!applying && <Rocket />} Apply Now
          </Button>
        </div>
      </div>

      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in lg:hidden" />
          <D.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-border bg-surface shadow-pop focus:outline-none data-[state=open]:animate-rise lg:hidden">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong" aria-hidden />
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
              <div>
                <D.Title asChild>
                  <Eyebrow>Application Preview</Eyebrow>
                </D.Title>
                <D.Description className="sr-only">Summary of what will be sent and where</D.Description>
              </div>
              <D.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close preview">
                  <X />
                </Button>
              </D.Close>
            </div>
            <div className="overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] scrollbar-thin">
              {children(() => setOpen(false))}
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
