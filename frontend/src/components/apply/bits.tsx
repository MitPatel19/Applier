"use client";

/** Small building blocks shared by the apply, resume, cover-letter and profile screens. */

import * as React from "react";
import { AlertCircle, Check, CheckCircle2, CircleDashed, Cloud, Copy, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/primitives";
import type { AutosaveStatus } from "./use-autosave";

/** Copy text to the clipboard with visual + screen-reader feedback. */
export function CopyButton({
  text,
  label = "Copy",
  showLabel,
  size = "icon-sm",
  variant = "ghost",
  className,
  successMessage = "Copied to clipboard",
}: {
  text: string;
  label?: string;
  showLabel?: boolean;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
  successMessage?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(successMessage);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Your browser blocked clipboard access. Select the text and copy it manually.");
    }
  };
  const btn = (
    <Button
      type="button"
      variant={variant}
      size={showLabel && size === "icon-sm" ? "xs" : size}
      onClick={onCopy}
      disabled={!text}
      aria-label={showLabel ? undefined : label}
      className={className}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      {showLabel && <span>{copied ? "Copied" : label}</span>}
    </Button>
  );
  return showLabel ? btn : <Tooltip content={copied ? "Copied" : label}>{btn}</Tooltip>;
}

/** "Saving… / Saved / Couldn't save" indicator for autosaving fields. */
export function SaveIndicator({
  status,
  error,
  onRetry,
  className,
}: {
  status: AutosaveStatus;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-h-5 items-center gap-1.5 text-caption", className)} aria-live="polite">
      {status === "pending" && (
        <>
          <CircleDashed className="size-3.5 text-subtle" /> <span className="text-subtle">Unsaved changes</span>
        </>
      )}
      {status === "saving" && (
        <>
          <Loader2 className="size-3.5 animate-spin text-primary" /> <span className="text-muted">Saving…</span>
        </>
      )}
      {status === "saved" && (
        <>
          <Cloud className="size-3.5 text-success" /> <span className="text-muted">Saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="size-3.5 text-danger" />
          <span className="text-danger">{error ?? "Couldn't save"}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <RotateCw className="size-3" /> Retry
            </button>
          )}
        </>
      )}
    </span>
  );
}

/** Numbered/iconed "what happens next" list used in dialogs and panels. */
export function StepsList({ steps, className }: { steps: { label: React.ReactNode; done?: boolean; you?: boolean }[]; className?: string }) {
  return (
    <ol className={cn("space-y-2", className)}>
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm">
          <span
            className={cn(
              "mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              s.done ? "bg-success-soft text-success" : s.you ? "bg-primary-soft text-primary-soft-fg" : "bg-bg-subtle text-muted",
            )}
            aria-hidden
          >
            {s.done ? <CheckCircle2 className="size-3.5" /> : i + 1}
          </span>
          <span className={cn("min-w-0 flex-1", s.done ? "text-muted" : "text-text")}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Smoothly scroll to a section and move focus to it for keyboard/screen-reader users. */
export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-motion");
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

/** Download link styled as a button. */
export function DownloadLink({
  href,
  children,
  variant = "secondary",
  size = "sm",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <a href={href} download>
        {children}
      </a>
    </Button>
  );
}
