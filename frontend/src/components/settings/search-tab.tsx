"use client";

import * as React from "react";
import { toast } from "sonner";
import { Briefcase, Building2, DollarSign, MapPin, Wrench } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { EXPERIENCE_LEVEL_LABELS, JOB_TYPE_LABELS, WORK_ARRANGEMENT_LABELS } from "@/lib/constants";
import { usePreferences, useUpdatePreferences } from "@/lib/queries/core";
import type { ExperienceLevel, JobType, Preferences, WorkArrangement } from "@/lib/types";
import { ErrorState } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { ChipSelect, TagInput } from "@/components/ui/tag-input";
import { FieldSet, PanelSkeleton, SaveBar, SettingsCard, SettingsPanel, useDraft } from "./settings-shared";

type SearchProfile = Pick<
  Preferences,
  | "target_locations"
  | "job_types"
  | "work_arrangements"
  | "experience_levels"
  | "target_roles"
  | "salary_min"
  | "salary_max"
  | "salary_period"
  | "currency"
  | "industries"
  | "preferred_companies"
  | "avoid_companies"
  | "technologies"
  | "required_certifications_available"
>;

const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "AUD", "INR"] as const;

function options<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

function pick(p: Preferences): SearchProfile {
  return {
    target_locations: p.target_locations,
    job_types: p.job_types,
    work_arrangements: p.work_arrangements,
    experience_levels: p.experience_levels,
    target_roles: p.target_roles,
    salary_min: p.salary_min,
    salary_max: p.salary_max,
    salary_period: p.salary_period,
    currency: p.currency,
    industries: p.industries,
    preferred_companies: p.preferred_companies,
    avoid_companies: p.avoid_companies,
    technologies: p.technologies,
    required_certifications_available: p.required_certifications_available,
  };
}

function parseMoney(v: string): number | null {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return v.trim() === "" || Number.isNaN(n) ? null : Math.round(n);
}

export function SearchProfileTab() {
  const { data, isLoading, error, refetch } = usePreferences();
  const server = React.useMemo(() => (data ? pick(data) : undefined), [data]);
  const { draft, setDraft, dirty, reset, commit } = useDraft(server);
  const save = useUpdatePreferences();

  if (isLoading) return <PanelSkeleton cards={3} />;
  if (error || !draft) return <ErrorState error={error} title="We couldn't load your search profile" onRetry={() => refetch()} />;

  const set = <K extends keyof SearchProfile>(key: K, value: SearchProfile[K]) => setDraft({ ...draft, [key]: value });
  const salaryError =
    draft.salary_min !== null && draft.salary_max !== null && draft.salary_max < draft.salary_min
      ? "Maximum salary should be at least the minimum."
      : null;
  const conflicting = draft.preferred_companies.filter((c) =>
    draft.avoid_companies.some((a) => a.toLowerCase() === c.toLowerCase()),
  );

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: (saved) => {
        commit(pick(saved));
        toast.success("Search profile saved", { description: "Your job matches will refresh with these preferences." });
      },
      onError: (e) => toast.error(errorMessage(e, "We couldn't save your search profile.")),
    });
  };

  return (
    <SettingsPanel
      title="Job search profile"
      description="Tell your Career Agent what you're looking for. These preferences drive search, match scores and quality filters."
    >
      <SettingsCard icon={<Briefcase />} title="Roles & level" description="What kind of work you want next.">
        <div className="space-y-5">
          <Field label="Target roles" hint="Press Enter after each role, e.g. “Frontend Developer”.">
            <TagInput value={draft.target_roles} onChange={(v) => set("target_roles", v)} placeholder="Add a role" />
          </Field>
          <FieldSet legend="Experience levels">
            <ChipSelect<ExperienceLevel>
              aria-label="Experience levels"
              options={options(EXPERIENCE_LEVEL_LABELS)}
              value={draft.experience_levels}
              onChange={(v) => set("experience_levels", v)}
            />
          </FieldSet>
          <FieldSet legend="Job types">
            <ChipSelect<JobType>
              aria-label="Job types"
              options={options(JOB_TYPE_LABELS)}
              value={draft.job_types}
              onChange={(v) => set("job_types", v)}
            />
          </FieldSet>
        </div>
      </SettingsCard>

      <SettingsCard icon={<MapPin />} title="Location" description="Where you're willing to work.">
        <div className="space-y-5">
          <Field label="Target locations" hint="Add every city or region you'd consider, e.g. “Toronto, ON” or “Remote — Canada”.">
            <TagInput value={draft.target_locations} onChange={(v) => set("target_locations", v)} placeholder="Add a location" />
          </Field>
          <FieldSet legend="Work arrangements">
            <ChipSelect<WorkArrangement>
              aria-label="Work arrangements"
              options={options(WORK_ARRANGEMENT_LABELS)}
              value={draft.work_arrangements}
              onChange={(v) => set("work_arrangements", v)}
            />
          </FieldSet>
        </div>
      </SettingsCard>

      <SettingsCard icon={<DollarSign />} title="Compensation" description="Jobs below your minimum can be hidden or flagged in Quality filters.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum salary">
            <Input
              inputMode="numeric"
              value={draft.salary_min ?? ""}
              onChange={(e) => set("salary_min", parseMoney(e.target.value))}
              placeholder={draft.salary_period === "hourly" ? "e.g. 35" : "e.g. 80000"}
            />
          </Field>
          <Field label="Maximum salary" hint="Optional" error={salaryError}>
            <Input
              inputMode="numeric"
              value={draft.salary_max ?? ""}
              onChange={(e) => set("salary_max", parseMoney(e.target.value))}
              placeholder={draft.salary_period === "hourly" ? "e.g. 55" : "e.g. 120000"}
            />
          </Field>
          <FieldSet legend="Pay period">
            <ChipSelect<"yearly" | "hourly">
              single
              aria-label="Pay period"
              options={[
                { value: "yearly", label: "Yearly" },
                { value: "hourly", label: "Hourly" },
              ]}
              value={[draft.salary_period]}
              onChange={(v) => set("salary_period", v[0] ?? "yearly")}
            />
          </FieldSet>
          <Field label="Currency">
            <Select value={draft.currency} onChange={(e) => set("currency", e.target.value)}>
              {(CURRENCIES as readonly string[]).includes(draft.currency) ? null : <option value={draft.currency}>{draft.currency}</option>}
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard icon={<Building2 />} title="Industries & companies">
        <div className="space-y-5">
          <Field label="Industries" hint="Leave empty to consider all industries.">
            <TagInput value={draft.industries} onChange={(v) => set("industries", v)} placeholder="Add an industry" />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Preferred companies" hint="Matches from these companies get a small boost.">
              <TagInput value={draft.preferred_companies} onChange={(v) => set("preferred_companies", v)} placeholder="Add a company" />
            </Field>
            <Field
              label="Companies to avoid"
              hint="Hidden automatically when the “avoided companies” filter is on."
              error={conflicting.length ? `${conflicting.join(", ")} is in both lists.` : null}
            >
              <TagInput value={draft.avoid_companies} onChange={(v) => set("avoid_companies", v)} placeholder="Add a company" />
            </Field>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard icon={<Wrench />} title="Skills & credentials">
        <div className="space-y-5">
          <Field label="Technologies" hint="Tools and languages you want to work with.">
            <TagInput value={draft.technologies} onChange={(v) => set("technologies", v)} placeholder="Add a technology" />
          </Field>
          <Field
            label="Certifications you hold or can get"
            hint="Jobs that require certifications not listed here can be hidden or flagged."
          >
            <TagInput
              value={draft.required_certifications_available}
              onChange={(v) => set("required_certifications_available", v)}
              placeholder="e.g. AWS Solutions Architect"
            />
          </Field>
        </div>
      </SettingsCard>

      <SaveBar dirty={dirty} saving={save.isPending} onSave={onSave} onReset={reset} disabled={!!salaryError} />
    </SettingsPanel>
  );
}
