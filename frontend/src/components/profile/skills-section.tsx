"use client";

/** Skills grouped by category, with single add (category/level/years), bulk add and delete. */

import * as React from "react";
import { Layers, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { SKILL_CATEGORY_LABELS } from "@/lib/constants";
import type { Skill, SkillCategory, SkillIn } from "@/lib/types";
import { useBulkAddSkills, useProfileCollection } from "@/lib/queries/profile";
import { cn, titleCase } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { ProfileSection, apiFieldError } from "./shared";

const LEVELS: NonNullable<SkillIn["level"]>[] = ["beginner", "intermediate", "advanced", "expert"];
const CATEGORY_ORDER = Object.keys(SKILL_CATEGORY_LABELS) as SkillCategory[];

function SkillChip({ skill, onDelete, deleting }: { skill: Skill; onDelete: () => void; deleting: boolean }) {
  const detail = [skill.level && titleCase(skill.level), skill.years ? `${skill.years} yr${skill.years === 1 ? "" : "s"}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface py-1 pl-2.5 pr-1 text-sm transition-opacity",
        deleting && "opacity-50",
      )}
    >
      <span className="font-medium">{skill.name}</span>
      {detail && <span className="text-caption text-subtle">{detail}</span>}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="rounded-md p-0.5 text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
        aria-label={`Remove ${skill.name}`}
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

function AddSkillForm() {
  const { create } = useProfileCollection("skills");
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState<SkillCategory | "">("");
  const [level, setLevel] = React.useState<SkillIn["level"] | "">("");
  const [years, setYears] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr("Enter a skill name.");
      return;
    }
    const y = years.trim() ? Number(years) : null;
    if (y !== null && (Number.isNaN(y) || y < 0 || y > 60)) {
      setErr("Years must be between 0 and 60.");
      return;
    }
    setErr(null);
    create.mutate(
      { name: name.trim(), category: category || null, level: level || null, years: y },
      {
        onSuccess: (s) => {
          toast.success(`Added ${s.name}`, {
            description: category ? undefined : `Filed under ${SKILL_CATEGORY_LABELS[s.category] ?? titleCase(s.category)} automatically.`,
          });
          setName("");
          setYears("");
          setLevel("");
        },
        onError: (e2) => setErr(apiFieldError(e2, "name") ?? errorMessage(e2)),
      },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_5.5rem_auto] sm:items-end" noValidate>
      <Field label="Skill" error={err}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PostgreSQL" />
      </Field>
      <Field label="Category">
        <Select value={category} onChange={(e) => setCategory(e.target.value as SkillCategory | "")}>
          <option value="">Auto-detect</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {SKILL_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Level">
        <Select value={level ?? ""} onChange={(e) => setLevel(e.target.value as SkillIn["level"] | "")}>
          <option value="">Not specified</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {titleCase(l)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Years">
        <Input type="number" inputMode="decimal" min={0} max={60} step={0.5} value={years} onChange={(e) => setYears(e.target.value)} />
      </Field>
      <Button type="submit" loading={create.isPending} className={cn(err && "sm:mb-6")}>
        {!create.isPending && <Plus />} Add
      </Button>
    </form>
  );
}

function BulkAdd() {
  const bulk = useBulkAddSkills();
  const [items, setItems] = React.useState<string[]>([]);
  return (
    <div className="space-y-2">
      <Field label="Add several at once" hint="Type or paste skills separated by commas, then press Add all. Duplicates are skipped.">
        <TagInput value={items} onChange={setItems} placeholder="Python, React, Docker…" />
      </Field>
      <Button
        size="sm"
        variant="secondary"
        disabled={!items.length}
        loading={bulk.isPending}
        onClick={() =>
          bulk.mutate(
            items.map((name) => ({ name })),
            {
              onSuccess: (added) => {
                const skipped = items.length - added.length;
                toast.success(`Added ${added.length} ${added.length === 1 ? "skill" : "skills"}`, {
                  description: skipped > 0 ? `${skipped} already in your profile — skipped.` : "Categories were detected automatically.",
                });
                setItems([]);
              },
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      >
        {!bulk.isPending && <Sparkles />} Add all{items.length ? ` (${items.length})` : ""}
      </Button>
    </div>
  );
}

export function SkillsSection({ skills }: { skills: Skill[] }) {
  const { remove } = useProfileCollection("skills");
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const groups: { key: string; label: string; items: Skill[] }[] = CATEGORY_ORDER.map((c) => ({
    key: c,
    label: SKILL_CATEGORY_LABELS[c],
    items: skills.filter((s) => s.category === c).sort((a, b) => a.name.localeCompare(b.name)),
  }));
  const unknown = skills.filter((s) => !CATEGORY_ORDER.includes(s.category));
  if (unknown.length) groups.push({ key: "uncategorized", label: "Uncategorized", items: unknown });
  const nonEmpty = groups.filter((g) => g.items.length > 0);

  const del = (s: Skill) => {
    setDeletingId(s.id);
    remove.mutate(s.id, {
      onSuccess: () => toast.success(`Removed ${s.name}`),
      onError: (e) => toast.error(errorMessage(e)),
      onSettled: () => setDeletingId(null),
    });
  };

  return (
    <ProfileSection
      id="skills"
      icon={<Layers />}
      title="Skills"
      description={`${skills.length} ${skills.length === 1 ? "skill" : "skills"}. Applier only claims skills listed here.`}
    >
      <div className="space-y-6">
        {nonEmpty.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            No skills yet. Skills are the biggest factor in your match scores — add the ones you&apos;d be comfortable discussing in an
            interview.
          </p>
        ) : (
          <div className="space-y-4">
            {nonEmpty.map((g) => (
              <div key={g.key}>
                <p className="mb-2 text-caption font-semibold uppercase tracking-[0.12em] text-subtle">
                  {g.label} <span className="font-normal">({g.items.length})</span>
                </p>
                <ul className="flex flex-wrap gap-2" aria-label={`${g.label} skills`}>
                  {g.items.map((s) => (
                    <SkillChip key={s.id} skill={s} onDelete={() => del(s)} deleting={deletingId === s.id} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-5 rounded-xl border border-border bg-bg-subtle/50 p-4">
          <AddSkillForm />
          <div className="border-t border-border pt-4">
            <BulkAdd />
          </div>
        </div>
      </div>
    </ProfileSection>
  );
}
