"use client";

/** Building blocks shared by every Settings tab: panel header, cards, fieldsets and the save bar. */

import * as React from "react";
import { RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/feedback";

export function SettingsPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("animate-rise space-y-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-h2 font-semibold text-text">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** A titled group of settings rendered as a card. */
export function SettingsCard({
  title,
  description,
  icon,
  children,
  className,
  footer,
  tone = "default",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <Card className={cn(tone === "danger" && "border-danger/40", className)}>
      {(title || description) && (
        <div className="flex items-start gap-3 px-5 pt-5">
          {icon && (
            <span
              className={cn(
                "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]",
                tone === "danger" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-soft-fg",
              )}
              aria-hidden
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {title && <h3 className="text-h3 font-semibold text-text">{title}</h3>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
        </div>
      )}
      <div className="px-5 pb-5 pt-4">{children}</div>
      {footer && <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">{footer}</div>}
    </Card>
  );
}

/** Group label for controls that aren't a single input (chip groups, radio cards). */
export function FieldSet({
  legend,
  hint,
  children,
  className,
}: {
  legend: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const hintId = React.useId();
  return (
    <fieldset className={cn("min-w-0 space-y-2", className)} aria-describedby={hint ? hintId : undefined}>
      <legend className="text-sm font-medium text-text">{legend}</legend>
      {hint && (
        <p id={hintId} className="-mt-1 text-caption text-subtle">
          {hint}
        </p>
      )}
      {children}
    </fieldset>
  );
}

/**
 * Sticky save bar shown under a form. It stays visible (so the layout doesn't jump) and
 * announces unsaved changes to screen readers.
 */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onReset,
  disabled,
  message,
  saveLabel = "Save changes",
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onReset: () => void;
  disabled?: boolean;
  message?: React.ReactNode;
  saveLabel?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all lg:bottom-4",
        dirty ? "glass border-primary/30 shadow-pop" : "border-border bg-surface/60",
      )}
    >
      <p className="text-sm text-muted" aria-live="polite">
        {message ?? (dirty ? (
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-warning" aria-hidden /> You have unsaved changes
          </span>
        ) : (
          "All changes saved"
        ))}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onReset} disabled={!dirty || saving}>
          <RotateCcw /> Discard
        </Button>
        <Button size="sm" onClick={onSave} loading={saving} disabled={!dirty || disabled}>
          {!saving && <Save />} {saveLabel}
        </Button>
      </div>
    </div>
  );
}

export function PanelSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading settings">
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonCard key={i} lines={4} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Stable deep-equality check for plain JSON settings objects. */
export function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Local draft for a server-backed settings object. The draft resets whenever the server
 * value changes (e.g. after save) unless the user has local edits.
 */
export function useDraft<T>(server: T | undefined) {
  const [draft, setDraft] = React.useState<T | undefined>(server);
  const [base, setBase] = React.useState<T | undefined>(server);
  // Adopt new server data during render (React's recommended pattern for derived state).
  if (server !== undefined && !sameJson(server, base)) {
    const hadEdits = draft !== undefined && base !== undefined && !sameJson(draft, base);
    setBase(server);
    if (!hadEdits) setDraft(server);
  }
  const dirty = draft !== undefined && base !== undefined && !sameJson(draft, base);
  const reset = React.useCallback(() => setDraft(base), [base]);
  /** Call with the saved server value after a successful save. */
  const commit = React.useCallback((saved: T) => {
    setBase(saved);
    setDraft(saved);
  }, []);
  return { draft, setDraft, dirty, reset, commit, base };
}
