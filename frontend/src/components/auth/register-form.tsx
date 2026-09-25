"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { safeNextPath, useRegister } from "@/lib/queries/auth";
import { AuthHeading, FormAlert, RedirectingNotice, useRedirectIfSignedIn } from "./auth-common";
import { splitApiError, validateEmail } from "./form-utils";
import { PasswordInput, PasswordRules, passwordIsValid } from "./password";

const FIELDS = ["full_name", "email", "password"] as const;
type RegisterField = (typeof FIELDS)[number];

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const register = useRegister();

  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [serverErrors, setServerErrors] = React.useState<Partial<Record<RegisterField, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const nameRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const focusField = (f: RegisterField) =>
    (f === "full_name" ? nameRef : f === "email" ? emailRef : passwordRef).current?.focus();
  const rulesId = React.useId();

  const redirecting = useRedirectIfSignedIn(next, !register.isPending && !register.isSuccess);

  const clientErrors: Partial<Record<RegisterField, string>> = {
    full_name: fullName.trim() ? undefined : "Enter your name",
    email: validateEmail(email) ?? undefined,
    password: !password
      ? "Create a password"
      : passwordIsValid(password)
        ? undefined
        : "Your password doesn't meet all the requirements below",
  };
  const errorFor = (f: RegisterField) => serverErrors[f] ?? (submitted ? clientErrors[f] : undefined) ?? null;
  const clearServer = (f: RegisterField) => setServerErrors((s) => ({ ...s, [f]: undefined }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    setServerErrors({});
    const firstInvalid = FIELDS.find((f) => clientErrors[f]);
    if (firstInvalid) return focusField(firstInvalid);
    register.mutate(
      { full_name: fullName.trim(), email: email.trim(), password },
      {
        onSuccess: () => router.replace("/onboarding"),
        onError: (err) => {
          const { fieldErrors, formError: fe } = splitApiError(err, FIELDS);
          setServerErrors(fieldErrors);
          setFormError(fe);
          const first = FIELDS.find((f) => fieldErrors[f]);
          if (first) focusField(first);
        },
      },
    );
  };

  if (redirecting) return <RedirectingNotice />;

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <div className="animate-rise">
      <AuthHeading
        title="Create your account"
        description="Set up your personal career agent in a few minutes. Nothing is ever submitted without your approval."
      />
      <FormAlert message={formError} />
      <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label="Create account">
        <Field label="Full name" error={errorFor("full_name")} required>
          <Input
            ref={nameRef}
            name="name"
            autoComplete="name"
            autoFocus
            icon={<UserRound />}
            className="h-11"
            placeholder="Alex Morgan"
            maxLength={200}
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              clearServer("full_name");
            }}
          />
        </Field>
        <Field label="Email" error={errorFor("email")} required>
          <Input
            ref={emailRef}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            icon={<Mail />}
            className="h-11"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearServer("email");
            }}
          />
        </Field>
        <div className="space-y-2">
          <Field label="Password" error={errorFor("password")} required>
            <PasswordInput
              ref={passwordRef}
              name="new-password"
              autoComplete="new-password"
              placeholder="Create a strong password"
              maxLength={128}
              extraDescribedBy={rulesId}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearServer("password");
              }}
            />
          </Field>
          <PasswordRules id={rulesId} password={password} showErrors={submitted} />
        </div>
        <Button type="submit" size="lg" className="w-full" loading={register.isPending || register.isSuccess}>
          {register.isPending ? "Creating your account…" : register.isSuccess ? "Setting things up…" : "Create account"}
          {!register.isPending && !register.isSuccess && <ArrowRight />}
        </Button>
        <p className="text-center text-caption text-subtle">
          By creating an account you agree to how we handle data, described in our{" "}
          <Link href="/security" className="font-medium text-muted underline-offset-2 hover:text-text hover:underline">
            Privacy & Security overview
          </Link>
          .
        </p>
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
