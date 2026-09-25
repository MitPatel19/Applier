"use client";

import * as React from "react";
import { toast } from "sonner";
import { Braces, Eye, Info, Save, Trash2, TriangleAlert } from "lucide-react";
import { errorMessage } from "@/lib/api";
import {
  useApplicationOptions,
  useCreateTemplate,
  useDeleteTemplate,
  useTemplateRender,
  useUpdateTemplate,
} from "@/lib/queries/templates";
import type { Template, TemplateIn, TemplateKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/primitives";

export const KIND_LABELS: Record<TemplateKind, { plural: string; singular: string }> = {
  cover_letter: { plural: "Cover letters", singular: "Cover letter" },
  question: { plural: "Common questions", singular: "Question answer" },
  follow_up: { plural: "Follow-up messages", singular: "Follow-up message" },
  recruiter_message: { plural: "Recruiter messages", singular: "Recruiter message" },
  thank_you: { plural: "Thank-you emails", singular: "Thank-you email" },
};

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "first_name", label: "First name" },
  { key: "full_name", label: "Full name" },
  { key: "company", label: "Company" },
  { key: "job_title", label: "Job title" },
  { key: "recruiter_name", label: "Recruiter name" },
  { key: "applied_date", label: "Applied date" },
  { key: "my_email", label: "My email" },
  { key: "my_phone", label: "My phone" },
  { key: "top_skills", label: "Top skills" },
];

const TOKEN_RE = /(\{\{\s*[\w.]+\s*\}\})/g;
const tokenName = (t: string) => t.replace(/[{}\s]/g, "");

function hasSubject(kind: TemplateKind) {
  return kind === "follow_up" || kind === "recruiter_message" || kind === "thank_you";
}

/** Renders text with every `{{placeholder}}` highlighted so unresolved values stand out. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(TOKEN_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-warning-soft px-1 font-mono text-[0.85em] text-warning">
            {p}
          </mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}

function placeholdersIn(...texts: (string | null | undefined)[]) {
  const found = new Set<string>();
  for (const t of texts) for (const m of (t ?? "").match(TOKEN_RE) ?? []) found.add(tokenName(m));
  return [...found];
}

function toDraft(t: Template | null, kind: TemplateKind): TemplateIn {
  return t
    ? { kind: t.kind, name: t.name, subject: t.subject ?? "", body: t.body, question: t.question ?? "", is_default: t.is_default }
    : { kind, name: "", subject: "", body: "", question: "", is_default: false };
}

function Preview({ template, draft, dirty }: { template: Template | null; draft: TemplateIn; dirty: boolean }) {
  const apps = useApplicationOptions();
  const [appId, setAppId] = React.useState<number | null>(null);
  const live = !!template && !dirty;
  const render = useTemplateRender(template?.id ?? null, appId, template?.updated_at ?? null, live);

  const subject = live ? render.data?.subject : draft.subject;
  const body = live ? (render.data?.body ?? "") : draft.body;
  const unresolved = live ? (render.data?.unresolved ?? []) : placeholdersIn(draft.subject, draft.body);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2 px-5 py-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="size-4 text-subtle" aria-hidden /> Preview
        </h4>
        <label className="flex min-w-0 items-center gap-2 text-caption text-subtle">
          <span className="shrink-0">Fill with</span>
          <Select
            className="h-8 max-w-[16rem] text-xs"
            value={appId ?? ""}
            onChange={(e) => setAppId(e.target.value ? Number(e.target.value) : null)}
            disabled={!live || apps.isLoading}
          >
            <option value="">Your profile only</option>
            {apps.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="space-y-3 px-5 py-4" aria-live="polite" aria-busy={render.isFetching}>
        {!live && (
          <p className="flex items-center gap-1.5 text-caption text-subtle">
            <Info className="size-3.5" aria-hidden />
            {template ? "Save your changes to preview with real details." : "Save the template to preview with real details."}
          </p>
        )}
        {live && render.isLoading ? (
          <div className="space-y-2" role="status" aria-label="Rendering preview">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        ) : live && render.error ? (
          <Callout tone="warning" icon={<TriangleAlert />}>
            {errorMessage(render.error, "We couldn't render this preview.")}
          </Callout>
        ) : (
          <div className={cn("transition-opacity", render.isFetching && "opacity-60")}>
            {draft.kind === "question" && draft.question && <p className="mb-2 text-sm font-semibold text-text">Q: {draft.question}</p>}
            {subject && (
              <p className="mb-2 text-sm">
                <span className="text-subtle">Subject: </span>
                <span className="font-medium text-text">
                  <Highlighted text={subject} />
                </span>
              </p>
            )}
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-text">
              {body ? <Highlighted text={body} /> : <span className="text-subtle">Your message will appear here.</span>}
            </div>
          </div>
        )}
        {unresolved.length > 0 && (
          <Callout tone="warning" icon={<Braces />} title={live ? "Couldn't fill these placeholders" : "Placeholders in this template"}>
            <span className="font-mono text-xs">{unresolved.map((u) => `{{${u}}}`).join("  ")}</span>
            {live && <span className="mt-1 block">Pick an application or complete your profile to fill them in.</span>}
          </Callout>
        )}
      </div>
    </Card>
  );
}

export function TemplateEditor({
  template,
  defaultKind,
  onSaved,
  onDeleted,
  onDirtyChange,
}: {
  template: Template | null;
  defaultKind: TemplateKind;
  onSaved: (t: Template) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initial = React.useMemo(() => toDraft(template, defaultKind), [template, defaultKind]);
  const [draft, setDraft] = React.useState<TemplateIn>(initial);
  const [touched, setTouched] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const subjectRef = React.useRef<HTMLInputElement>(null);
  const lastFocused = React.useRef<"body" | "subject">("body");
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const del = useDeleteTemplate();

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  React.useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const set = <K extends keyof TemplateIn>(k: K, v: TemplateIn[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const showSubject = hasSubject(draft.kind);
  const unknown = placeholdersIn(draft.subject, draft.body).filter((p) => !PLACEHOLDERS.some((x) => x.key === p));
  const errors = {
    name: touched && !draft.name.trim() ? "Give this template a name." : null,
    body: touched && !draft.body.trim() ? (draft.kind === "question" ? "Write an answer." : "Write the message body.") : null,
    question: touched && draft.kind === "question" && !draft.question?.trim() ? "Enter the question this answers." : null,
  };

  const insert = (key: string) => {
    const token = `{{${key}}}`;
    const target = lastFocused.current === "subject" && showSubject ? subjectRef.current : bodyRef.current;
    const field = target === subjectRef.current ? "subject" : "body";
    const current = (field === "subject" ? draft.subject : draft.body) ?? "";
    const start = target?.selectionStart ?? current.length;
    const end = target?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    set(field, next);
    requestAnimationFrame(() => {
      target?.focus();
      target?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const onSave = () => {
    setTouched(true);
    if (!draft.name.trim() || !draft.body.trim() || (draft.kind === "question" && !draft.question?.trim())) return;
    const body: TemplateIn = {
      ...draft,
      name: draft.name.trim(),
      subject: showSubject ? draft.subject || null : null,
      question: draft.kind === "question" ? draft.question || null : null,
    };
    const handlers = {
      onSuccess: (t: Template) => {
        toast.success(template ? "Template saved" : "Template created");
        onSaved(t);
      },
      onError: (e: unknown) => toast.error(errorMessage(e, "We couldn't save this template.")),
    };
    if (template) {
      const { name, subject, body: text, question, is_default } = body;
      update.mutate({ id: template.id, body: { name, subject, body: text, question, is_default } }, handlers);
    } else create.mutate(body, handlers);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <Field label="Template name" required error={errors.name}>
              <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Friendly follow-up after one week" />
            </Field>
            <Field label="Type" hint={template ? "Type can't be changed after creation." : undefined}>
              <Select value={draft.kind} onChange={(e) => set("kind", e.target.value as TemplateKind)} disabled={!!template}>
                {(Object.keys(KIND_LABELS) as TemplateKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k].singular}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {draft.kind === "question" && (
            <Field label="Question" required error={errors.question} hint="The application question this answer is for.">
              <Input
                value={draft.question ?? ""}
                onChange={(e) => set("question", e.target.value)}
                placeholder="e.g. Why do you want to work at {{company}}?"
              />
            </Field>
          )}

          {showSubject && (
            <Field label="Subject">
              <Input
                ref={subjectRef}
                value={draft.subject ?? ""}
                onChange={(e) => set("subject", e.target.value)}
                onFocus={() => (lastFocused.current = "subject")}
                placeholder="e.g. Following up on my {{job_title}} application"
              />
            </Field>
          )}

          <div className="space-y-2">
            <p id="placeholder-help" className="flex items-center gap-1.5 text-caption text-subtle">
              <Braces className="size-3.5" aria-hidden /> Insert a placeholder at your cursor:
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="placeholder-help">
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(p.key)}
                  className="rounded-md border border-border bg-bg-subtle px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-soft-fg"
                  aria-label={`Insert ${p.label} placeholder`}
                  title={p.label}
                >
                  {`{{${p.key}}}`}
                </button>
              ))}
            </div>
          </div>

          <Field label={draft.kind === "question" ? "Answer" : "Message"} required error={errors.body}>
            <Textarea
              ref={bodyRef}
              rows={10}
              value={draft.body}
              onChange={(e) => set("body", e.target.value)}
              onFocus={() => (lastFocused.current = "body")}
              placeholder={"Hi {{recruiter_name}},\n\nThank you for…"}
              className="font-[inherit]"
            />
          </Field>

          {unknown.length > 0 && (
            <Callout tone="warning" icon={<TriangleAlert />}>
              Unknown placeholder{unknown.length > 1 ? "s" : ""}{" "}
              <span className="font-mono text-xs">{unknown.map((u) => `{{${u}}}`).join(", ")}</span> won&apos;t be filled in.
            </Callout>
          )}

          <div className="border-t border-border">
            <SwitchRow
              label="Use as default"
              description={`Applier uses this template first for ${KIND_LABELS[draft.kind].plural.toLowerCase()}.`}
              checked={!!draft.is_default}
              onCheckedChange={(v) => set("is_default", v)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            {template ? (
              <Button type="button" variant="danger-ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {dirty && template && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(initial)}>
                  Discard
                </Button>
              )}
              <Button type="submit" size="sm" loading={create.isPending || update.isPending} disabled={!!template && !dirty}>
                {!(create.isPending || update.isPending) && <Save />} {template ? "Save template" : "Create template"}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      <Preview template={template} draft={draft} dirty={dirty} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tone="danger"
        title={`Delete “${template?.name ?? "template"}”?`}
        description="This template will be permanently removed. Cover letters and messages you already created from it aren't affected."
        confirmLabel="Delete template"
        loading={del.isPending}
        onConfirm={() =>
          template &&
          del.mutate(template.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              toast.success("Template deleted");
              onDeleted();
            },
            onError: (e) => toast.error(errorMessage(e, "We couldn't delete this template.")),
          })
        }
      />
    </div>
  );
}
