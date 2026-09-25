"use client";

import * as React from "react";
import { toast } from "sonner";
import { Globe, MapPin, Sparkles, UserRound } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/input";
import { SkeletonCard } from "@/components/ui/feedback";
import { TagInput } from "@/components/ui/tag-input";
import { ApiError, errorMessage } from "@/lib/api";
import { useFullProfile, useSaveManualProfile } from "@/lib/queries/onboarding";
import type { FullProfile, ProfileIn } from "@/lib/types";
import { ContinueButton, Panel, PanelTitle, StepFooter } from "./step-shell";

const WORK_AUTH = [
  "Canadian citizen",
  "Permanent resident",
  "Open work permit",
  "Employer-specific work permit",
  "Post-graduation work permit (PGWP)",
  "Study permit (can work part-time)",
  "Requires sponsorship",
  "Other",
];

const SKILL_SUGGESTIONS = [
  "Python", "Java", "JavaScript", "TypeScript", "React", "Node.js", "SQL", "PostgreSQL", "Git", "Docker",
  "AWS", "Azure", "Linux", "Windows Server", "Active Directory", "Networking", "REST APIs", "Spring Boot",
  "FastAPI", "Django", "HTML", "CSS", "C#", ".NET", "Troubleshooting", "Customer service", "Agile",
];

type FormKey = "headline" | "city" | "province" | "country" | "phone" | "linkedin_url" | "github_url" | "portfolio_url" | "work_authorization";
type FormState = Record<FormKey, string>;
const URL_KEYS: FormKey[] = ["linkedin_url", "github_url", "portfolio_url"];

function initialState(p: FullProfile | undefined): FormState {
  const pr = p?.profile;
  return {
    headline: pr?.headline ?? "",
    city: pr?.city ?? "",
    province: pr?.province ?? "",
    country: pr?.country ?? "Canada",
    phone: pr?.phone ?? "",
    linkedin_url: pr?.linkedin_url ?? "",
    github_url: pr?.github_url ?? "",
    portfolio_url: pr?.portfolio_url ?? "",
    work_authorization: pr?.work_authorization ?? "",
  };
}

function normalizeUrl(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function urlError(v: string): string | undefined {
  const u = normalizeUrl(v);
  if (!u) return undefined;
  try {
    const parsed = new URL(u);
    return parsed.hostname.includes(".") ? undefined : "Enter a full web address, like linkedin.com/in/yourname";
  } catch {
    return "Enter a valid web address";
  }
}

function ManualForm({
  profile,
  onDone,
  onBack,
}: {
  profile: FullProfile | undefined;
  onDone: () => void;
  onBack: () => void;
}) {
  const save = useSaveManualProfile();
  const [form, setForm] = React.useState<FormState>(() => initialState(profile));
  const existingSkills = React.useMemo(() => (profile?.skills ?? []).map((s) => s.name), [profile]);
  const [skills, setSkills] = React.useState<string[]>(existingSkills);
  const [submitted, setSubmitted] = React.useState(false);
  const [serverErrors, setServerErrors] = React.useState<Partial<Record<FormKey, string>>>({});

  const set = (k: FormKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setServerErrors((s) => ({ ...s, [k]: undefined }));
  };
  const errorFor = (k: FormKey) =>
    serverErrors[k] ?? (submitted && URL_KEYS.includes(k) ? urlError(form[k]) : undefined) ?? null;

  const submit = () => {
    setSubmitted(true);
    if (URL_KEYS.some((k) => urlError(form[k]))) return;
    const body: ProfileIn = {};
    (Object.keys(form) as FormKey[]).forEach((k) => {
      const v = URL_KEYS.includes(k) ? normalizeUrl(form[k]) : form[k].trim() || null;
      body[k] = v;
    });
    const lower = new Set(existingSkills.map((s) => s.toLowerCase()));
    const newSkills = skills.filter((s) => !lower.has(s.toLowerCase())).map((name) => ({ name }));
    save.mutate(
      { profile: body, skills: newSkills },
      {
        onSuccess: () => {
          toast.success("Profile saved");
          onDone();
        },
        onError: (err) => {
          if (err instanceof ApiError && err.fieldErrors.length) {
            const next: Partial<Record<FormKey, string>> = {};
            err.fieldErrors.forEach((fe) => {
              const k = String(fe.field).split(".").pop() as FormKey;
              if (k in form) next[k] = fe.message;
            });
            setServerErrors(next);
          }
          toast.error(errorMessage(err, "We couldn't save your profile. Please try again."));
        },
      },
    );
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-4 animate-rise"
    >
      <Panel>
        <PanelTitle icon={<UserRound />} title="About you" description="The basics employers see first." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Professional headline" hint="e.g. “Junior Full Stack Developer · React & Python”" className="sm:col-span-2">
            <Input value={form.headline} onChange={set("headline")} maxLength={200} />
          </Field>
          <Field label="Phone" error={errorFor("phone")}>
            <Input type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Work authorization" hint="Used to answer eligibility questions accurately.">
            <Select value={form.work_authorization} onChange={set("work_authorization")}>
              <option value="">Select…</option>
              {WORK_AUTH.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
              {form.work_authorization && !WORK_AUTH.includes(form.work_authorization) && (
                <option value={form.work_authorization}>{form.work_authorization}</option>
              )}
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelTitle icon={<MapPin />} title="Location" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City">
            <Input autoComplete="address-level2" value={form.city} onChange={set("city")} placeholder="Thunder Bay" />
          </Field>
          <Field label="Province / State">
            <Input autoComplete="address-level1" value={form.province} onChange={set("province")} placeholder="ON" />
          </Field>
          <Field label="Country">
            <Input autoComplete="country-name" value={form.country} onChange={set("country")} />
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelTitle icon={<Globe />} title="Links" description="Optional, but they help your applications stand out." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="LinkedIn" error={errorFor("linkedin_url")}>
            <Input type="url" inputMode="url" value={form.linkedin_url} onChange={set("linkedin_url")} placeholder="linkedin.com/in/you" />
          </Field>
          <Field label="GitHub" error={errorFor("github_url")}>
            <Input type="url" inputMode="url" value={form.github_url} onChange={set("github_url")} placeholder="github.com/you" />
          </Field>
          <Field label="Portfolio" error={errorFor("portfolio_url")}>
            <Input type="url" inputMode="url" value={form.portfolio_url} onChange={set("portfolio_url")} placeholder="you.dev" />
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelTitle icon={<Sparkles />} title="Skills" description="Add the skills you'd be comfortable discussing in an interview." />
        <Field label="Your skills" hint="Press Enter or comma after each skill.">
          <TagInput value={skills} onChange={setSkills} suggestions={SKILL_SUGGESTIONS} placeholder="e.g. Python, React, SQL" />
        </Field>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Suggested skills">
          {SKILL_SUGGESTIONS.filter((s) => !skills.some((x) => x.toLowerCase() === s.toLowerCase()))
            .slice(0, 12)
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSkills((prev) => [...prev, s])}
                className="rounded-full border border-dashed border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-soft-fg"
                aria-label={`Add skill ${s}`}
              >
                + {s}
              </button>
            ))}
        </div>
      </Panel>

      <StepFooter
        onBack={onBack}
        primary={
          <ContinueButton type="submit" loading={save.isPending}>
            {save.isPending ? "Saving…" : "Save & continue"}
          </ContinueButton>
        }
      />
    </form>
  );
}

/** Manual profile entry, prefilled with anything already on the profile. */
export function ManualProfile({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { data, isLoading } = useFullProfile();
  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading your profile">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={2} />
      </div>
    );
  }
  // If loading the profile fails we still let people fill the form from scratch.
  return <ManualForm key={data ? "loaded" : "empty"} profile={data} onDone={onDone} onBack={onBack} />;
}
