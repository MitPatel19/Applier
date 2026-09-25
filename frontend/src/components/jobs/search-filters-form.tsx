"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { EXPERIENCE_LEVEL_LABELS, JOB_TYPE_LABELS, WORK_ARRANGEMENT_LABELS } from "@/lib/constants";
import type { ExperienceLevel, JobType, SearchFilters, SourceKey, WorkArrangement } from "@/lib/types";
import { cn, formatMoney } from "@/lib/utils";
import { Field, Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/primitives";
import { ChipSelect, TagInput } from "@/components/ui/tag-input";

export const SOURCE_OPTIONS: { value: SourceKey; label: string }[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "company_sites", label: "Employer websites" },
];

const POSTED_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any time" },
  { value: "1", label: "Past 24 hours" },
  { value: "3", label: "Past 3 days" },
  { value: "7", label: "Past week" },
  { value: "14", label: "Past 2 weeks" },
  { value: "30", label: "Past month" },
];

export function isEmptyFilters(f: SearchFilters) {
  return !f.roles.length && !f.keywords.length && !f.locations.length && !f.remote_regions.length && !f.companies.length;
}

/** One-line human summary: "Python Developer, Java Developer · Thunder Bay + Remote (Canada) · $55k+ · past 7 days". */
export function summarizeFilters(f: SearchFilters) {
  const parts: string[] = [];
  const what = [...f.roles, ...f.keywords].slice(0, 4);
  if (what.length) parts.push(what.join(", "));
  const where = [...f.locations, ...f.remote_regions.map((r) => `Remote (${r})`)];
  if (where.length) parts.push(where.slice(0, 3).join(" + "));
  if (f.work_arrangements.length) parts.push(f.work_arrangements.map((a) => WORK_ARRANGEMENT_LABELS[a]).join("/"));
  if (f.experience_levels.length) parts.push(f.experience_levels.map((l) => EXPERIENCE_LEVEL_LABELS[l]).join("/"));
  if (f.salary_min) parts.push(`${f.salary_period === "hourly" ? formatMoney(f.salary_min) + "/hr" : formatMoney(f.salary_min)}+`);
  if (f.posted_within_days) parts.push(`past ${f.posted_within_days} ${f.posted_within_days === 1 ? "day" : "days"}`);
  if (f.exclude_companies.length) parts.push(`excluding ${f.exclude_companies.slice(0, 2).join(", ")}`);
  return parts.join(" · ") || "No filters";
}

function options<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((k) => ({ value: k, label: labels[k] }));
}

function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
      {hint && <p className="text-caption text-subtle">{hint}</p>}
    </div>
  );
}

/** Editable structured search filters — the source of truth that actually runs. */
export function SearchFiltersForm({ value, onChange }: { value: SearchFilters; onChange: (next: SearchFilters) => void }) {
  const [advanced, setAdvanced] = React.useState(
    () => value.companies.length > 0 || value.exclude_companies.length > 0 || value.industries.length > 0 || value.easy_apply_only,
  );
  const set = <K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) => onChange({ ...value, [k]: v });
  const easyId = React.useId();

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Job titles / roles" hint="Press Enter after each one.">
          <TagInput value={value.roles} onChange={(v) => set("roles", v)} placeholder="Python Developer" />
        </Field>
        <Field label="Keywords & skills">
          <TagInput value={value.keywords} onChange={(v) => set("keywords", v)} placeholder="Django, REST APIs" />
        </Field>
        <Field label="Locations">
          <TagInput value={value.locations} onChange={(v) => set("locations", v)} placeholder="Thunder Bay, ON" />
        </Field>
        <Field label="Remote within" hint="Countries or regions where remote work is allowed.">
          <TagInput value={value.remote_regions} onChange={(v) => set("remote_regions", v)} placeholder="Canada" />
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Group label="Work arrangement">
          <ChipSelect<WorkArrangement> aria-label="Work arrangement" options={options(WORK_ARRANGEMENT_LABELS)} value={value.work_arrangements} onChange={(v) => set("work_arrangements", v)} />
        </Group>
        <Group label="Job type">
          <ChipSelect<JobType> aria-label="Job type" options={options(JOB_TYPE_LABELS)} value={value.job_types} onChange={(v) => set("job_types", v)} />
        </Group>
        <Group label="Experience level">
          <ChipSelect<ExperienceLevel>
            aria-label="Experience level"
            options={options(EXPERIENCE_LEVEL_LABELS)}
            value={value.experience_levels}
            onChange={(v) => set("experience_levels", v)}
          />
        </Group>
      </div>

      <div className="grid gap-5 sm:grid-cols-[1fr_8rem_1fr]">
        <Field label="Minimum salary">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={value.salary_min ?? ""}
            onChange={(e) => set("salary_min", e.target.value ? Math.max(0, Number(e.target.value)) : null)}
            placeholder="55000"
          />
        </Field>
        <Field label="Per">
          <Select value={value.salary_period} onChange={(e) => set("salary_period", e.target.value as SearchFilters["salary_period"])}>
            <option value="yearly">Year</option>
            <option value="hourly">Hour</option>
          </Select>
        </Field>
        <Field label="Posted within">
          <Select
            value={value.posted_within_days ? String(value.posted_within_days) : ""}
            onChange={(e) => set("posted_within_days", e.target.value ? Number(e.target.value) : null)}
          >
            {POSTED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="rounded-xl border border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-sm font-medium hover:bg-bg-subtle"
          aria-expanded={advanced}
          onClick={() => setAdvanced((v) => !v)}
        >
          Companies & more
          <ChevronDown className={cn("size-4 text-subtle transition-transform", advanced && "rotate-180")} aria-hidden />
        </button>
        {advanced && (
          <div className="grid gap-5 border-t border-border p-4 md:grid-cols-2">
            <Field label="Only these companies">
              <TagInput value={value.companies} onChange={(v) => set("companies", v)} placeholder="Shopify" />
            </Field>
            <Field label="Exclude companies" hint="Staffing agencies or employers you'd rather skip.">
              <TagInput value={value.exclude_companies} onChange={(v) => set("exclude_companies", v)} placeholder="Acme Staffing" />
            </Field>
            <Field label="Industries">
              <TagInput value={value.industries} onChange={(v) => set("industries", v)} placeholder="Healthcare, Fintech" />
            </Field>
            <div className="flex items-start justify-between gap-4 pt-6">
              <div>
                <Label htmlFor={easyId}>Quick-apply jobs only</Label>
                <p className="text-caption text-subtle">Postings you can apply to directly on the job site.</p>
              </div>
              <Switch id={easyId} checked={value.easy_apply_only} onCheckedChange={(v) => set("easy_apply_only", v)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
