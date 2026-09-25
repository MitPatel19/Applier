"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useChangePassword, useDeleteAccount, useLogoutAll, usePrivacy } from "@/lib/queries/settings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { SettingsCard, SettingsPanel } from "./settings-shared";

const PASSWORD_RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: "At least 10 characters", test: (pw) => pw.length >= 10 },
  { label: "Upper- and lower-case letters", test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { label: "At least one number", test: (pw) => /\d/.test(pw) },
];

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:bg-bg-subtle hover:text-text"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function StoredData() {
  const { data, isLoading, error, refetch } = usePrivacy();
  return (
    <SettingsCard icon={<Database />} title="What we store" description="Everything Applier keeps about you, and why.">
      {isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : error || !data ? (
        <ErrorState compact error={error} title="We couldn't load your data summary" onRetry={() => refetch()} />
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.stored_data.map((d) => (
              <li key={d.category} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{d.category}</p>
                  <p className="text-caption text-muted">{d.description}</p>
                </div>
                <span className="tabular shrink-0 text-sm font-semibold">{d.count}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-bg-subtle p-3.5">
              <p className="flex items-center gap-2 text-sm font-medium text-text">
                <Lock className="size-4 text-success" aria-hidden /> Encryption
              </p>
              <p className="mt-1 text-sm text-muted">{data.encryption}</p>
            </div>
            <div className="rounded-lg bg-bg-subtle p-3.5">
              <p className="flex items-center gap-2 text-sm font-medium text-text">
                <ShieldCheck className="size-4 text-success" aria-hidden /> Retention
              </p>
              <p className="mt-1 text-sm text-muted">{data.retention}</p>
            </div>
          </div>
        </div>
      )}
      <ul className="mt-4 space-y-1.5 text-sm text-muted">
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> Passwords are hashed — never stored or readable.
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> Connected-account tokens are encrypted at rest.
        </li>
        <li className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> Nothing is sent to an employer until you approve
          that specific application.
        </li>
      </ul>
    </SettingsCard>
  );
}

function ChangePassword() {
  const change = useChangePassword();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const rulesOk = PASSWORD_RULES.every((r) => r.test(next));
  const mismatch = confirm.length > 0 && confirm !== next;
  const sameAsCurrent = next.length > 0 && next === current;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (!current || !rulesOk || confirm !== next || sameAsCurrent) return;
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          setConfirm("");
          setSubmitted(false);
          toast.success("Password changed", { description: "You've been signed out on your other devices." });
        },
        onError: (err) => {
          const field = err instanceof ApiError ? err.fieldErrors.find((f) => f.field.includes("password")) : undefined;
          setServerError(field?.message ?? errorMessage(err, "We couldn't change your password."));
        },
      },
    );
  };

  return (
    <SettingsCard icon={<KeyRound />} title="Change password" description="Changing your password signs you out everywhere else.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Current password" required error={submitted && !current ? "Enter your current password." : null}>
          <PasswordInput autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="New password"
            required
            error={submitted && !rulesOk ? "Your new password doesn't meet the rules below." : sameAsCurrent ? "Choose a password different from your current one." : null}
          >
            <PasswordInput autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirm new password" required error={mismatch ? "Passwords don't match." : null}>
            <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-3" aria-label="Password requirements">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(next);
            return (
              <li key={r.label} className={cn("flex items-center gap-1.5 text-caption", ok ? "text-success" : "text-subtle")}>
                {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                <span>
                  {r.label}
                  <span className="sr-only">{ok ? " — met" : " — not met yet"}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {serverError && (
          <Callout tone="danger" className="mt-1">
            <span role="alert">{serverError}</span>
          </Callout>
        )}
        <div className="flex justify-end">
          <Button type="submit" loading={change.isPending}>
            Update password
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}

function Sessions() {
  const logoutAll = useLogoutAll();
  const [open, setOpen] = React.useState(false);
  return (
    <SettingsCard icon={<LogOut />} title="Sessions" description="Signed in on a shared or lost device? Sign out everywhere at once.">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <LogOut /> Sign out of all devices
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sign out of all devices?"
        description="Every active session — including this one — will end immediately. You'll need to sign in again on each device."
        confirmLabel="Sign out everywhere"
        loading={logoutAll.isPending}
        onConfirm={() =>
          logoutAll.mutate(undefined, {
            onError: (e) => toast.error(errorMessage(e, "We couldn't sign you out everywhere.")),
          })
        }
      />
    </SettingsCard>
  );
}

function DeleteAccount() {
  const del = useDeleteAccount();
  const [password, setPassword] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const ready = password.length > 0 && typed === "DELETE";

  return (
    <SettingsCard tone="danger" icon={<Trash2 />} title="Delete account" description="Permanently delete your account and everything in it.">
      <p className="text-sm text-muted">
        This deletes your profile, resumes, cover letters, jobs, applications, interviews, notes, connected accounts and
        uploaded files. <strong className="font-semibold text-text">It can&apos;t be undone.</strong> Consider downloading
        your data first.
      </p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) setOpen(true);
        }}
      >
        <Field label="Your password">
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={<>Type <span className="font-mono">DELETE</span> to confirm</>}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
        {err && (
          <Callout tone="danger" className="sm:col-span-2">
            <span role="alert">{err}</span>
          </Callout>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" variant="danger" disabled={!ready}>
            <Trash2 /> Delete my account
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone="danger"
        title="Delete your account permanently?"
        description="All of your data and files will be erased immediately and can't be recovered. You'll be signed out."
        confirmLabel="Yes, delete everything"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(password, {
            onError: (e) => {
              setOpen(false);
              setErr(errorMessage(e, "We couldn't delete your account. Check your password and try again."));
            },
          })
        }
      />
    </SettingsCard>
  );
}

export function PrivacyTab() {
  return (
    <SettingsPanel
      title="Privacy & security"
      description="You own your data. See what's stored, take it with you, and control access to your account."
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/security">
            How we protect your data <ExternalLink />
          </Link>
        </Button>
      }
    >
      <StoredData />
      <SettingsCard icon={<Download />} title="Download my data" description="A complete copy of your personal data as a JSON file.">
        <Button asChild variant="secondary">
          <a href={api.url("/users/me/export")} download>
            <Download /> Download my data
          </a>
        </Button>
      </SettingsCard>
      <ChangePassword />
      <Sessions />
      <DeleteAccount />
    </SettingsPanel>
  );
}
