"use client";

/** Education, Experience and Projects — cards with add/edit dialogs and delete confirmation. */

import * as React from "react";
import {
  Briefcase,
  ExternalLink,
  FolderGit2,
  GraduationCap,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import type { Education, EducationIn, Experience, ExperienceIn, Project, ProjectIn } from "@/lib/types";
import { useProfileCollection } from "@/lib/queries/profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/primitives";
import { TagInput } from "@/components/ui/tag-input";
import { StringListEditor } from "@/components/resume/bullet-list-editor";
import { ProfileSection, apiFieldError, apiGeneralError, emptyToNull, fromMonth, monthRange, toMonth } from "./shared";

// ------------------------------------------------------------------ shared bits

function ItemCard({
  title,
  subtitle,
  meta,
  onEdit,
  onDelete,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          {meta && <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-subtle">{meta}</p>}
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${title}`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="danger-ghost" size="icon-sm" aria-label={`Delete ${title}`} onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {children}
    </li>
  );
}

function Chips({ items, max = 10 }: { items: string[]; max?: number }) {
  if (!items.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.slice(0, max).map((t) => (
        <Badge key={t} tone="neutral" size="xs">
          {t}
        </Badge>
      ))}
      {items.length > max && <span className="text-caption text-subtle">+{items.length - max} more</span>}
    </div>
  );
}

function DeleteConfirm({
  open,
  onOpenChange,
  what,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  what: string;
  loading: boolean;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      title={`Delete ${what}?`}
      description="It's removed from your profile and won't be used in future resumes or applications. Applications already sent are unaffected."
      confirmLabel="Delete"
      loading={loading}
      onConfirm={onConfirm}
    />
  );
}

function EditorDialog({
  open,
  onOpenChange,
  title,
  formId,
  saving,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  formId: string;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !saving && onOpenChange(o)}
      size="lg"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

function DateRangeFields({
  start,
  end,
  current,
  onStart,
  onEnd,
  onCurrent,
  currentLabel,
  errors,
}: {
  start: string;
  end: string;
  current: boolean;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  onCurrent: (v: boolean) => void;
  currentLabel: string;
  errors: { start?: string | null; end?: string | null };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Start" error={errors.start}>
        <Input type="month" value={start} onChange={(e) => onStart(e.target.value)} />
      </Field>
      <div className="space-y-2">
        <Field label="End" error={errors.end}>
          <Input type="month" value={current ? "" : end} onChange={(e) => onEnd(e.target.value)} disabled={current} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={current} onCheckedChange={(c) => onCurrent(c === true)} /> {currentLabel}
        </label>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ education

function EducationForm({
  initial,
  onDone,
  col,
}: {
  initial: Education | null;
  onDone: () => void;
  col: ReturnType<typeof useProfileCollection<"educations">>;
}) {
  const { create, update } = col;
  const m = initial ? update : create;
  const [v, setV] = React.useState({
    institution: initial?.institution ?? "",
    degree: initial?.degree ?? "",
    program: initial?.program ?? "",
    location: initial?.location ?? "",
    start: toMonth(initial?.start_date),
    end: toMonth(initial?.end_date),
    current: !!initial && !!initial.start_date && !initial.end_date,
    gpa: initial?.gpa ?? "",
    coursework: initial?.coursework ?? [],
  });
  const [err, setErr] = React.useState<Record<string, string>>({});
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const fe = (k: string) => err[k] ?? apiFieldError(m.error, k);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.institution.trim()) errs.institution = "Enter the school or institution.";
    if (v.start && v.end && !v.current && v.end < v.start) errs.end_date = "End date must be after the start date.";
    setErr(errs);
    if (Object.keys(errs).length) return;
    const body: EducationIn = {
      institution: v.institution.trim(),
      degree: emptyToNull(v.degree),
      program: emptyToNull(v.program),
      location: emptyToNull(v.location),
      start_date: fromMonth(v.start),
      end_date: v.current ? null : fromMonth(v.end),
      gpa: emptyToNull(v.gpa),
      coursework: v.coursework,
    };
    const opts = {
      onSuccess: () => {
        toast.success(initial ? "Education updated" : "Education added");
        onDone();
      },
    };
    if (initial) update.mutate({ id: initial.id, body }, opts);
    else create.mutate(body, opts);
  };

  return (
    <form id="education-form" onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Institution" required error={fe("institution")}>
        <Input value={v.institution} onChange={(e) => set("institution", e.target.value)} placeholder="e.g. Seneca Polytechnic" autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Degree / credential" error={fe("degree")}>
          <Input value={v.degree} onChange={(e) => set("degree", e.target.value)} placeholder="e.g. Advanced Diploma" />
        </Field>
        <Field label="Program" error={fe("program")}>
          <Input value={v.program} onChange={(e) => set("program", e.target.value)} placeholder="e.g. Computer Programming" />
        </Field>
        <Field label="Location" error={fe("location")}>
          <Input value={v.location} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label="GPA" hint="Optional" error={fe("gpa")}>
          <Input value={v.gpa} onChange={(e) => set("gpa", e.target.value)} placeholder="e.g. 3.8/4.0" />
        </Field>
      </div>
      <DateRangeFields
        start={v.start}
        end={v.end}
        current={v.current}
        onStart={(x) => set("start", x)}
        onEnd={(x) => set("end", x)}
        onCurrent={(x) => set("current", x)}
        currentLabel="I'm currently studying here"
        errors={{ start: fe("start_date"), end: fe("end_date") }}
      />
      <Field label="Relevant coursework" hint="Press Enter after each course.">
        <TagInput value={v.coursework} onChange={(x) => set("coursework", x)} placeholder="e.g. Data Structures" />
      </Field>
      {apiGeneralError(m.error, ["institution", "degree", "program", "location", "gpa", "start_date", "end_date", "coursework"]) && (
        <Callout tone="danger">{apiGeneralError(m.error, ["institution", "degree", "program", "location", "gpa", "start_date", "end_date", "coursework"])}</Callout>
      )}
    </form>
  );
}

export function EducationSection({ items }: { items: Education[] }) {
  const col = useProfileCollection("educations");
  const { create, update, remove } = col;
  const [editing, setEditing] = React.useState<Education | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<Education | null>(null);
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order || (b.start_date ?? "").localeCompare(a.start_date ?? ""));

  return (
    <ProfileSection
      id="education"
      icon={<GraduationCap />}
      title="Education"
      description="Degrees, diplomas and certificates."
      actions={
        <Button size="sm" variant="soft" onClick={() => {
          create.reset();
          setEditing("new");
        }}>
          <Plus /> Add education
        </Button>
      }
    >
      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No education yet. Many postings require a degree or diploma — adding yours improves your match scores.
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((ed) => (
            <ItemCard
              key={ed.id}
              title={[ed.degree, ed.program].filter(Boolean).join(", ") || ed.institution}
              subtitle={ed.degree || ed.program ? ed.institution : undefined}
              meta={
                <>
                  {monthRange(ed.start_date, ed.end_date) && <span>{monthRange(ed.start_date, ed.end_date)}</span>}
                  {ed.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden /> {ed.location}
                    </span>
                  )}
                  {ed.gpa && <span>GPA {ed.gpa}</span>}
                </>
              }
              onEdit={() => {
                update.reset();
                setEditing(ed);
              }}
              onDelete={() => setDeleting(ed)}
            >
              <Chips items={ed.coursework} />
            </ItemCard>
          ))}
        </ul>
      )}
      <EditorDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Add education" : "Edit education"}
        formId="education-form"
        saving={create.isPending || update.isPending}
      >
        {editing !== null && (
          <EducationForm
            key={editing === "new" ? "new" : editing.id}
            col={col}
            initial={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </EditorDialog>
      <DeleteConfirm
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        what={deleting?.institution ?? "this education"}
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              toast.success("Education removed");
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </ProfileSection>
  );
}

// ------------------------------------------------------------------ experience

function ExperienceForm({
  initial,
  onDone,
  col,
}: {
  initial: Experience | null;
  onDone: () => void;
  col: ReturnType<typeof useProfileCollection<"experiences">>;
}) {
  const { create, update } = col;
  const m = initial ? update : create;
  const [v, setV] = React.useState({
    company: initial?.company ?? "",
    position: initial?.position ?? "",
    location: initial?.location ?? "",
    start: toMonth(initial?.start_date),
    end: toMonth(initial?.end_date),
    current: !!initial && !!initial.start_date && !initial.end_date,
    responsibilities: initial?.responsibilities ?? [],
    achievements: initial?.achievements ?? [],
    metrics: initial?.metrics ?? [],
    technologies: initial?.technologies ?? [],
  });
  const [err, setErr] = React.useState<Record<string, string>>({});
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const fe = (k: string) => err[k] ?? apiFieldError(m.error, k);
  const known = ["company", "position", "location", "start_date", "end_date", "responsibilities", "achievements", "metrics", "technologies"];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.company.trim()) errs.company = "Enter the company name.";
    if (!v.position.trim()) errs.position = "Enter your job title.";
    if (v.start && v.end && !v.current && v.end < v.start) errs.end_date = "End date must be after the start date.";
    setErr(errs);
    if (Object.keys(errs).length) return;
    const clean = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
    const body: ExperienceIn = {
      company: v.company.trim(),
      position: v.position.trim(),
      location: emptyToNull(v.location),
      start_date: fromMonth(v.start),
      end_date: v.current ? null : fromMonth(v.end),
      responsibilities: clean(v.responsibilities),
      achievements: clean(v.achievements),
      metrics: clean(v.metrics),
      technologies: v.technologies,
    };
    const opts = {
      onSuccess: () => {
        toast.success(initial ? "Experience updated" : "Experience added", {
          description: "New tailored resumes will include it. Existing ones are unchanged.",
        });
        onDone();
      },
    };
    if (initial) update.mutate({ id: initial.id, body }, opts);
    else create.mutate(body, opts);
  };

  return (
    <form id="experience-form" onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Position" required error={fe("position")}>
          <Input value={v.position} onChange={(e) => set("position", e.target.value)} placeholder="e.g. Software Developer Intern" autoFocus />
        </Field>
        <Field label="Company" required error={fe("company")}>
          <Input value={v.company} onChange={(e) => set("company", e.target.value)} />
        </Field>
        <Field label="Location" className="sm:col-span-2" error={fe("location")}>
          <Input value={v.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Toronto, ON (Hybrid)" />
        </Field>
      </div>
      <DateRangeFields
        start={v.start}
        end={v.end}
        current={v.current}
        onStart={(x) => set("start", x)}
        onEnd={(x) => set("end", x)}
        onCurrent={(x) => set("current", x)}
        currentLabel="This is my current role"
        errors={{ start: fe("start_date"), end: fe("end_date") }}
      />
      <div>
        <p className="mb-2 text-sm font-medium">Responsibilities</p>
        <StringListEditor items={v.responsibilities} onChange={(x) => set("responsibilities", x)} label="Responsibility" addLabel="Add responsibility" placeholder="What you were responsible for…" />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Achievements</p>
        <StringListEditor items={v.achievements} onChange={(x) => set("achievements", x)} label="Achievement" addLabel="Add achievement" placeholder="Something you accomplished…" />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Metrics</p>
        <p className="mb-2 text-caption text-subtle">Numbers make impact concrete — e.g. “Cut page load time by 40%”.</p>
        <StringListEditor items={v.metrics} onChange={(x) => set("metrics", x)} label="Metric" addLabel="Add metric" placeholder="e.g. Reduced support tickets by 25%" />
      </div>
      <Field label="Technologies" hint="Press Enter after each one." error={fe("technologies")}>
        <TagInput value={v.technologies} onChange={(x) => set("technologies", x)} placeholder="e.g. React" />
      </Field>
      {apiGeneralError(m.error, known) && <Callout tone="danger">{apiGeneralError(m.error, known)}</Callout>}
      <p className="text-caption text-subtle">Tip: press Ctrl/⌘ + Enter in a bullet to add another one below it.</p>
    </form>
  );
}

export function ExperienceSection({ items }: { items: Experience[] }) {
  const col = useProfileCollection("experiences");
  const { create, update, remove } = col;
  const [editing, setEditing] = React.useState<Experience | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<Experience | null>(null);
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order || (b.start_date ?? "9").localeCompare(a.start_date ?? "9"));

  return (
    <ProfileSection
      id="experience"
      icon={<Briefcase />}
      title="Experience"
      description="Jobs, internships, co-ops and volunteer roles. Applier only ever uses what's here."
      actions={
        <Button size="sm" variant="soft" onClick={() => {
          create.reset();
          setEditing("new");
        }}>
          <Plus /> Add experience
        </Button>
      }
    >
      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No experience yet. Include internships, co-ops, freelance and volunteer work — it all counts.
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((x) => {
            const bullets = [...x.achievements, ...x.responsibilities].slice(0, 3);
            return (
              <ItemCard
                key={x.id}
                title={x.position}
                subtitle={x.company}
                meta={
                  <>
                    {monthRange(x.start_date, x.end_date) && <span>{monthRange(x.start_date, x.end_date)}</span>}
                    {x.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden /> {x.location}
                      </span>
                    )}
                    {!x.end_date && x.start_date && (
                      <Badge tone="success" size="xs">
                        Current
                      </Badge>
                    )}
                  </>
                }
                onEdit={() => {
                update.reset();
                setEditing(x);
              }}
                onDelete={() => setDeleting(x)}
              >
                {bullets.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted marker:text-subtle">
                    {bullets.map((b, i) => (
                      <li key={i} className="line-clamp-2">
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                <Chips items={x.technologies} />
              </ItemCard>
            );
          })}
        </ul>
      )}
      <EditorDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Add experience" : "Edit experience"}
        formId="experience-form"
        saving={create.isPending || update.isPending}
      >
        {editing !== null && (
          <ExperienceForm
            key={editing === "new" ? "new" : editing.id}
            col={col}
            initial={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </EditorDialog>
      <DeleteConfirm
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        what={deleting ? `${deleting.position} at ${deleting.company}` : "this experience"}
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              toast.success("Experience removed");
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </ProfileSection>
  );
}

// ------------------------------------------------------------------ projects

function ProjectForm({
  initial,
  onDone,
  col,
}: {
  initial: Project | null;
  onDone: () => void;
  col: ReturnType<typeof useProfileCollection<"projects">>;
}) {
  const { create, update } = col;
  const m = initial ? update : create;
  const [v, setV] = React.useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    technologies: initial?.technologies ?? [],
    responsibilities: initial?.responsibilities ?? [],
    results: initial?.results ?? [],
    github_url: initial?.github_url ?? "",
    demo_url: initial?.demo_url ?? "",
  });
  const [err, setErr] = React.useState<Record<string, string>>({});
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const fe = (k: string) => err[k] ?? apiFieldError(m.error, k);
  const known = Object.keys(v);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) {
      setErr({ name: "Give your project a name." });
      return;
    }
    setErr({});
    const clean = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
    const body: ProjectIn = {
      name: v.name.trim(),
      description: emptyToNull(v.description),
      technologies: v.technologies,
      responsibilities: clean(v.responsibilities),
      results: clean(v.results),
      github_url: emptyToNull(v.github_url),
      demo_url: emptyToNull(v.demo_url),
    };
    const opts = {
      onSuccess: () => {
        toast.success(initial ? "Project updated" : "Project added");
        onDone();
      },
    };
    if (initial) update.mutate({ id: initial.id, body }, opts);
    else create.mutate(body, opts);
  };

  return (
    <form id="project-form" onSubmit={submit} className="space-y-5" noValidate>
      <Field label="Project name" required error={fe("name")}>
        <Input value={v.name} onChange={(e) => set("name", e.target.value)} autoFocus />
      </Field>
      <Field label="Description" error={fe("description")}>
        <Textarea rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="What it does and who it's for" />
      </Field>
      <Field label="Technologies" hint="Press Enter after each one." error={fe("technologies")}>
        <TagInput value={v.technologies} onChange={(x) => set("technologies", x)} placeholder="e.g. Next.js" />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium">What you built</p>
        <StringListEditor items={v.responsibilities} onChange={(x) => set("responsibilities", x)} label="Contribution" addLabel="Add contribution" />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Results</p>
        <StringListEditor items={v.results} onChange={(x) => set("results", x)} label="Result" addLabel="Add result" placeholder="e.g. 500+ monthly users" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="GitHub URL" error={fe("github_url")}>
          <Input type="url" value={v.github_url} onChange={(e) => set("github_url", e.target.value)} placeholder="https://github.com/…" />
        </Field>
        <Field label="Live demo URL" error={fe("demo_url")}>
          <Input type="url" value={v.demo_url} onChange={(e) => set("demo_url", e.target.value)} placeholder="https://" />
        </Field>
      </div>
      {apiGeneralError(m.error, known) && <Callout tone="danger">{apiGeneralError(m.error, known)}</Callout>}
    </form>
  );
}

export function ProjectsSection({ items }: { items: Project[] }) {
  const col = useProfileCollection("projects");
  const { create, update, remove } = col;
  const [editing, setEditing] = React.useState<Project | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<Project | null>(null);
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  return (
    <ProfileSection
      id="projects"
      icon={<FolderGit2 />}
      title="Projects"
      description="Personal, school or open-source work that shows what you can do."
      actions={
        <Button size="sm" variant="soft" onClick={() => {
          create.reset();
          setEditing("new");
        }}>
          <Plus /> Add project
        </Button>
      }
    >
      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          No projects yet. For early-career roles, projects are often the strongest proof of your skills.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {sorted.map((p) => (
            <ItemCard
              key={p.id}
              title={p.name}
              subtitle={p.description ? <span className="line-clamp-2">{p.description}</span> : undefined}
              meta={
                <>
                  {p.github_url && (
                    <a href={p.github_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="size-3" aria-hidden /> GitHub
                    </a>
                  )}
                  {p.demo_url && (
                    <a href={p.demo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <ExternalLink className="size-3" aria-hidden /> Demo
                    </a>
                  )}
                </>
              }
              onEdit={() => {
                update.reset();
                setEditing(p);
              }}
              onDelete={() => setDeleting(p)}
            >
              <Chips items={p.technologies} max={6} />
            </ItemCard>
          ))}
        </ul>
      )}
      <EditorDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Add project" : "Edit project"}
        formId="project-form"
        saving={create.isPending || update.isPending}
      >
        {editing !== null && (
          <ProjectForm
            key={editing === "new" ? "new" : editing.id}
            col={col}
            initial={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </EditorDialog>
      <DeleteConfirm
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        what={deleting?.name ?? "this project"}
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              toast.success("Project removed");
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </ProfileSection>
  );
}
