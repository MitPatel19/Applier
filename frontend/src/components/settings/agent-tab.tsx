"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bell, Bot, CalendarClock, Hand, Lock, ShieldCheck, Target, Zap } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useAgentSettings, useUpdateAgentSettings } from "@/lib/queries/agent";
import type { AgentSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/feedback";
import { Slider, Switch, SwitchRow } from "@/components/ui/primitives";
import { FieldSet, PanelSkeleton, SettingsCard, SettingsPanel } from "./settings-shared";

const FREQUENCIES: { value: AgentSettings["search_frequency"]; label: string; description: string; icon: React.ReactNode }[] = [
  { value: "manual", label: "Manual", description: "Only when you click “Run agent”.", icon: <Hand /> },
  { value: "daily", label: "Daily", description: "One search every morning.", icon: <CalendarClock /> },
  { value: "several_daily", label: "Several times a day", description: "Catch new postings early.", icon: <Zap /> },
];

type AutoKey =
  | "auto_search"
  | "auto_dedupe"
  | "auto_analyze"
  | "auto_score"
  | "auto_customize_resume"
  | "auto_cover_letter"
  | "auto_company_research";

const AUTO_ACTIONS: { key: AutoKey; label: string; description: string }[] = [
  { key: "auto_search", label: "Search jobs", description: "Look for new postings on your schedule." },
  { key: "auto_dedupe", label: "Remove duplicates", description: "Merge the same job found on several sites." },
  { key: "auto_analyze", label: "Analyze jobs", description: "Extract requirements, skills and red flags." },
  { key: "auto_score", label: "Score jobs", description: "Compute a transparent match score for each job." },
  { key: "auto_customize_resume", label: "Customize resume", description: "Draft a tailored resume for strong matches — you review every change." },
  { key: "auto_cover_letter", label: "Generate cover letter", description: "Draft a cover letter for strong matches." },
  { key: "auto_company_research", label: "Company research", description: "Summarize the company with sources." },
];

export function AgentTab() {
  const { data, isLoading, error, refetch } = useAgentSettings();
  const update = useUpdateAgentSettings();
  const [threshold, setThreshold] = React.useState<number | null>(null);

  if (isLoading) return <PanelSkeleton cards={3} />;
  if (error || !data) return <ErrorState error={error} title="We couldn't load agent settings" onRetry={() => refetch()} />;

  const patch = (body: Partial<AgentSettings>, success = "Agent settings saved") =>
    update.mutate(body, {
      onSuccess: () => toast.success(success),
      onError: (e) => toast.error(errorMessage(e, "We couldn't save that change.")),
    });

  const shownThreshold = threshold ?? data.strong_match_threshold;

  return (
    <SettingsPanel
      title="Agent controls"
      description="Choose what your Career Agent does on its own. Changes apply immediately."
    >
      <SettingsCard icon={<CalendarClock />} title="Search frequency">
        <FieldSet legend={<span className="sr-only">How often the agent searches</span>}>
          <div role="group" aria-label="Search frequency" className="grid gap-2 sm:grid-cols-3">
            {FREQUENCIES.map((f) => {
              const active = data.search_frequency === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => !active && patch({ search_frequency: f.value }, `Search frequency: ${f.label}`)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all [&_svg]:size-4",
                    active
                      ? "border-primary bg-primary-soft/60 shadow-[0_0_0_3px_var(--primary-soft)]"
                      : "border-border bg-surface hover:border-border-strong",
                  )}
                >
                  <span className={cn("mt-0.5", active ? "text-primary-soft-fg" : "text-subtle")} aria-hidden>
                    {f.icon}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-text">{f.label}</span>
                    <span className="mt-0.5 block text-caption text-muted">{f.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </FieldSet>
      </SettingsCard>

      <SettingsCard icon={<Bot />} title="Automatic actions" description="Preparation work the agent may do without asking. Nothing is ever sent without you.">
        <div className="divide-y divide-border">
          {AUTO_ACTIONS.map((a) => (
            <SwitchRow
              key={a.key}
              label={a.label}
              description={a.description}
              checked={!!data[a.key]}
              onCheckedChange={(v) => patch({ [a.key]: v } as Partial<AgentSettings>, `${a.label} ${v ? "turned on" : "turned off"}`)}
            />
          ))}
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p id="auto-submit-label" className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
                <Lock className="size-3.5 text-subtle" aria-hidden />
                Submit applications automatically
                <Badge tone="neutral" size="xs">
                  Always off
                </Badge>
              </p>
              <p className="mt-0.5 text-sm text-muted">
                Every application needs your explicit confirmation. The agent prepares everything, then you review and
                approve each one before anything is submitted.
              </p>
            </div>
            <Switch checked={false} disabled aria-labelledby="auto-submit-label" />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard icon={<Target />} title="Strong matches" description="What counts as a strong match, and whether to tell you about them.">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-text">
              Strong match threshold
            </span>
            <span className="text-sm font-semibold">{shownThreshold}%</span>
          </div>
          <Slider
            aria-label="Strong match threshold"
            min={50}
            max={100}
            step={1}
            value={[shownThreshold]}
            onValueChange={([v]) => setThreshold(v)}
            onValueCommit={([v]) => {
              patch({ strong_match_threshold: v }, `Strong match threshold set to ${v}%`);
              setThreshold(null);
            }}
          />
          <div className="flex justify-between text-caption text-subtle" aria-hidden>
            <span>50% · more matches</span>
            <span>100% · fewer, stronger</span>
          </div>
        </div>
        <div className="mt-3 border-t border-border">
          <SwitchRow
            label={
              <span className="inline-flex items-center gap-2">
                <Bell className="size-3.5 text-subtle" aria-hidden /> Notify me about strong matches
              </span>
            }
            description="Get a notification when a new job scores above your threshold."
            checked={data.notify_on_strong_match}
            onCheckedChange={(v) => patch({ notify_on_strong_match: v })}
          />
        </div>
      </SettingsCard>

      <p className="flex items-center gap-2 text-caption text-subtle">
        <ShieldCheck className="size-3.5" aria-hidden /> Every agent action is recorded in your Audit log.
      </p>
    </SettingsPanel>
  );
}
