"use client";

import * as React from "react";
import { Briefcase, FolderGit2, GraduationCap, RotateCcw, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/primitives";
import { TagInput } from "@/components/ui/tag-input";
import type { EducationIn, ExperienceIn, ParsedResume, ProjectIn, SkillIn } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ContinueButton, Panel, PanelTitle, StepFooter } from "./step-shell";

type ContactKey =
  | "headline"
  | "phone"
  | "city"
  | "province"
  | "country"
  | "linkedin_url"
  | "github_url"
  | "portfolio_url";

const CONTACT_FIELDS: { key: ContactKey; label: string; type?: string; autoComplete?: string; span?: boolean }[] = [
  { key: "headline", label: "Headline", span: true },
  { key: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
  { key: "city", label: "City", autoComplete: "address-level2" },
  { key: "province", label: "Province / State", autoComplete: "address-level1" },
  { key: "country", label: "Country", autoComplete: "country-name" },
  { key: "linkedin_url", label: "LinkedIn URL", type: "url" },
  { key: "github_url", label: "GitHub URL", type: "url" },
  { key: "portfolio_url", label: "Portfolio URL", type: "url", span: true },
];

function dateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return null;
  return `${start || "?"} – ${end || "Present"}`;
}

function IncludeRow({
  checked,
  onChange,
  title,
  subtitle,
  meta,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  children?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <li
      className={cn(
        "rounded-xl border p-3.5 transition-colors",
        checked ? "border-border bg-surface" : "border-dashed border-border bg-bg-subtle/60 opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-semibold text-text">{title}</span>
          {(subtitle || meta) && (
            <span className="mt-0.5 block text-sm text-muted">
              {subtitle}
              {subtitle && meta && " · "}
              {meta}
            </span>
          )}
        </label>
      </div>
      {children && checked && <div className="mt-2 pl-[30px]">{children}</div>}
    </li>
  );
}

export function ParsedReview({
  parsed,
  saving,
  onSave,
  onReplace,
  onBack,
}: {
  parsed: ParsedResume;
  saving: boolean;
  onSave: (reviewed: ParsedResume) => void;
  onReplace: () => void;
  onBack: () => void;
}) {
  const [contact, setContact] = React.useState<Record<ContactKey, string>>(() => ({
    headline: parsed.headline ?? "",
    phone: parsed.phone ?? "",
    city: parsed.city ?? "",
    province: parsed.province ?? "",
    country: parsed.country ?? "",
    linkedin_url: parsed.linkedin_url ?? "",
    github_url: parsed.github_url ?? "",
    portfolio_url: parsed.portfolio_url ?? "",
  }));
  const [summary, setSummary] = React.useState(parsed.summary ?? "");
  const [skills, setSkills] = React.useState<string[]>(() => parsed.skills.map((s) => s.name));
  const [exp, setExp] = React.useState<boolean[]>(() => parsed.experiences.map(() => true));
  const [edu, setEdu] = React.useState<boolean[]>(() => parsed.educations.map(() => true));
  const [proj, setProj] = React.useState<boolean[]>(() => parsed.projects.map(() => true));

  const toggle = (setter: React.Dispatch<React.SetStateAction<boolean[]>>, i: number, v: boolean) =>
    setter((prev) => prev.map((x, j) => (j === i ? v : x)));

  const save = () => {
    const byName = new Map(parsed.skills.map((s) => [s.name.toLowerCase(), s] as const));
    const reviewedSkills: SkillIn[] = skills.map((name) => byName.get(name.toLowerCase()) ?? { name });
    const clean = (v: string) => (v.trim() ? v.trim() : null);
    onSave({
      ...parsed,
      headline: clean(contact.headline),
      phone: clean(contact.phone),
      city: clean(contact.city),
      province: clean(contact.province),
      country: clean(contact.country),
      linkedin_url: clean(contact.linkedin_url),
      github_url: clean(contact.github_url),
      portfolio_url: clean(contact.portfolio_url),
      summary: clean(summary),
      skills: reviewedSkills,
      experiences: parsed.experiences.filter((_, i) => exp[i]) as ExperienceIn[],
      educations: parsed.educations.filter((_, i) => edu[i]) as EducationIn[],
      projects: parsed.projects.filter((_, i) => proj[i]) as ProjectIn[],
    });
  };

  const counts = {
    exp: exp.filter(Boolean).length,
    edu: edu.filter(Boolean).length,
    proj: proj.filter(Boolean).length,
  };

  return (
    <div className="space-y-4 animate-rise">
      <Callout tone="success" icon={<Sparkles />} title="We read your resume. Please review what we found.">
        Uncheck anything you don&apos;t want in your profile and fix any details. Nothing is added that isn&apos;t in your
        resume.
      </Callout>

      {parsed.warnings.length > 0 && (
        <Callout tone="warning" title="A few things to double-check">
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {parsed.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}

      <Panel>
        <PanelTitle
          icon={<UserRound />}
          title="Contact & headline"
          description={[parsed.full_name, parsed.email].filter(Boolean).join(" · ") || "Details found in your resume"}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {CONTACT_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} className={f.span ? "sm:col-span-2" : undefined}>
              <Input
                type={f.type ?? "text"}
                autoComplete={f.autoComplete}
                value={contact[f.key]}
                onChange={(e) => setContact((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder="Not found — add if you like"
              />
            </Field>
          ))}
          <Field label="Summary" className="sm:col-span-2">
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A short professional summary" />
          </Field>
        </div>
      </Panel>

      <Panel>
        <PanelTitle
          icon={<Sparkles />}
          title={`Skills (${skills.length})`}
          description="Remove anything that isn't accurate, or add skills we missed."
        />
        <Field label="Skills" hint="Press Enter or comma to add. Backspace removes the last one.">
          <TagInput value={skills} onChange={setSkills} placeholder="Add a skill" />
        </Field>
      </Panel>

      {parsed.experiences.length > 0 && (
        <Panel>
          <PanelTitle icon={<Briefcase />} title="Experience" description={`${counts.exp} of ${parsed.experiences.length} selected`} />
          <ul className="space-y-2.5">
            {parsed.experiences.map((e, i) => {
              const bullets = [...(e.responsibilities ?? []), ...(e.achievements ?? [])];
              return (
                <IncludeRow
                  key={`${e.company}-${e.position}-${i}`}
                  checked={exp[i]}
                  onChange={(v) => toggle(setExp, i, v)}
                  title={e.position || "Role"}
                  subtitle={[e.company, e.location].filter(Boolean).join(", ")}
                  meta={dateRange(e.start_date, e.end_date)}
                >
                  {bullets.length > 0 && (
                    <ul className="list-disc space-y-1 pl-4 text-sm text-muted">
                      {bullets.slice(0, 3).map((b, j) => (
                        <li key={j} className="line-clamp-2">
                          {b}
                        </li>
                      ))}
                      {bullets.length > 3 && <li className="list-none text-caption text-subtle">+{bullets.length - 3} more</li>}
                    </ul>
                  )}
                </IncludeRow>
              );
            })}
          </ul>
        </Panel>
      )}

      {parsed.educations.length > 0 && (
        <Panel>
          <PanelTitle icon={<GraduationCap />} title="Education" description={`${counts.edu} of ${parsed.educations.length} selected`} />
          <ul className="space-y-2.5">
            {parsed.educations.map((e, i) => (
              <IncludeRow
                key={`${e.institution}-${i}`}
                checked={edu[i]}
                onChange={(v) => toggle(setEdu, i, v)}
                title={[e.degree, e.program].filter(Boolean).join(", ") || e.institution}
                subtitle={e.degree || e.program ? e.institution : e.location}
                meta={dateRange(e.start_date, e.end_date)}
              />
            ))}
          </ul>
        </Panel>
      )}

      {parsed.projects.length > 0 && (
        <Panel>
          <PanelTitle icon={<FolderGit2 />} title="Projects" description={`${counts.proj} of ${parsed.projects.length} selected`} />
          <ul className="space-y-2.5">
            {parsed.projects.map((p, i) => (
              <IncludeRow
                key={`${p.name}-${i}`}
                checked={proj[i]}
                onChange={(v) => toggle(setProj, i, v)}
                title={p.name}
                subtitle={(p.technologies ?? []).slice(0, 5).join(", ") || null}
              >
                {p.description && <p className="line-clamp-2 text-sm text-muted">{p.description}</p>}
              </IncludeRow>
            ))}
          </ul>
        </Panel>
      )}

      <StepFooter
        onBack={onBack}
        note={
          <p className="flex items-center gap-2 text-sm text-muted">
            <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
            Existing profile details are kept — we only fill in what&apos;s missing.
          </p>
        }
        primary={
          <>
            <Button variant="ghost" size="lg" onClick={onReplace} disabled={saving} className="w-full sm:w-auto">
              <RotateCcw /> Use a different file
            </Button>
            <ContinueButton onClick={save} loading={saving}>
              {saving ? "Saving to your profile…" : "Save & continue"}
            </ContinueButton>
          </>
        }
      />
    </div>
  );
}
