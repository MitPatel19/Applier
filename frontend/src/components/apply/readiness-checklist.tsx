"use client";

/**
 * Application Readiness checklist — ✅ ok / ⚠️ warning / ❌ missing. Resolvable items are fixed
 * inline (profile field → PATCH /profile, salary → PATCH application) and readiness is refreshed
 * right after, so the user sees the effect of every fix immediately.
 */

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { ProfileIn, ReadinessItem } from "@/lib/types";
import { useRefreshReadiness, useUpdateApplication } from "@/lib/queries/prepare";
import { useUpdateProfile } from "@/lib/queries/profile";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/score";

export type ReadinessTarget = "answers" | "cover_letter" | "resume";

const STATE_META = {
  ok: { icon: CheckCircle2, cls: "text-success", label: "Ready" },
  warning: { icon: AlertTriangle, cls: "text-warning", label: "Warning" },
  missing: { icon: XCircle, cls: "text-danger", label: "Missing" },
} as const;

type InputKind = "text" | "tel" | "url" | "email" | "number" | "yes_no";

function inputKindFor(key: string): InputKind {
  if (key === "phone") return "tel";
  if (key.endsWith("_url")) return "url";
  if (key === "email") return "email";
  if (key === "desired_salary" || key === "years_experience") return "number";
  if (key === "requires_sponsorship") return "yes_no";
  return "text";
}

const PLACEHOLDERS: Record<string, string> = {
  phone: "e.g. +1 416 555 0134",
  portfolio_url: "https://your-portfolio.dev",
  linkedin_url: "https://linkedin.com/in/you",
  github_url: "https://github.com/you",
  website_url: "https://your-site.com",
  salary_expectation: "e.g. $70,000–$80,000 CAD",
  city: "e.g. Toronto",
  work_authorization: "e.g. Canadian citizen",
};

/** Inline editor for one resolvable field. */
function InlineFix({
  item,
  applicationId,
}: {
  item: ReadinessItem;
  applicationId: number;
}) {
  const field = item.field ?? "";
  const [scope, key] = field.includes(".") ? (field.split(".", 2) as [string, string]) : ["", field];
  const kind = inputKindFor(key);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const inputId = React.useId();
  const updateProfile = useUpdateProfile();
  const updateApp = useUpdateApplication(applicationId);
  const refresh = useRefreshReadiness(applicationId);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = value.trim();
    if (!raw) {
      setError("Please enter a value first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (scope === "profile") {
        let v: string | number | boolean = raw;
        if (kind === "number") v = Number(raw);
        if (kind === "yes_no") v = raw === "yes";
        await updateProfile.mutateAsync({ [key]: v } as ProfileIn);
      } else if (scope === "user") {
        await api.patch("/users/me", { [key]: raw });
      } else if (scope === "application") {
        await updateApp.mutateAsync({ [key]: raw });
      }
      await refresh.mutateAsync();
      toast.success(`${item.label.replace(/ (missing|required)$/i, "")} saved`, {
        description: scope === "profile" ? "Saved to your profile, so future applications use it too." : "Saved for this application.",
      });
    } catch (err) {
      const fe = err instanceof ApiError ? err.fieldErrors[0]?.message : null;
      setError(fe ?? errorMessage(err, "We couldn't save that. Please check the value and try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-start">
      <label htmlFor={inputId} className="sr-only">
        {item.label}
      </label>
      <div className="min-w-0 flex-1">
        {kind === "yes_no" ? (
          <Select id={inputId} value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!error || undefined}>
            <option value="">Choose…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        ) : (
          <Input
            id={inputId}
            type={kind}
            inputMode={kind === "number" ? "numeric" : undefined}
            value={value}
            placeholder={PLACEHOLDERS[key] ?? ""}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${inputId}-err` : undefined}
            className="h-9"
          />
        )}
        {error && (
          <p id={`${inputId}-err`} role="alert" className="mt-1 text-caption text-danger">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" size="sm" loading={saving} className="h-9">
        Save
      </Button>
    </form>
  );
}

function ItemRow({
  item,
  applicationId,
  onNavigate,
}: {
  item: ReadinessItem;
  applicationId: number;
  onNavigate: (target: ReadinessTarget) => void;
}) {
  const meta = STATE_META[item.state];
  const Icon = meta.icon;
  const field = item.field ?? "";
  // The sign-in email lives in account settings, not the profile.
  const isEmail = field === "profile.email";
  const isInline = item.state !== "ok" && item.resolvable && !isEmail && /^(profile|application|user)\./.test(field);
  const target: ReadinessTarget | null =
    field === "answers" || field.startsWith("answers") ? "answers" : field === "cover_letter" ? "cover_letter" : field === "resume" ? "resume" : null;

  return (
    <li
      className={cn(
        "rounded-xl border px-3.5 py-3 transition-colors",
        item.state === "ok" && "border-transparent bg-transparent py-2",
        item.state === "warning" && "border-warning/30 bg-warning-soft/30",
        item.state === "missing" && "border-danger/30 bg-danger-soft/30",
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-[18px] shrink-0", meta.cls)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className={cn("text-sm font-medium", item.state === "ok" ? "text-muted" : "text-text")}>
              <span className="sr-only">{meta.label}: </span>
              {item.label}
            </p>
            {item.blocking && item.state !== "ok" && (
              <Badge tone="danger" size="xs">
                Required to apply
              </Badge>
            )}
          </div>
          {item.detail && item.state !== "ok" && <p className="mt-0.5 text-sm text-muted">{item.detail}</p>}
          {isInline && <InlineFix item={item} applicationId={applicationId} />}
          {item.state !== "ok" && target && (
            <Button size="xs" variant="soft" className="mt-2" onClick={() => onNavigate(target)}>
              {target === "answers" ? "Review answers" : target === "cover_letter" ? "Open cover letter" : "Review resume"}
              <ArrowRight />
            </Button>
          )}
          {item.state !== "ok" && !isInline && !target && (item.resolvable || isEmail) && (
            <Button size="xs" variant="ghost" className="mt-2 -ml-2" asChild>
              <Link href={isEmail ? "/settings" : "/profile"}>
                {isEmail ? "Update in Settings" : "Fix in your profile"} <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function ReadinessChecklist({
  items,
  applicationId,
  onNavigate,
}: {
  items: ReadinessItem[];
  applicationId: number;
  onNavigate: (target: ReadinessTarget) => void;
}) {
  const refresh = useRefreshReadiness(applicationId);
  const [showOk, setShowOk] = React.useState(false);
  const order = { missing: 0, warning: 1, ok: 2 } as const;
  const sorted = [...items].sort((a, b) => Number(b.blocking) - Number(a.blocking) || order[a.state] - order[b.state]);
  const attention = sorted.filter((i) => i.state !== "ok");
  const ok = sorted.filter((i) => i.state === "ok");
  const blocking = attention.filter((i) => i.blocking);
  const percent = items.length ? Math.round((ok.length / items.length) * 100) : 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ProgressBar
          value={percent}
          className="max-w-xs flex-1"
          color={blocking.length ? "var(--danger)" : attention.length ? "var(--warning)" : "var(--success)"}
          label="Application readiness"
        />
        <p className="text-sm text-muted" aria-live="polite">
          <span className="tabular font-semibold text-text">
            {ok.length}/{items.length}
          </span>{" "}
          ready
        </p>
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          loading={refresh.isPending}
          onClick={() =>
            refresh.mutate(undefined, {
              onSuccess: () => toast.success("Readiness re-checked"),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          {!refresh.isPending && <RefreshCw />} Re-check
        </Button>
      </div>

      {blocking.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-xl bg-danger-soft/50 px-3.5 py-2.5 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <p className="text-muted">
            <span className="font-medium text-text">
              {blocking.length === 1 ? "1 item must" : `${blocking.length} items must`} be resolved before you can apply.
            </span>{" "}
            Employers reject incomplete applications — fix {blocking.length === 1 ? "it" : "them"} here and we&apos;ll re-check instantly.
          </p>
        </div>
      ) : attention.length > 0 ? (
        <p className="text-sm text-muted">
          You can apply now. The warnings below are optional but may strengthen your application.
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <CheckCircle2 className="size-4" aria-hidden /> Everything is ready.
        </p>
      )}

      {attention.length > 0 && (
        <ul className="space-y-2">
          {attention.map((i) => (
            <ItemRow key={i.key} item={i} applicationId={applicationId} onNavigate={onNavigate} />
          ))}
        </ul>
      )}

      {ok.length > 0 && (
        <div>
          {attention.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text"
              aria-expanded={showOk}
              onClick={() => setShowOk((v) => !v)}
            >
              <ChevronDown className={cn("size-4 transition-transform", showOk && "rotate-180")} aria-hidden />
              {ok.length} {ok.length === 1 ? "item is" : "items are"} ready
            </button>
          )}
          {(showOk || attention.length === 0) && (
            <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">
              {ok.map((i) => (
                <ItemRow key={i.key} item={i} applicationId={applicationId} onNavigate={onNavigate} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
