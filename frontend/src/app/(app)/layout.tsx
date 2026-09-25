"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useMe, usePreferences } from "@/lib/queries/core";
import { AppShell } from "@/components/app/app-shell";
import { LogoMark } from "@/components/app/logo";

/** Applies accessibility preferences stored on the server (reduced motion, high contrast). */
function useUiSettings() {
  const { data } = usePreferences();
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("reduce-motion", !!data?.ui_settings?.reduced_motion);
    root.classList.toggle("hc", !!data?.ui_settings?.high_contrast);
  }, [data?.ui_settings?.reduced_motion, data?.ui_settings?.high_contrast]);
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg" role="status" aria-label="Loading Applier">
      <LogoMark className="size-10 animate-pulse" />
    </div>
  );
}

function UiSettings() {
  useUiSettings();
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: user, error, isLoading } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [error, router, pathname]);

  if (isLoading || !user) return <Splash />;
  return (
    <AppShell user={user}>
      <UiSettings />
      {children}
    </AppShell>
  );
}
