"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Bot,
  FileText,
  Filter,
  FlaskConical,
  History,
  Link2,
  Palette,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/input";

export const SETTINGS_TABS = [
  { id: "search", label: "Job search profile", icon: Search, group: "Job search" },
  { id: "scoring", label: "Scoring weights", icon: SlidersHorizontal, group: "Job search" },
  { id: "filters", label: "Quality filters", icon: Filter, group: "Job search" },
  { id: "agent", label: "Agent controls", icon: Bot, group: "Automation" },
  { id: "integrations", label: "Connections", icon: Link2, group: "Automation" },
  { id: "notifications", label: "Notifications", icon: Bell, group: "Automation" },
  { id: "templates", label: "Templates", icon: FileText, group: "Automation" },
  { id: "appearance", label: "Appearance", icon: Palette, group: "Account" },
  { id: "privacy", label: "Privacy & security", icon: ShieldCheck, group: "Account" },
  { id: "audit", label: "Audit log", icon: History, group: "Account" },
  { id: "demo", label: "Sample data", icon: FlaskConical, group: "Account" },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon; group: string }[];

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

export function isSettingsTab(v: string | null): v is SettingsTabId {
  return SETTINGS_TABS.some((t) => t.id === v);
}

export const tabHref = (id: SettingsTabId) => `/settings?tab=${id}`;

const GROUPS = Array.from(new Set(SETTINGS_TABS.map((t) => t.group)));

/** Vertical grouped navigation on desktop; a labelled select on mobile. */
export function SettingsNav({ active }: { active: SettingsTabId }) {
  const router = useRouter();
  const selectId = React.useId();
  return (
    <>
      <div className="lg:hidden">
        <label htmlFor={selectId} className="sr-only">
          Settings section
        </label>
        <Select
          id={selectId}
          value={active}
          onChange={(e) => router.replace(tabHref(e.target.value as SettingsTabId), { scroll: false })}
          className="h-11 font-medium"
        >
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {SETTINGS_TABS.filter((t) => t.group === g).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      <nav aria-label="Settings sections" className="hidden lg:block">
        <div className="sticky top-24 space-y-5">
          {GROUPS.map((g) => (
            <div key={g}>
              <p className="mb-1.5 px-3 text-caption font-semibold uppercase tracking-[0.12em] text-subtle">{g}</p>
              <ul className="space-y-0.5">
                {SETTINGS_TABS.filter((t) => t.group === g).map((t) => {
                  const Icon = t.icon;
                  const isActive = t.id === active;
                  return (
                    <li key={t.id}>
                      <Link
                        href={tabHref(t.id)}
                        replace
                        scroll={false}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-surface text-text shadow-card before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                            : "text-muted hover:bg-bg-subtle hover:text-text",
                        )}
                      >
                        <Icon className={cn("size-4", isActive ? "text-primary" : "text-subtle")} aria-hidden />
                        {t.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
