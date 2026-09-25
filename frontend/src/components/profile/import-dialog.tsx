"use client";

/**
 * "Import from resume": pick a resume → review what we read (include/exclude each item) →
 * POST /profile/import. Nothing is written until the user presses Import.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, FileText, FileUp, Star } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import type { ParsedResume } from "@/lib/types";
import { useImportProfile } from "@/lib/queries/profile";
import { useParsedResume, useResumes } from "@/lib/queries/resumes";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Callout, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Checkbox, SwitchRow } from "@/components/ui/primitives";

type PersonalKey =
  | "full_name"
  | "email"
  | "phone"
  | "city"
  | "province"
  | "country"
  | "linkedin_url"
  | "github_url"
  | "portfolio_url"
  | "headline"
  | "summary";

const PERSONAL: { key: PersonalKey; label: string }[] = [
  { key: "full_name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  { key: "province", label: "Province / State" },
  { key: "country", label: "Country" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "github_url", label: "GitHub" },
  { key: "portfolio_url", label: "Portfolio" },
  { key: "headline", label: "Headline" },
  { key: "summary", label: "Summary" },
];

type ListKey = "skills" | "experiences" | "educations" | "projects";

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <li className={cn("flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-bg-subtle", !checked && "opacity-60")}>
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(c === true)} className="mt-0.5" />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
        {children}
      </label>
    </li>
  );
}

function GroupHeader({ title, count, total, onAll }: { title: string; count: number; total: number; onAll: (v: boolean) => void }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <p className="text-sm font-semibold">
        {title} <span className="font-normal text-subtle">({count}/{total} selected)</span>
      </p>
      <button type="button" className="text-caption font-medium text-primary hover:underline" onClick={() => onAll(count < total)}>
        {count < total ? "Select all" : "Select none"}
      </button>
    </div>
  );
}

function Review({ parsed, onBack, onDone }: { parsed: ParsedResume; onBack: () => void; onDone: () => void }) {
  const importProfile = useImportProfile();
  const presentPersonal = PERSONAL.filter((p) => {
    return (parsed[p.key] ?? "").trim() !== "";
  });
  const [personal, setPersonal] = React.useState<Set<string>>(() => new Set(presentPersonal.map((p) => p.key)));
  const [sel, setSel] = React.useState<Record<ListKey, Set<number>>>(() => ({
    skills: new Set(parsed.skills.map((_, i) => i)),
    experiences: new Set(parsed.experiences.map((_, i) => i)),
    educations: new Set(parsed.educations.map((_, i) => i)),
    projects: new Set(parsed.projects.map((_, i) => i)),
  }));
  const [overwrite, setOverwrite] = React.useState(false);

  const toggle = (k: ListKey, i: number, v: boolean) =>
    setSel((prev) => {
      const next = new Set(prev[k]);
      if (v) next.add(i);
      else next.delete(i);
      return { ...prev, [k]: next };
    });
  const all = (k: ListKey, v: boolean) =>
    setSel((prev) => ({ ...prev, [k]: v ? new Set(parsed[k].map((_, i) => i)) : new Set<number>() }));

  const total =
    personal.size + sel.skills.size + sel.experiences.size + sel.educations.size + sel.projects.size;

  const submit = () => {
    const filtered: ParsedResume = {
      ...parsed,
      skills: parsed.skills.filter((_, i) => sel.skills.has(i)),
      experiences: parsed.experiences.filter((_, i) => sel.experiences.has(i)),
      educations: parsed.educations.filter((_, i) => sel.educations.has(i)),
      projects: parsed.projects.filter((_, i) => sel.projects.has(i)),
    };
    for (const p of PERSONAL) {
      if (!personal.has(p.key)) filtered[p.key] = null;
    }
    importProfile.mutate(
      { parsed: filtered, overwrite_personal: overwrite },
      {
        onSuccess: () => {
          toast.success("Profile updated from your resume", {
            description: `${total} ${total === 1 ? "item" : "items"} imported. Review each section and fill any gaps.`,
          });
          onDone();
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="-mt-1 flex items-center gap-1 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Choose a different resume
      </button>

      {parsed.warnings.length > 0 && (
        <Callout tone="warning" title="Double-check these">
          <ul className="list-disc space-y-0.5 pl-4">
            {parsed.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}

      {presentPersonal.length > 0 && (
        <section>
          <GroupHeader
            title="Personal & summary"
            count={personal.size}
            total={presentPersonal.length}
            onAll={(v) => setPersonal(v ? new Set(presentPersonal.map((p) => p.key)) : new Set())}
          />
          <ul>
            {presentPersonal.map((p) => (
              <CheckRow
                key={p.key}
                checked={personal.has(p.key)}
                onChange={(v) =>
                  setPersonal((prev) => {
                    const n = new Set(prev);
                    if (v) n.add(p.key);
                    else n.delete(p.key);
                    return n;
                  })
                }
              >
                <span className="text-caption text-subtle">{p.label}</span>
                <span className="block break-words text-text">{String(parsed[p.key])}</span>
              </CheckRow>
            ))}
          </ul>
          <div className="mt-1 rounded-lg border border-border px-3">
            <SwitchRow
              label="Replace details I've already filled in"
              description="Off: only empty fields in your profile are filled."
              checked={overwrite}
              onCheckedChange={setOverwrite}
            />
          </div>
        </section>
      )}

      {parsed.skills.length > 0 && (
        <section>
          <GroupHeader title="Skills" count={sel.skills.size} total={parsed.skills.length} onAll={(v) => all("skills", v)} />
          <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Skills to import">
            {parsed.skills.map((s, i) => {
              const on = sel.skills.has(i);
              return (
                <button
                  key={`${s.name}-${i}`}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle("skills", i, !on)}
                  className={cn(
                    "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
                    on ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border text-subtle line-through",
                  )}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {parsed.experiences.length > 0 && (
        <section>
          <GroupHeader title="Experience" count={sel.experiences.size} total={parsed.experiences.length} onAll={(v) => all("experiences", v)} />
          <ul>
            {parsed.experiences.map((x, i) => (
              <CheckRow key={i} checked={sel.experiences.has(i)} onChange={(v) => toggle("experiences", i, v)}>
                <span className="font-medium text-text">
                  {x.position} · {x.company}
                </span>
                <span className="block text-caption text-subtle">
                  {[x.start_date, x.end_date ?? (x.start_date ? "Present" : null)].filter(Boolean).join(" – ")}
                  {(x.responsibilities?.length ?? 0) + (x.achievements?.length ?? 0) > 0 &&
                    ` · ${(x.responsibilities?.length ?? 0) + (x.achievements?.length ?? 0)} bullets`}
                </span>
              </CheckRow>
            ))}
          </ul>
        </section>
      )}

      {parsed.educations.length > 0 && (
        <section>
          <GroupHeader title="Education" count={sel.educations.size} total={parsed.educations.length} onAll={(v) => all("educations", v)} />
          <ul>
            {parsed.educations.map((ed, i) => (
              <CheckRow key={i} checked={sel.educations.has(i)} onChange={(v) => toggle("educations", i, v)}>
                <span className="font-medium text-text">{[ed.degree, ed.program].filter(Boolean).join(", ") || ed.institution}</span>
                <span className="block text-caption text-subtle">{ed.institution}</span>
              </CheckRow>
            ))}
          </ul>
        </section>
      )}

      {parsed.projects.length > 0 && (
        <section>
          <GroupHeader title="Projects" count={sel.projects.size} total={parsed.projects.length} onAll={(v) => all("projects", v)} />
          <ul>
            {parsed.projects.map((p, i) => (
              <CheckRow key={i} checked={sel.projects.has(i)} onChange={(v) => toggle("projects", i, v)}>
                <span className="font-medium text-text">{p.name}</span>
                {p.description && <span className="block line-clamp-1 text-caption text-subtle">{p.description}</span>}
              </CheckRow>
            ))}
          </ul>
        </section>
      )}

      {importProfile.isError && (
        <Callout tone="danger" title="Import failed">
          {errorMessage(importProfile.error)} Your profile wasn&apos;t changed.
        </Callout>
      )}

      <div className="sticky bottom-0 -mx-6 -mb-5 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
        <p className="mr-auto text-sm text-muted" aria-live="polite">
          {total} {total === 1 ? "item" : "items"} selected
        </p>
        <Button onClick={submit} disabled={total === 0} loading={importProfile.isPending}>
          Import {total > 0 ? total : ""} {total === 1 ? "item" : "items"}
        </Button>
      </div>
    </div>
  );
}

function ParsedLoader({ resumeId, onBack, onDone }: { resumeId: number; onBack: () => void; onDone: () => void }) {
  const { data, isLoading, error, refetch } = useParsedResume(resumeId);
  if (isLoading)
    return (
      <div className="space-y-3" role="status" aria-label="Reading resume">
        <p className="text-sm text-muted">Reading your resume…</p>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  if (error || !data) return <ErrorState compact error={error} title="We couldn't read this resume" onRetry={() => refetch()} onContinue={onBack} continueLabel="Pick another" />;
  return <Review key={resumeId} parsed={data} onBack={onBack} onDone={onDone} />;
}

export function ImportFromResumeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const resumes = useResumes();
  const [picked, setPicked] = React.useState<number | null>(null);
  const withContent = (resumes.data ?? []).filter((r) => r.status !== "archived");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPicked(null);
      }}
      size="lg"
      title="Import from resume"
      description={picked ? "Review what we found. Uncheck anything that's wrong or you don't want in your profile." : "Choose a resume to read. Nothing changes until you review and import."}
    >
      {picked ? (
        <ParsedLoader
          resumeId={picked}
          onBack={() => setPicked(null)}
          onDone={() => {
            onOpenChange(false);
            setPicked(null);
          }}
        />
      ) : resumes.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : resumes.error ? (
        <ErrorState compact error={resumes.error} onRetry={() => resumes.refetch()} />
      ) : withContent.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <FileUp className="mx-auto size-6 text-subtle" aria-hidden />
          <p className="mt-2 text-sm text-muted">Upload a resume first — then come back to import it.</p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/resumes">Go to Resume Center</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Your resumes">
          {withContent.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setPicked(r.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary-soft/20"
              >
                <FileText className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block truncate text-caption text-subtle">
                    {r.file_name ?? "Built from profile"} · {r.skills_count} skills
                  </span>
                </span>
                {r.is_default && (
                  <Badge tone="primary" size="xs">
                    <Star className="size-3 fill-current" aria-hidden /> Default
                  </Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
