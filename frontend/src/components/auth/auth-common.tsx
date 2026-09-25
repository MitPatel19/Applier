"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/feedback";
import { useMe } from "@/lib/queries/core";
import { postLoginPath } from "@/lib/queries/auth";

/**
 * If the visitor is already signed in, send them where they belong.
 * Disabled while the page's own submit is in flight/succeeded (the form redirects itself).
 */
export function useRedirectIfSignedIn(next: string | null, enabled: boolean) {
  const router = useRouter();
  const { data: user } = useMe();
  const redirecting = enabled && !!user;
  React.useEffect(() => {
    if (redirecting && user) router.replace(postLoginPath(user, next));
  }, [redirecting, user, next, router]);
  return redirecting;
}

export function AuthHeading({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-h1 font-semibold tracking-tight sm:text-[2rem]">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted sm:text-[15px]">{description}</p>
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  return (
    <div aria-live="assertive" aria-atomic="true">
      {message && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft/60 px-3.5 py-3 text-sm text-text animate-fade-in"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}

export function RedirectingNotice() {
  return (
    <div role="status" className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
      <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
      You&apos;re already signed in — taking you to Applier…
    </div>
  );
}

export function AuthFormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div aria-hidden>
      <Skeleton className="h-8 w-3/5" />
      <Skeleton className="mt-3 h-4 w-4/5" />
      <div className="mt-8 space-y-5">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  );
}
