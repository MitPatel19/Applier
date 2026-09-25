"use client";

import * as React from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mirrors the backend rule in backend/app/schemas/auth.py (`_check_password`). */
export const PASSWORD_RULES = [
  { key: "length", label: "At least 10 characters", test: (p: string) => p.length >= 10 },
  {
    key: "case",
    label: "Upper- and lower-case letters",
    test: (p: string) => p.toLowerCase() !== p && p.toUpperCase() !== p,
  },
  { key: "number", label: "At least one number", test: (p: string) => /\d/.test(p) },
] as const;

export function passwordIsValid(p: string) {
  return PASSWORD_RULES.every((r) => r.test(p));
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Additional ids to merge into aria-describedby (Field sets its own). */
  extraDescribedBy?: string;
};

const inputBase =
  "h-11 w-full rounded-lg border border-border bg-surface pl-3 pr-11 text-sm text-text placeholder:text-subtle transition-colors " +
  "hover:border-border-strong focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20 " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20";

/** Password input with an accessible show/hide toggle. */
export const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(function PasswordInput(
  { className, extraDescribedBy, "aria-describedby": describedBy, ...props },
  ref,
) {
  const [visible, setVisible] = React.useState(false);
  const described = [describedBy, extraDescribedBy].filter(Boolean).join(" ") || undefined;
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-describedby={described}
        className={cn(inputBase, className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-subtle transition-colors hover:bg-bg-subtle hover:text-text"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});

/** Live checklist of password requirements. */
export function PasswordRules({ id, password, showErrors }: { id: string; password: string; showErrors?: boolean }) {
  return (
    <ul id={id} className="grid gap-1.5 pt-1 sm:grid-cols-1" aria-label="Password requirements">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password);
        const failed = !ok && showErrors;
        return (
          <li
            key={r.key}
            className={cn(
              "flex items-center gap-2 text-caption transition-colors",
              ok ? "text-success" : failed ? "text-danger" : "text-subtle",
            )}
          >
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-full border transition-colors",
                ok ? "border-transparent bg-success-soft" : failed ? "border-danger/40" : "border-border-strong",
              )}
              aria-hidden
            >
              {ok ? <Check className="size-2.5" strokeWidth={3.5} /> : failed ? <X className="size-2.5" strokeWidth={3.5} /> : null}
            </span>
            {r.label}
            <span className="sr-only">{ok ? "(met)" : "(not met)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
