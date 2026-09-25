"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { postLoginPath, safeNextPath, useLogin } from "@/lib/queries/auth";
import { AuthHeading, FormAlert, RedirectingNotice, useRedirectIfSignedIn } from "./auth-common";
import { splitApiError, validateEmail } from "./form-utils";
import { PasswordInput } from "./password";

const FIELDS = ["email", "password"] as const;
type LoginField = (typeof FIELDS)[number];

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const login = useLogin();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [serverErrors, setServerErrors] = React.useState<Partial<Record<LoginField, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  const redirecting = useRedirectIfSignedIn(next, !login.isPending && !login.isSuccess);

  const clientErrors: Partial<Record<LoginField, string>> = {
    email: validateEmail(email) ?? undefined,
    password: password ? undefined : "Enter your password",
  };
  const errorFor = (f: LoginField) => serverErrors[f] ?? (submitted ? clientErrors[f] : undefined) ?? null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    setServerErrors({});
    if (clientErrors.email) return emailRef.current?.focus();
    if (clientErrors.password) return passwordRef.current?.focus();
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (session) => router.replace(postLoginPath(session.user, next)),
        onError: (err) => {
          const { fieldErrors, formError: fe } = splitApiError(err, FIELDS);
          setServerErrors(fieldErrors);
          setFormError(fe);
          if (fieldErrors.email) emailRef.current?.focus();
          else passwordRef.current?.focus();
        },
      },
    );
  };

  if (redirecting) return <RedirectingNotice />;

  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <div className="animate-rise">
      <AuthHeading
        title="Welcome back"
        description="Sign in to check on your career agent, review prepared applications and pick up where you left off."
      />
      <FormAlert message={formError} />
      <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label="Sign in">
        <Field label="Email" error={errorFor("email")} required>
          <Input
            ref={emailRef}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            icon={<Mail />}
            className="h-11"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setServerErrors((s) => ({ ...s, email: undefined }));
            }}
          />
        </Field>
        <Field label="Password" error={errorFor("password")} required>
          <PasswordInput
            ref={passwordRef}
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setServerErrors((s) => ({ ...s, password: undefined }));
            }}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={login.isPending || login.isSuccess}>
          {login.isPending ? "Signing in…" : login.isSuccess ? "Opening Applier…" : "Sign in"}
          {!login.isPending && !login.isSuccess && <ArrowRight />}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        New to Applier?{" "}
        <Link href={registerHref} className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
