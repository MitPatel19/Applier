"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Accessibility, Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { usePreferences } from "@/lib/queries/core";
import { usePatchPreferences } from "@/lib/queries/settings";
import type { UISettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/ui/feedback";
import { SwitchRow } from "@/components/ui/primitives";
import { PanelSkeleton, SettingsCard, SettingsPanel } from "./settings-shared";

type Theme = UISettings["theme"];

const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Light", icon: <Sun /> },
  { value: "dark", label: "Dark", icon: <Moon /> },
  { value: "system", label: "System", icon: <Monitor /> },
];

const PREVIEW_COLORS = {
  light: { bg: "#f6f7fb", surface: "#ffffff", line: "#e3e6ef", text: "#0e1220", primary: "#5b4cf0" },
  dark: { bg: "#07090f", surface: "#0f1320", line: "#1f2638", text: "#eef1f8", primary: "#8b7dff" },
};

function PreviewPane({ c }: { c: (typeof PREVIEW_COLORS)["light"] }) {
  return (
    <div className="flex h-full gap-1.5 p-2" style={{ background: c.bg }}>
      <div className="w-1/4 rounded-md" style={{ background: c.surface, border: `1px solid ${c.line}` }} />
      <div className="flex flex-1 flex-col gap-1.5 rounded-md p-1.5" style={{ background: c.surface, border: `1px solid ${c.line}` }}>
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: c.text, opacity: 0.8 }} />
        <div className="h-1.5 w-1/2 rounded-full" style={{ background: c.text, opacity: 0.3 }} />
        <div className="mt-auto h-2.5 w-1/3 rounded-full" style={{ background: c.primary }} />
      </div>
    </div>
  );
}

/** Miniature app preview drawn with each theme's own palette (independent of the active theme). */
function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <div className="relative h-20 overflow-hidden rounded-lg border border-border" aria-hidden>
      {theme === "system" ? (
        <div className="grid h-full grid-cols-2">
          <PreviewPane c={PREVIEW_COLORS.light} />
          <PreviewPane c={PREVIEW_COLORS.dark} />
        </div>
      ) : (
        <PreviewPane c={PREVIEW_COLORS[theme]} />
      )}
    </div>
  );
}

const emptySubscribe = () => () => {};

export function AppearanceTab() {
  const { data, isLoading, error, refetch } = usePreferences();
  const patch = usePatchPreferences();
  const { theme: activeTheme, setTheme } = useTheme();
  // next-themes only knows the stored theme after mount.
  const mounted = React.useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (isLoading) return <PanelSkeleton cards={2} />;
  if (error || !data) return <ErrorState error={error} title="We couldn't load appearance settings" onRetry={() => refetch()} />;

  const ui = data.ui_settings;
  const selected: Theme = mounted && (activeTheme === "light" || activeTheme === "dark" || activeTheme === "system") ? activeTheme : ui.theme;

  const save = (next: UISettings, message: string) =>
    patch.mutate(
      { ui_settings: next },
      {
        onSuccess: () => toast.success(message),
        onError: (e) => toast.error(errorMessage(e, "We couldn't save that change.")),
      },
    );

  const chooseTheme = (t: Theme) => {
    setTheme(t);
    save({ ...ui, theme: t }, `Theme set to ${THEMES.find((x) => x.value === t)?.label ?? t}`);
  };

  return (
    <SettingsPanel title="Appearance & accessibility" description="Make Applier comfortable to use. Changes apply instantly and are saved to your account.">
      <SettingsCard icon={<Palette />} title="Theme">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const active = selected === t.value;
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => chooseTheme(t.value)}
                onKeyDown={(e) => {
                  const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                  if (!dir) return;
                  e.preventDefault();
                  const idx = THEMES.findIndex((x) => x.value === t.value);
                  const next = THEMES[(idx + dir + THEMES.length) % THEMES.length];
                  chooseTheme(next.value);
                  const group = e.currentTarget.parentElement;
                  (group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[THEMES.indexOf(next)])?.focus();
                }}
                className={cn(
                  "rounded-xl border p-2.5 text-left transition-all",
                  active ? "border-primary shadow-[0_0_0_3px_var(--primary-soft)]" : "border-border hover:border-border-strong",
                )}
              >
                <ThemePreview theme={t.value} />
                <span className="mt-2.5 flex items-center justify-between px-0.5 text-sm font-medium text-text">
                  <span className="inline-flex items-center gap-2 [&_svg]:size-4">
                    {t.icon}
                    {t.label}
                  </span>
                  {active && <Check className="size-4 text-primary" aria-hidden />}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-caption text-subtle">“System” follows your device&apos;s light or dark setting.</p>
      </SettingsCard>

      <SettingsCard icon={<Accessibility />} title="Accessibility">
        <div className="divide-y divide-border">
          <SwitchRow
            label="Reduce motion"
            description="Minimize animations and transitions across the app."
            checked={ui.reduced_motion}
            onCheckedChange={(v) => save({ ...ui, reduced_motion: v }, `Reduced motion ${v ? "on" : "off"}`)}
          />
          <SwitchRow
            label="High contrast"
            description="Stronger text and borders for easier reading."
            checked={ui.high_contrast}
            onCheckedChange={(v) => save({ ...ui, high_contrast: v }, `High contrast ${v ? "on" : "off"}`)}
          />
        </div>
        <p className="mt-2 text-caption text-subtle">
          Tip: your browser&apos;s zoom (Ctrl/⌘ + and −) scales all text and spacing if you&apos;d like larger type.
        </p>
      </SettingsCard>
    </SettingsPanel>
  );
}
