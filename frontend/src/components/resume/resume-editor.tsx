"use client";

/** Section editor for structured resume content. Fully controlled: `value` + `onChange`. */

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ResumeContent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { BulletListEditor } from "./bullet-list-editor";

type Exp = ResumeContent["experience"][number];
type Proj = ResumeContent["projects"][number];
type Edu = ResumeContent["education"][number];
type Bullet = { id: string; text: string };

function uid(prefix: string) {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}`;
}

function EditorSection({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

/** Up / down / delete controls for an item in a list section. */
function ItemControls({
  index,
  count,
  name,
  onMove,
  onDelete,
}: {
  index: number;
  count: number;
  name: string;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(-1)}>
        <ArrowUp />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
        <ArrowDown />
      </Button>
      <Button type="button" variant="danger-ghost" size="icon-sm" aria-label={`Delete ${name}`} onClick={onDelete}>
        <Trash2 />
      </Button>
    </div>
  );
}

function moveItem<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const bulletProps = {
  getText: (b: Bullet) => b.text,
  withText: (b: Bullet, text: string) => ({ ...b, text }),
  create: (text: string) => ({ id: uid("b"), text }),
  getKey: (b: Bullet) => b.id,
};

export function ResumeEditor({ value, onChange }: { value: ResumeContent; onChange: (next: ResumeContent) => void }) {
  const set = <K extends keyof ResumeContent>(key: K, v: ResumeContent[K]) => onChange({ ...value, [key]: v });
  const setExp = (i: number, patch: Partial<Exp>) => set("experience", value.experience.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const setProj = (i: number, patch: Partial<Proj>) => set("projects", value.projects.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const setEdu = (i: number, patch: Partial<Edu>) => set("education", value.education.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const c = value.contact;

  return (
    <div className="space-y-5">
      <EditorSection title="Contact & headline">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={c.name} onChange={(e) => set("contact", { ...c, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={c.email ?? ""} onChange={(e) => set("contact", { ...c, email: e.target.value || null })} />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={c.phone ?? ""} onChange={(e) => set("contact", { ...c, phone: e.target.value || null })} />
          </Field>
          <Field label="Location">
            <Input value={c.location ?? ""} onChange={(e) => set("contact", { ...c, location: e.target.value || null })} placeholder="City, Province" />
          </Field>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Links</p>
          {c.links.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                aria-label={`Link ${i + 1} label`}
                value={l.label}
                placeholder="LinkedIn"
                className="w-32 shrink-0 sm:w-40"
                onChange={(e) => set("contact", { ...c, links: c.links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })}
              />
              <Input
                aria-label={`Link ${i + 1} URL`}
                type="url"
                value={l.url}
                placeholder="https://"
                onChange={(e) => set("contact", { ...c, links: c.links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)) })}
              />
              <Button
                type="button"
                variant="danger-ghost"
                size="icon-sm"
                aria-label={`Remove link ${i + 1}`}
                onClick={() => set("contact", { ...c, links: c.links.filter((_, k) => k !== i) })}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="xs" onClick={() => set("contact", { ...c, links: [...c.links, { label: "", url: "" }] })}>
            <Plus /> Add link
          </Button>
        </div>
        <Field label="Headline" hint="One line under your name, e.g. “Junior Software Developer · Python & React”.">
          <Input value={value.headline ?? ""} onChange={(e) => set("headline", e.target.value || null)} />
        </Field>
        <Field label="Summary">
          <Textarea rows={4} value={value.summary ?? ""} onChange={(e) => set("summary", e.target.value || null)} />
        </Field>
      </EditorSection>

      <EditorSection
        title="Skills"
        description="Group skills by category. Press Enter after each skill."
        action={
          <Button type="button" size="xs" variant="soft" onClick={() => set("skills", [...value.skills, { category: "", items: [] }])}>
            <Plus /> Add group
          </Button>
        }
      >
        {value.skills.length === 0 && <p className="text-sm text-muted">No skill groups yet.</p>}
        {value.skills.map((g, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Skill group ${i + 1} name`}
                value={g.category}
                placeholder="e.g. Languages"
                className="h-9"
                onChange={(e) => set("skills", value.skills.map((x, k) => (k === i ? { ...x, category: e.target.value } : x)))}
              />
              <ItemControls
                index={i}
                count={value.skills.length}
                name={`skill group ${g.category || i + 1}`}
                onMove={(d) => set("skills", moveItem(value.skills, i, d))}
                onDelete={() => set("skills", value.skills.filter((_, k) => k !== i))}
              />
            </div>
            <TagInput
              className="mt-2"
              aria-label={`Skills in ${g.category || `group ${i + 1}`}`}
              value={g.items}
              onChange={(items) => set("skills", value.skills.map((x, k) => (k === i ? { ...x, items } : x)))}
              placeholder="Add a skill"
            />
          </div>
        ))}
      </EditorSection>

      <EditorSection
        title="Experience"
        action={
          <Button
            type="button"
            size="xs"
            variant="soft"
            onClick={() =>
              set("experience", [
                ...value.experience,
                { id: uid("exp"), source_id: null, company: "", position: "", location: null, start: null, end: null, bullets: [], technologies: [] },
              ])
            }
          >
            <Plus /> Add role
          </Button>
        }
      >
        {value.experience.length === 0 && <p className="text-sm text-muted">No experience entries.</p>}
        {value.experience.map((e, i) => (
          <div key={e.id} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate pt-1.5 text-sm font-semibold">{e.position || e.company || `Role ${i + 1}`}</p>
              <ItemControls
                index={i}
                count={value.experience.length}
                name={e.position || `role ${i + 1}`}
                onMove={(d) => set("experience", moveItem(value.experience, i, d))}
                onDelete={() => set("experience", value.experience.filter((_, k) => k !== i))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Position">
                <Input value={e.position} onChange={(ev) => setExp(i, { position: ev.target.value })} />
              </Field>
              <Field label="Company">
                <Input value={e.company} onChange={(ev) => setExp(i, { company: ev.target.value })} />
              </Field>
              <Field label="Location">
                <Input value={e.location ?? ""} onChange={(ev) => setExp(i, { location: ev.target.value || null })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start">
                  <Input value={e.start ?? ""} placeholder="Jan 2024" onChange={(ev) => setExp(i, { start: ev.target.value || null })} />
                </Field>
                <Field label="End">
                  <Input value={e.end ?? ""} placeholder="Present" onChange={(ev) => setExp(i, { end: ev.target.value || null })} />
                </Field>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Bullets</p>
              <BulletListEditor<Bullet> items={e.bullets} onChange={(bullets) => setExp(i, { bullets })} label="Bullet" {...bulletProps} />
            </div>
            <Field label="Technologies">
              <TagInput value={e.technologies} onChange={(technologies) => setExp(i, { technologies })} placeholder="Add a technology" />
            </Field>
          </div>
        ))}
      </EditorSection>

      <EditorSection
        title="Projects"
        action={
          <Button
            type="button"
            size="xs"
            variant="soft"
            onClick={() =>
              set("projects", [...value.projects, { id: uid("prj"), source_id: null, name: "", description: null, technologies: [], bullets: [], url: null }])
            }
          >
            <Plus /> Add project
          </Button>
        }
      >
        {value.projects.length === 0 && <p className="text-sm text-muted">No projects.</p>}
        {value.projects.map((p, i) => (
          <div key={p.id} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate pt-1.5 text-sm font-semibold">{p.name || `Project ${i + 1}`}</p>
              <ItemControls
                index={i}
                count={value.projects.length}
                name={p.name || `project ${i + 1}`}
                onMove={(d) => set("projects", moveItem(value.projects, i, d))}
                onDelete={() => set("projects", value.projects.filter((_, k) => k !== i))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input value={p.name} onChange={(ev) => setProj(i, { name: ev.target.value })} />
              </Field>
              <Field label="Link">
                <Input type="url" value={p.url ?? ""} placeholder="https://" onChange={(ev) => setProj(i, { url: ev.target.value || null })} />
              </Field>
            </div>
            <Field label="Description">
              <Textarea rows={2} value={p.description ?? ""} onChange={(ev) => setProj(i, { description: ev.target.value || null })} />
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium">Bullets</p>
              <BulletListEditor<Bullet> items={p.bullets} onChange={(bullets) => setProj(i, { bullets })} label="Project bullet" {...bulletProps} />
            </div>
            <Field label="Technologies">
              <TagInput value={p.technologies} onChange={(technologies) => setProj(i, { technologies })} placeholder="Add a technology" />
            </Field>
          </div>
        ))}
      </EditorSection>

      <EditorSection
        title="Education"
        action={
          <Button
            type="button"
            size="xs"
            variant="soft"
            onClick={() =>
              set("education", [
                ...value.education,
                { id: uid("edu"), institution: "", degree: null, program: null, start: null, end: null, gpa: null, location: null, details: [] },
              ])
            }
          >
            <Plus /> Add education
          </Button>
        }
      >
        {value.education.length === 0 && <p className="text-sm text-muted">No education entries.</p>}
        {value.education.map((ed, i) => (
          <div key={ed.id} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate pt-1.5 text-sm font-semibold">{ed.institution || `Education ${i + 1}`}</p>
              <ItemControls
                index={i}
                count={value.education.length}
                name={ed.institution || `education ${i + 1}`}
                onMove={(d) => set("education", moveItem(value.education, i, d))}
                onDelete={() => set("education", value.education.filter((_, k) => k !== i))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Institution">
                <Input value={ed.institution} onChange={(ev) => setEdu(i, { institution: ev.target.value })} />
              </Field>
              <Field label="Degree">
                <Input value={ed.degree ?? ""} placeholder="Diploma, BSc…" onChange={(ev) => setEdu(i, { degree: ev.target.value || null })} />
              </Field>
              <Field label="Program">
                <Input value={ed.program ?? ""} onChange={(ev) => setEdu(i, { program: ev.target.value || null })} />
              </Field>
              <Field label="Location">
                <Input value={ed.location ?? ""} onChange={(ev) => setEdu(i, { location: ev.target.value || null })} />
              </Field>
              <Field label="Start">
                <Input value={ed.start ?? ""} placeholder="Sep 2022" onChange={(ev) => setEdu(i, { start: ev.target.value || null })} />
              </Field>
              <Field label="End">
                <Input value={ed.end ?? ""} placeholder="Apr 2024" onChange={(ev) => setEdu(i, { end: ev.target.value || null })} />
              </Field>
              <Field label="GPA">
                <Input value={ed.gpa ?? ""} onChange={(ev) => setEdu(i, { gpa: ev.target.value || null })} />
              </Field>
            </div>
            <Field label="Details" hint="Honours, relevant coursework, awards.">
              <TagInput value={ed.details} onChange={(details) => setEdu(i, { details })} placeholder="Add a detail" />
            </Field>
          </div>
        ))}
      </EditorSection>

      <EditorSection title="Certifications">
        <TagInput
          aria-label="Certifications"
          value={value.certifications}
          onChange={(certifications) => set("certifications", certifications)}
          placeholder="e.g. AWS Certified Cloud Practitioner"
        />
      </EditorSection>
    </div>
  );
}
