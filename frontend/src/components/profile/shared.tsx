"use client";

/** Helpers shared by the profile sections. */

import * as React from "react";
import { Save, Undo2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Server validation message for a field (`details[].field` looks like "body.phone" or "phone"). */
export function apiFieldError(err: unknown, field: string): string | null {
  if (!(err instanceof ApiError)) return null;
  return err.fieldErrors.find((f) => f.field === field || f.field.endsWith(`.${field}`))?.message ?? null;
}

/** First validation error that isn't tied to one of `known` fields — shown at the section level. */
export function apiGeneralError(err: unknown, known: string[]): string | null {
  if (!err) return null;
  if (err instanceof ApiError) {
    const other = err.fieldErrors.find((f) => !known.some((k) => f.field === k || f.field.endsWith(`.${k}`)));
    if (err.fieldErrors.length && !other) return null;
    return other ? `${other.field.split(".").pop()}: ${other.message}` : err.message;
  }
  return "Something went wrong. Please try again.";
}

/** "2024-03-01" → "2024-03" for <input type="month">. */
export function toMonth(date: string | null | undefined) {
  return date ? date.slice(0, 7) : "";
}
/** "2024-03" → "2024-03-01" (API expects full dates). */
export function fromMonth(month: string) {
  return month ? `${month}-01` : null;
}
export function formatMonth(date: string | null | undefined) {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
export function monthRange(start: string | null | undefined, end: string | null | undefined, current = false) {
  const s = formatMonth(start);
  const e = current || !end ? (s ? "Present" : null) : formatMonth(end);
  if (!s && !e) return null;
  return `${s ?? "?"} – ${e ?? "?"}`;
}

export function emptyToNull(v: string) {
  const t = v.trim();
  return t ? t : null;
}

/** Card wrapper for one profile section, with an anchor for the completeness checklist. */
export function ProfileSection({
  id,
  title,
  description,
  icon,
  actions,
  children,
  footer,
  onSubmit,
}: {
  onSubmit?: (e: React.FormEvent) => void;
  id: string;
  title: string;
  description?: React.ReactNode;
  icon: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 focus:outline-none">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4 sm:p-6 sm:pb-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg [&_svg]:size-[18px]" aria-hidden>
              {icon}
            </span>
            <div>
              <h2 id={`${id}-title`} className="text-h2 font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
          </div>
          {actions}
        </div>
        {onSubmit ? (
          <form onSubmit={onSubmit} noValidate>
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
            {footer}
          </form>
        ) : (
          <>
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
            {footer}
          </>
        )}
      </Card>
    </section>
  );
}

/** Save / Discard footer for sections with explicit save. Must be rendered inside the section's form. */
export function SectionFooter({
  dirty,
  saving,
  onDiscard,
  error,
}: {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
  error?: string | null;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3 transition-colors sm:px-6",
        dirty && "bg-primary-soft/25",
      )}
    >
      {error ? (
        <p role="alert" className="mr-auto text-sm text-danger">
          {error}
        </p>
      ) : (
        <p className="mr-auto text-caption text-subtle" aria-live="polite">
          {dirty ? "You have unsaved changes" : "All changes saved"}
        </p>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onDiscard} disabled={!dirty || saving}>
        <Undo2 /> Discard
      </Button>
      <Button type="submit" size="sm" disabled={!dirty} loading={saving}>
        {!saving && <Save />} Save
      </Button>
    </div>
  );
}
