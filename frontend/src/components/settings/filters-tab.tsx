"use client";

import * as React from "react";
import { toast } from "sonner";
import { EyeOff, Flag, Timer } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { usePreferences, useUpdatePreferences } from "@/lib/queries/core";
import type { QualityFilters } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { ErrorState } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/primitives";
import { PanelSkeleton, SaveBar, SettingsCard, SettingsPanel, useDraft } from "./settings-shared";

const HIDE_LABELS: Record<string, { label: string; description: string }> = {
  missing_certifications: {
    label: "Jobs requiring certifications you don't have",
    description: "Based on the certifications listed in your search profile.",
  },
  outside_locations: { label: "Jobs outside your selected locations", description: "Remote roles open to your region are kept." },
  work_authorization: {
    label: "Jobs requiring work authorization you don't have",
    description: "For example, roles that require citizenship or can't sponsor.",
  },
  below_min_salary: { label: "Jobs below your minimum salary", description: "Only when the posting lists a salary." },
  outside_experience_level: { label: "Jobs outside your experience level", description: "Uses the levels in your search profile." },
  duplicates: { label: "Duplicate postings", description: "The same job found on several sites is merged into one." },
  avoided_companies: { label: "Companies you want to avoid", description: "From your search profile's avoid list." },
};

const FLAG_LABELS: Record<string, { label: string; description: string }> = {
  unclear_salary: { label: "Unclear salary", description: "No salary range, or a range too wide to be useful." },
  unclear_employment_type: { label: "Unclear employment type", description: "It isn't clear whether it's full-time, contract, etc." },
  suspicious_posting: { label: "Possibly suspicious posting", description: "Signals like upfront fees or vague company details." },
  missing_company_info: { label: "Missing company information", description: "No website or verifiable company details." },
  deadline_approaching: { label: "Deadline approaching", description: "Uses the warning window below." },
  old_posting: { label: "Very old posting", description: "Older than the maximum posting age below." },
};

function toggleMeta(map: Record<string, { label: string; description: string }>, key: string) {
  return map[key] ?? { label: titleCase(key), description: "" };
}

function clampInt(v: string, min: number, max: number, fallback: number) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function FiltersTab() {
  const { data, isLoading, error, refetch } = usePreferences();
  const { draft, setDraft, dirty, reset, commit } = useDraft<QualityFilters>(data?.quality_filters);
  const save = useUpdatePreferences();
  // Raw text for the number inputs so users can clear and retype freely.
  const [ageText, setAgeText] = React.useState<string | null>(null);
  const [deadlineText, setDeadlineText] = React.useState<string | null>(null);

  if (isLoading) return <PanelSkeleton cards={3} />;
  if (error || !draft) return <ErrorState error={error} title="We couldn't load your quality filters" onRetry={() => refetch()} />;

  const hideKeys = Array.from(new Set([...Object.keys(HIDE_LABELS), ...Object.keys(draft.hide)])).filter((k) => k in draft.hide);
  const flagKeys = Array.from(new Set([...Object.keys(FLAG_LABELS), ...Object.keys(draft.flag)])).filter((k) => k in draft.flag);

  const onSave = () => {
    save.mutate(
      { quality_filters: draft },
      {
        onSuccess: (saved) => {
          commit(saved.quality_filters);
          setAgeText(null);
          setDeadlineText(null);
          toast.success("Quality filters saved", { description: "Your job lists will update shortly." });
        },
        onError: (e) => toast.error(errorMessage(e, "We couldn't save your filters.")),
      },
    );
  };

  const onReset = () => {
    reset();
    setAgeText(null);
    setDeadlineText(null);
  };

  return (
    <SettingsPanel
      title="Job quality filters"
      description="Keep your job lists focused. Hidden jobs are never deleted — you can review them anytime under Jobs → Hidden, with the reason shown."
    >
      <SettingsCard icon={<EyeOff />} title="Automatically hide" description="These jobs won't appear in your main lists.">
        <div className="divide-y divide-border">
          {hideKeys.map((k) => {
            const m = toggleMeta(HIDE_LABELS, k);
            return (
              <SwitchRow
                key={k}
                label={m.label}
                description={m.description}
                checked={!!draft.hide[k]}
                onCheckedChange={(v) => setDraft({ ...draft, hide: { ...draft.hide, [k]: v } })}
              />
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard icon={<Flag />} title="Flag for review" description="These jobs stay visible with a warning so you can decide.">
        <div className="divide-y divide-border">
          {flagKeys.map((k) => {
            const m = toggleMeta(FLAG_LABELS, k);
            return (
              <SwitchRow
                key={k}
                label={m.label}
                description={m.description}
                checked={!!draft.flag[k]}
                onCheckedChange={(v) => setDraft({ ...draft, flag: { ...draft.flag, [k]: v } })}
              />
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard icon={<Timer />} title="Timing">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Maximum posting age" hint="Days (1–365). Older postings are flagged as very old.">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={ageText ?? String(draft.max_age_days)}
              onChange={(e) => {
                setAgeText(e.target.value);
                setDraft({ ...draft, max_age_days: clampInt(e.target.value, 1, 365, draft.max_age_days) });
              }}
              onBlur={() => setAgeText(null)}
            />
          </Field>
          <Field label="Deadline warning" hint="Days before a deadline to warn you (1–60).">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={deadlineText ?? String(draft.deadline_warning_days)}
              onChange={(e) => {
                setDeadlineText(e.target.value);
                setDraft({ ...draft, deadline_warning_days: clampInt(e.target.value, 1, 60, draft.deadline_warning_days) });
              }}
              onBlur={() => setDeadlineText(null)}
            />
          </Field>
        </div>
      </SettingsCard>

      <SaveBar dirty={dirty} saving={save.isPending} onSave={onSave} onReset={onReset} />
    </SettingsPanel>
  );
}
