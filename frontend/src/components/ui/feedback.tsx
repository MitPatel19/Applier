"use client";

/**
 * Loading, empty and error states. Every data view should render one of these instead of
 * raw spinners or technical errors.
 */

import * as React from "react";
import { AlertTriangle, ChevronDown, RotateCw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-lg", className)} aria-hidden {...props} />;
}

export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-5", className)} aria-hidden>
      <Skeleton className="h-4 w-2/5" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-3/5" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={2} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)}>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong bg-surface/60 text-center",
        compact ? "px-6 py-8" : "px-6 py-16",
        className,
      )}
    >
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      {icon && (
        <div className="relative mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-fg shadow-glow [&_svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className="relative text-h2 font-semibold">{title}</h3>
      {description && <p className="relative mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>}
      {(action || secondaryAction) && (
        <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

/**
 * Friendly error with Retry / Details / Continue. Never shows stack traces; "Details" only
 * reveals the error code + safe message for support purposes.
 */
export function ErrorState({
  error,
  title = "We couldn't load this right now",
  onRetry,
  onContinue,
  continueLabel = "Continue",
  className,
  compact,
}: {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  className?: string;
  compact?: boolean;
}) {
  const [showDetails, setShowDetails] = React.useState(false);
  const apiErr = error instanceof ApiError ? error : null;
  const message = apiErr?.message ?? "Please check your connection and try again. Your data is safe.";
  return (
    <div
      role="alert"
      className={cn(
        "rounded-2xl border border-warning/30 bg-warning-soft/40",
        compact ? "p-4" : "p-6",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
          <AlertTriangle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text">{title}</h3>
          <p className="mt-1 text-sm text-muted">{message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                <RotateCw /> Retry
              </Button>
            )}
            {onContinue && (
              <Button size="sm" variant="ghost" onClick={onContinue}>
                {continueLabel}
              </Button>
            )}
            {apiErr && (
              <Button size="sm" variant="ghost" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails}>
                Details <ChevronDown className={cn("transition-transform", showDetails && "rotate-180")} />
              </Button>
            )}
          </div>
          {showDetails && apiErr && (
            <p className="mt-3 rounded-lg bg-bg-subtle px-3 py-2 font-mono text-xs text-muted">
              Code: {apiErr.code} · Status: {apiErr.status || "offline"}
              {apiErr.retryable ? " · Safe to retry" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Inline notice / callout. */
export function Callout({
  tone = "info",
  icon,
  title,
  children,
  className,
  action,
}: {
  tone?: "info" | "success" | "warning" | "danger" | "primary";
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const tones = {
    info: "border-info/25 bg-info-soft/60 [&_.ci]:text-info",
    success: "border-success/25 bg-success-soft/60 [&_.ci]:text-success",
    warning: "border-warning/30 bg-warning-soft/60 [&_.ci]:text-warning",
    danger: "border-danger/30 bg-danger-soft/60 [&_.ci]:text-danger",
    primary: "border-primary/25 bg-primary-soft/60 [&_.ci]:text-primary-soft-fg",
  };
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", tones[tone], className)}>
      {icon && <span className="ci mt-0.5 shrink-0 [&_svg]:size-[18px]">{icon}</span>}
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold text-text">{title}</p>}
        {children && <div className={cn("text-muted", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
