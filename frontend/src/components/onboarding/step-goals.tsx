"use client";

import * as React from "react";
import { toast } from "sonner";
import { Briefcase, DollarSign, MapPin, SlidersHorizontal } from "lucide-react";
import { ErrorState, SkeletonCard } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { ChipSelect, TagInput } from "@/components/ui/tag-input";
import { errorMessage } from "@/lib/api";
import { EXPERIENCE_LEVEL_LABELS, JOB_TYPE_LABELS, WORK_ARRANGEMENT_LABELS } from "@/lib/constants";
import { usePreferences, useUpdatePreferences } from "@/lib/queries/core";
import type { ExperienceLevel, JobType, Preferences, WorkArrangement } from "@/lib/types";
import { ContinueButton, Panel, PanelTitle, StepFooter, StepHeader } from "./step-shell";
import type { StepProps } from "./steps";

const ROLE_SUGGESTIONS = [
  "Junior Software Developer",
  "Full Stack Developer",
  "Backend Developer",
  "Python Developer",
  "Java Developer",
  "IT Support",
  "Technical Support",
  "Systems Administrator",
];
const LOCATION_SUGGESTIONS = ["Thunder Bay, ON", "Toronto, ON", "Waterloo, ON", "Ontario", "Canada", "Remote Canada"];

const options = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

function SuggestionChips({
  suggestions,
  value,
  onAdd,
  label,
}: {
  suggestions: string[];
  value: string[];
  onAdd: (s: string) => void;
  label: string;
}) {
  const remaining = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
  if (!remaining.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {remaining.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onAdd(s)}
          className="rounded-full border border-dashed border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-soft-fg"
        >
          <span aria-hidden>+ </span>
          {s}
          <span className="sr-only"> (add)</span>
        </button>
      ))}
    </div>
  );
}

interface GoalsForm {
  target_roles: string[];
  target_locations: string[];
  salary_min: string;
  salary_period: "yearly" | "hourly";
  currency: string;
  work_arrangements: WorkArrangement[];
  job_types: JobType[];
  experience_levels: ExperienceLevel[];
}

function fromPreferences(p: Preferences): GoalsForm {
  return {
    target_roles: p.target_roles ?? [],
    target_locations: p.target_locations ?? [],
    salary_min: p.salary_min ? String(p.salary_min) : "",
    salary_period: p.salary_period ?? "yearly",
    currency: p.currency || "CAD",
    work_arrangements: p.work_arrangements ?? [],
    job_types: p.job_types ?? [],
    experience_levels: p.experience_levels ?? [],
  };
}

function GoalsEditor({ prefs, onBack, onNext, onComplete }: StepProps & { prefs: Preferences }) {
  const update = useUpdatePreferences();
  const [form, setForm] = React.useState<GoalsForm>(() => fromPreferences(prefs));
  const [submitted, setSubmitted] = React.useState(false);
  const set = <K extends keyof GoalsForm>(k: K, v: GoalsForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const salaryNum = form.salary_min.trim() ? Number(form.salary_min.replace(/[,\s$]/g, "")) : null;
  const salaryError =
    salaryNum !== null && (!Number.isFinite(salaryNum) || salaryNum < 0) ? "Enter a number, like 65000" : null;
  const rolesError = submitted && form.target_roles.length === 0 ? "Add at least one role so we know what to search for" : null;

  const save = () => {
    setSubmitted(true);
    if (salaryError || form.target_roles.length === 0) return;
    update.mutate(
      {
        target_roles: form.target_roles,
        target_locations: form.target_locations,
        salary_min: salaryNum,
        salary_period: form.salary_period,
        currency: form.currency,
        work_arrangements: form.work_arrangements,
        job_types: form.job_types,
        experience_levels: form.experience_levels,
      },
      {
        onSuccess: () => {
          toast.success("Career goals saved");
          onComplete();
        },
        onError: (err) => toast.error(errorMessage(err, "We couldn't save your goals. Please try again.")),
      },
    );
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-4"
    >
      <Panel>
        <PanelTitle icon={<Briefcase />} title="What roles are you looking for?" />
        <Field label="Target roles" error={rolesError} hint="Type a role and press Enter, or pick a suggestion." required>
          <TagInput
            value={form.target_roles}
            onChange={(v) => set("target_roles", v)}
            suggestions={ROLE_SUGGESTIONS}
            placeholder="e.g. Junior Software Developer"
          />
        </Field>
        <SuggestionChips
          label="Suggested roles"
          suggestions={ROLE_SUGGESTIONS}
          value={form.target_roles}
          onAdd={(s) => set("target_roles", [...form.target_roles, s])}
        />
      </Panel>

      <Panel>
        <PanelTitle icon={<MapPin />} title="Where do you want to work?" />
        <Field label="Locations" hint="Cities, provinces or “Remote Canada”.">
          <TagInput
            value={form.target_locations}
            onChange={(v) => set("target_locations", v)}
            suggestions={LOCATION_SUGGESTIONS}
            placeholder="e.g. Toronto, ON"
          />
        </Field>
        <SuggestionChips
          label="Suggested locations"
          suggestions={LOCATION_SUGGESTIONS}
          value={form.target_locations}
          onAdd={(s) => set("target_locations", [...form.target_locations, s])}
        />
        <div className="mt-5">
          <p className="text-sm font-medium">
            Work arrangement
          </p>
          <ChipSelect
            className="mt-2"
            aria-label="Work arrangement"
            options={options(WORK_ARRANGEMENT_LABELS)}
            value={form.work_arrangements}
            onChange={(v) => set("work_arrangements", v)}
          />
        </div>
      </Panel>

      <Panel>
        <PanelTitle icon={<DollarSign />} title="Minimum salary" description="Optional. Used to flag roles below your target — never shared with employers." />
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem_8rem]">
          <Field label="Minimum" error={salaryError}>
            <Input
              inputMode="numeric"
              value={form.salary_min}
              onChange={(e) => set("salary_min", e.target.value)}
              placeholder={form.salary_period === "hourly" ? "25" : "60000"}
            />
          </Field>
          <Field label="Period">
            <Select value={form.salary_period} onChange={(e) => set("salary_period", e.target.value as GoalsForm["salary_period"])}>
              <option value="yearly">Per year</option>
              <option value="hourly">Per hour</option>
            </Select>
          </Field>
          <Field label="Currency">
            <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              <option value="CAD">CAD</option>
              <option value="USD">USD</option>
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelTitle icon={<SlidersHorizontal />} title="Job type & level" />
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium">Job types</p>
            <ChipSelect
              className="mt-2"
              aria-label="Job types"
              options={options(JOB_TYPE_LABELS)}
              value={form.job_types}
              onChange={(v) => set("job_types", v)}
            />
          </div>
          <div>
            <p className="text-sm font-medium">Experience levels</p>
            <ChipSelect
              className="mt-2"
              aria-label="Experience levels"
              options={options(EXPERIENCE_LEVEL_LABELS)}
              value={form.experience_levels}
              onChange={(v) => set("experience_levels", v)}
            />
          </div>
        </div>
      </Panel>

      <StepFooter
        onBack={onBack}
        onSkip={onNext}
        primary={
          <ContinueButton type="submit" loading={update.isPending}>
            {update.isPending ? "Saving…" : "Save & continue"}
          </ContinueButton>
        }
      />
    </form>
  );
}

export function StepGoals(props: StepProps) {
  const { data, isLoading, error, refetch } = usePreferences();
  return (
    <div>
      <StepHeader
        eyebrow="Step 3 · Career goals"
        title="What does your next role look like?"
        description="Your agent searches and scores jobs against these goals. You can fine-tune them anytime in Settings."
      />
      {isLoading ? (
        <div className="space-y-4" role="status" aria-label="Loading your preferences">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </div>
      ) : error || !data ? (
        <>
          <ErrorState error={error} title="We couldn't load your preferences" onRetry={() => refetch()} onContinue={props.onNext} continueLabel="Skip this step" />
          <StepFooter onBack={props.onBack} />
        </>
      ) : (
        <GoalsEditor {...props} prefs={data} />
      )}
    </div>
  );
}
