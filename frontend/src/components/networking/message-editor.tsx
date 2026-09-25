"use client";

import * as React from "react";
import { Check, Copy, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";

/** Copies text to the clipboard with a short "Copied" confirmation. */
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  size = "sm",
  variant = "secondary",
  className,
  iconOnly,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error("Couldn't access the clipboard. Select the text and copy it manually.");
    }
  };
  return (
    <Button
      type="button"
      size={iconOnly ? "icon-sm" : size}
      variant={variant}
      onClick={onCopy}
      className={className}
      aria-label={iconOnly ? (copied ? copiedLabel : label) : undefined}
      disabled={!text}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      {!iconOnly && (copied ? copiedLabel : label)}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </Button>
  );
}

export function mailtoHref(to: string | null | undefined, subject: string, body: string) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  return `mailto:${to ?? ""}?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * Editable generated message (subject + body) with copy and "Open email" actions.
 * Nothing is ever sent automatically — the user copies it or opens their own mail client.
 */
export function MessageEditor({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  generatedBy,
  email,
  className,
  actions,
  rows = 10,
}: {
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  generatedBy?: "template" | "ai" | null;
  email?: string | null;
  className?: string;
  actions?: React.ReactNode;
  rows?: number;
}) {
  const full = subject ? `Subject: ${subject}\n\n${body}` : body;
  const placeholders = Array.from(new Set(body.match(/\[[^\]\n]{2,80}\]|\{\{[^}]+\}\}/g) ?? []));
  return (
    <div className={cn("space-y-3 rounded-xl border border-border bg-surface-2 p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-primary" /> Draft message
        </p>
        {generatedBy && (
          <Badge tone={generatedBy === "ai" ? "primary" : "neutral"} size="xs">
            {generatedBy === "ai" ? "AI-written draft" : "From template"}
          </Badge>
        )}
      </div>
      <Field label="Subject">
        <Input value={subject} onChange={(e) => onSubjectChange(e.target.value)} placeholder="Subject line" />
      </Field>
      <Field label="Message" hint="Review and personalize before sending — Applier never sends messages for you.">
        <Textarea value={body} onChange={(e) => onBodyChange(e.target.value)} rows={rows} />
      </Field>
      {placeholders.length > 0 && (
        <p className="text-caption text-warning">
          Fill in before sending: {placeholders.slice(0, 4).join(", ")}
          {placeholders.length > 4 ? "…" : ""}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={full} label="Copy message" />
        <Button asChild size="sm" variant="secondary">
          <a href={mailtoHref(email, subject, body)}>
            <Mail /> Open email
          </a>
        </Button>
        {actions}
      </div>
    </div>
  );
}
