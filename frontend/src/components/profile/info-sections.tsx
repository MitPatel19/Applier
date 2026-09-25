"use client";

/** Personal, Professional and Work authorization sections (explicit Save per section). */

import * as React from "react";
import { BadgeCheck, BriefcaseBusiness, Globe2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import type { FullProfile, Profile, ProfileIn, WorkArrangement } from "@/lib/types";
import { WORK_ARRANGEMENT_LABELS } from "@/lib/constants";
import { useUpdateProfile, useUpdateUserName } from "@/lib/queries/profile";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ChipSelect, TagInput } from "@/components/ui/tag-input";
import { ProfileSection, SectionFooter, apiFieldError, apiGeneralError, emptyToNull } from "./shared";

/** Local form state helper: values + dirty tracking against the initial snapshot. */
function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = React.useState<T>(initial);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const set = <K extends keyof T>(k: K, v: T[K]) => setValues((prev) => ({ ...prev, [k]: v }));
  return { values, set, dirty, reset: () => setValues(initial) };
}

// ------------------------------------------------------------------ personal

const PERSONAL_FIELDS = ["full_name", "phone", "city", "province", "country", "linkedin_url", "portfolio_url", "github_url", "website_url"] as const;

export function PersonalSection({ full }: { full: FullProfile }) {
  // Remount when the saved values change so the form reflects the server state.
  const snapshot = JSON.stringify([full.user.full_name, ...PERSONAL_FIELDS.slice(1).map((k) => full.profile[k as keyof Profile])]);
  return <PersonalForm key={snapshot} full={full} />;
}

function PersonalForm({ full }: { full: FullProfile }) {
  const p = full.profile;
  const initial = {
    full_name: full.user.full_name ?? "",
    phone: p.phone ?? "",
    city: p.city ?? "",
    province: p.province ?? "",
    country: p.country ?? "",
    linkedin_url: p.linkedin_url ?? "",
    portfolio_url: p.portfolio_url ?? "",
    github_url: p.github_url ?? "",
    website_url: p.website_url ?? "",
  };
  const form = useForm(initial);
  const updateProfile = useUpdateProfile();
  const updateName = useUpdateUserName();
  const [nameError, setNameError] = React.useState<string | null>(null);
  const v = form.values;
  const err = updateProfile.error;
  const saving = updateProfile.isPending || updateName.isPending;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    if (!v.full_name.trim()) {
      setNameError("Please enter your name.");
      return;
    }
    if (v.full_name.trim() !== initial.full_name) {
      try {
        await updateName.mutateAsync(v.full_name.trim());
      } catch (e2) {
        setNameError(apiFieldError(e2, "full_name") ?? errorMessage(e2, "We couldn't save your name."));
        return;
      }
    }
    const body: ProfileIn = {};
    for (const k of PERSONAL_FIELDS.slice(1) as Exclude<(typeof PERSONAL_FIELDS)[number], "full_name">[]) {
      if (v[k] !== initial[k]) body[k] = emptyToNull(v[k]);
    }
    try {
      if (Object.keys(body).length) await updateProfile.mutateAsync(body);
      toast.success("Personal details saved", { description: "Used to fill in application forms for you." });
    } catch {
      toast.error("Some details weren't saved — check the highlighted fields.");
    }
  };

  const f = (k: keyof typeof initial) => apiFieldError(err, k);

  return (
    <ProfileSection
      id="personal"
      icon={<UserRound />}
      title="Personal"
      description="Contact details employers ask for on almost every form."
      onSubmit={save}
      footer={<SectionFooter dirty={form.dirty} saving={saving} onDiscard={form.reset} error={apiGeneralError(err, [...PERSONAL_FIELDS])} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={nameError}>
          <Input value={v.full_name} onChange={(e) => form.set("full_name", e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email" hint="Your sign-in email. Change it in Settings.">
          <Input value={full.user.email} readOnly disabled />
        </Field>
        <Field label="Phone" error={f("phone")}>
          <Input type="tel" value={v.phone} onChange={(e) => form.set("phone", e.target.value)} autoComplete="tel" placeholder="+1 416 555 0134" />
        </Field>
        <Field label="City" error={f("city")}>
          <Input value={v.city} onChange={(e) => form.set("city", e.target.value)} autoComplete="address-level2" />
        </Field>
        <Field label="Province / State" error={f("province")}>
          <Input value={v.province} onChange={(e) => form.set("province", e.target.value)} autoComplete="address-level1" />
        </Field>
        <Field label="Country" error={f("country")}>
          <Input value={v.country} onChange={(e) => form.set("country", e.target.value)} autoComplete="country-name" />
        </Field>
        <Field label="LinkedIn" error={f("linkedin_url")}>
          <Input type="url" value={v.linkedin_url} onChange={(e) => form.set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/you" />
        </Field>
        <Field label="Portfolio" error={f("portfolio_url")}>
          <Input type="url" value={v.portfolio_url} onChange={(e) => form.set("portfolio_url", e.target.value)} placeholder="https://" />
        </Field>
        <Field label="GitHub" error={f("github_url")}>
          <Input type="url" value={v.github_url} onChange={(e) => form.set("github_url", e.target.value)} placeholder="https://github.com/you" />
        </Field>
        <Field label="Website" error={f("website_url")}>
          <Input type="url" value={v.website_url} onChange={(e) => form.set("website_url", e.target.value)} placeholder="https://" />
        </Field>
      </div>
    </ProfileSection>
  );
}

// ------------------------------------------------------------------ professional

const ARRANGEMENT_OPTIONS = (Object.keys(WORK_ARRANGEMENT_LABELS) as WorkArrangement[]).map((value) => ({
  value,
  label: WORK_ARRANGEMENT_LABELS[value],
}));

export function ProfessionalSection({ profile }: { profile: Profile }) {
  const snapshot = JSON.stringify([
    profile.headline,
    profile.summary,
    profile.years_experience,
    profile.desired_positions,
    profile.desired_salary,
    profile.salary_period,
    profile.currency,
    profile.availability,
    profile.preferred_arrangements,
  ]);
  return <ProfessionalForm key={snapshot} profile={profile} />;
}

function ProfessionalForm({ profile: p }: { profile: Profile }) {
  const initial = {
    headline: p.headline ?? "",
    summary: p.summary ?? "",
    years_experience: p.years_experience === null ? "" : String(p.years_experience),
    desired_positions: p.desired_positions,
    desired_salary: p.desired_salary === null ? "" : String(p.desired_salary),
    salary_period: p.salary_period,
    currency: p.currency || "CAD",
    availability: p.availability ?? "",
    preferred_arrangements: p.preferred_arrangements,
  };
  const form = useForm(initial);
  const update = useUpdateProfile();
  const v = form.values;
  const [localErr, setLocalErr] = React.useState<Record<string, string>>({});
  const f = (k: string) => localErr[k] ?? apiFieldError(update.error, k);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const years = v.years_experience.trim() === "" ? null : Number(v.years_experience);
    if (years !== null && (Number.isNaN(years) || years < 0 || years > 60)) errs.years_experience = "Enter a number between 0 and 60.";
    const salary = v.desired_salary.trim() === "" ? null : Number(v.desired_salary.replace(/[,\s$]/g, ""));
    if (salary !== null && (Number.isNaN(salary) || salary < 0)) errs.desired_salary = "Enter a positive number, e.g. 75000.";
    if (!/^[A-Za-z]{3}$/.test(v.currency.trim())) errs.currency = "Use a 3-letter code like CAD or USD.";
    setLocalErr(errs);
    if (Object.keys(errs).length) return;
    update.mutate(
      {
        headline: emptyToNull(v.headline),
        summary: emptyToNull(v.summary),
        years_experience: years,
        desired_positions: v.desired_positions,
        desired_salary: salary === null ? null : Math.round(salary),
        salary_period: v.salary_period,
        currency: v.currency.trim().toUpperCase(),
        availability: emptyToNull(v.availability),
        preferred_arrangements: v.preferred_arrangements,
      },
      {
        onSuccess: () =>
          toast.success("Professional details saved", { description: "Job matches will refresh with your updated preferences." }),
      },
    );
  };

  return (
    <ProfileSection
      id="professional"
      icon={<BriefcaseBusiness />}
      title="Professional"
      description="How you describe yourself and what you're looking for."
      onSubmit={save}
      footer={
        <SectionFooter
          dirty={form.dirty}
          saving={update.isPending}
          onDiscard={() => {
            form.reset();
            setLocalErr({});
          }}
          error={apiGeneralError(update.error, Object.keys(initial))}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Headline" className="sm:col-span-2" hint="e.g. “Junior Software Developer · Python, React, SQL”" error={f("headline")}>
          <Input value={v.headline} onChange={(e) => form.set("headline", e.target.value)} maxLength={300} />
        </Field>
        <Field label="Summary" className="sm:col-span-2" hint="2–4 sentences. Used in resumes and cover letters." error={f("summary")}>
          <Textarea rows={4} value={v.summary} onChange={(e) => form.set("summary", e.target.value)} />
        </Field>
        <Field label="Years of experience" error={f("years_experience")}>
          <Input type="number" inputMode="decimal" min={0} max={60} step={0.5} value={v.years_experience} onChange={(e) => form.set("years_experience", e.target.value)} />
        </Field>
        <Field label="Availability" hint="e.g. “Immediately” or “2 weeks’ notice”" error={f("availability")}>
          <Input value={v.availability} onChange={(e) => form.set("availability", e.target.value)} />
        </Field>
        <Field label="Desired positions" className="sm:col-span-2" hint="Press Enter after each title." error={f("desired_positions")}>
          <TagInput value={v.desired_positions} onChange={(x) => form.set("desired_positions", x)} placeholder="e.g. Software Developer" />
        </Field>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 sm:col-span-2">
          <Field label="Desired salary" error={f("desired_salary")}>
            <Input inputMode="numeric" value={v.desired_salary} onChange={(e) => form.set("desired_salary", e.target.value)} placeholder="75000" />
          </Field>
          <Field label="Per" error={f("salary_period")}>
            <Select value={v.salary_period} onChange={(e) => form.set("salary_period", e.target.value as Profile["salary_period"])} className="w-28">
              <option value="yearly">Year</option>
              <option value="hourly">Hour</option>
            </Select>
          </Field>
          <Field label="Currency" error={f("currency")}>
            <Input value={v.currency} onChange={(e) => form.set("currency", e.target.value.toUpperCase())} maxLength={3} className="w-20 uppercase" />
          </Field>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <p className="text-sm font-medium" id="arrangements-label">
            Preferred work arrangements
          </p>
          <ChipSelect
            aria-label="Preferred work arrangements"
            options={ARRANGEMENT_OPTIONS}
            value={v.preferred_arrangements}
            onChange={(x) => form.set("preferred_arrangements", x)}
          />
        </div>
      </div>
    </ProfileSection>
  );
}

// ------------------------------------------------------------------ work authorization

export function AuthorizationSection({ profile }: { profile: Profile }) {
  const snapshot = JSON.stringify([profile.authorized_countries, profile.requires_sponsorship, profile.work_authorization]);
  return <AuthorizationForm key={snapshot} profile={profile} />;
}

function AuthorizationForm({ profile: p }: { profile: Profile }) {
  const initial = {
    authorized_countries: p.authorized_countries,
    requires_sponsorship: p.requires_sponsorship === null ? "" : p.requires_sponsorship ? "yes" : "no",
    work_authorization: p.work_authorization ?? "",
  };
  const form = useForm(initial);
  const update = useUpdateProfile();
  const v = form.values;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        authorized_countries: v.authorized_countries,
        requires_sponsorship: v.requires_sponsorship === "" ? null : v.requires_sponsorship === "yes",
        work_authorization: emptyToNull(v.work_authorization),
      },
      { onSuccess: () => toast.success("Work authorization saved", { description: "Applier uses this to answer eligibility questions accurately." }) },
    );
  };

  return (
    <ProfileSection
      id="authorization"
      icon={<Globe2 />}
      title="Work authorization"
      description="Answered on most applications. We'll always ask you to confirm these answers."
      onSubmit={save}
      footer={
        <SectionFooter dirty={form.dirty} saving={update.isPending} onDiscard={form.reset} error={apiGeneralError(update.error, Object.keys(initial))} />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Countries you can work in" className="sm:col-span-2" hint="Press Enter after each country." error={apiFieldError(update.error, "authorized_countries")}>
          <TagInput value={v.authorized_countries} onChange={(x) => form.set("authorized_countries", x)} placeholder="e.g. Canada" />
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Do you require visa sponsorship?</p>
          <ChipSelect
            single
            aria-label="Requires sponsorship"
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes" },
            ]}
            value={v.requires_sponsorship ? [v.requires_sponsorship] : []}
            onChange={(x) => form.set("requires_sponsorship", x[0] ?? "")}
          />
        </div>
        <Field label="Notes" hint="e.g. “Canadian citizen” or “Open work permit until 2027”" error={apiFieldError(update.error, "work_authorization")}>
          <Input value={v.work_authorization} onChange={(e) => form.set("work_authorization", e.target.value)} />
        </Field>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-caption text-subtle">
        <BadgeCheck className="size-3.5 text-success" aria-hidden /> Never shared with anyone except in applications you approve.
      </p>
    </ProfileSection>
  );
}
