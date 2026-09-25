"use client";

/**
 * Application Questions — every answer is editable and autosaved. Answers that need the user's
 * judgement (salary, sponsorship, legal questions…) stay highlighted until explicitly confirmed.
 */

import * as React from "react";
import { AlertTriangle, CheckCircle2, Plus, Trash2, UserRound, Sparkles, FileText, PenLine } from "lucide-react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/api";
import type { Answer } from "@/lib/types";
import { useCreateAnswer, useDeleteAnswer, useUpdateAnswer } from "@/lib/queries/prepare";
import { cn } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Checkbox, Tooltip } from "@/components/ui/primitives";
import { TagInput } from "@/components/ui/tag-input";
import { CopyButton, SaveIndicator } from "./bits";
import { useAutosave } from "./use-autosave";

const SOURCE_META: Record<Answer["source"], { label: string; tone: BadgeTone; icon: React.ElementType; hint: string }> = {
  profile: { label: "From your profile", tone: "success", icon: UserRound, hint: "Filled from your saved profile." },
  generated: { label: "Generated", tone: "primary", icon: Sparkles, hint: "Drafted by Applier from your profile — please review." },
  template: { label: "Template", tone: "info", icon: FileText, hint: "Filled from one of your saved templates." },
  user: { label: "Edited by you", tone: "neutral", icon: PenLine, hint: "You wrote or edited this answer." },
};

export function isAnswerComplete(a: Answer) {
  return (!a.required || a.answer.trim().length > 0) && (!a.needs_confirmation || a.confirmed);
}

function YesNo({ value, onChange, labelId }: { value: string; onChange: (v: string) => void; labelId: string }) {
  const norm = value.trim().toLowerCase();
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="inline-flex gap-1 rounded-xl border border-border bg-bg-subtle p-1">
      {["Yes", "No"].map((opt) => {
        const active = norm === opt.toLowerCase();
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt)}
            className={cn(
              "h-8 min-w-16 rounded-lg px-4 text-sm font-medium transition-colors",
              active ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function AnswerCard({ answer, applicationId, readOnly }: { answer: Answer; applicationId: number; readOnly?: boolean }) {
  const update = useUpdateAnswer(applicationId);
  const remove = useDeleteAnswer(applicationId);
  const [value, setValue] = React.useState(answer.answer);
  const labelId = React.useId();
  const inputId = React.useId();
  const autosave = useAutosave<string>((v) => update.mutateAsync({ id: answer.id, answer: v }), 800);
  const meta = SOURCE_META[answer.source] ?? SOURCE_META.generated;
  const SourceIcon = meta.icon;
  const empty = answer.required && !value.trim();
  const unconfirmed = answer.needs_confirmation && !answer.confirmed;

  const change = (v: string, immediate = false) => {
    setValue(v);
    autosave.schedule(v, immediate);
  };

  const setConfirmed = (confirmed: boolean) => {
    update.mutate(
      { id: answer.id, confirmed },
      {
        onSuccess: () => confirmed && toast.success("Answer confirmed"),
        onError: (e) => toast.error(errorMessage(e, "We couldn't save your confirmation.")),
      },
    );
  };

  let control: React.ReactNode;
  if (readOnly) {
    control = <p className="whitespace-pre-line rounded-lg bg-bg-subtle px-3 py-2 text-sm text-text">{value || "—"}</p>;
  } else if (answer.field_type === "yes_no") {
    control = <YesNo value={value} onChange={(v) => change(v, true)} labelId={labelId} />;
  } else if (answer.field_type === "select") {
    control = (
      <Select id={inputId} aria-labelledby={labelId} value={value} onChange={(e) => change(e.target.value, true)} aria-invalid={empty || undefined}>
        <option value="">Choose an option…</option>
        {answer.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {value && !answer.options.includes(value) && <option value={value}>{value}</option>}
      </Select>
    );
  } else if (answer.field_type === "textarea") {
    control = (
      <Textarea
        id={inputId}
        aria-labelledby={labelId}
        value={value}
        rows={4}
        onChange={(e) => change(e.target.value)}
        onBlur={() => void autosave.flush()}
        aria-invalid={empty || undefined}
      />
    );
  } else {
    control = (
      <Input
        id={inputId}
        aria-labelledby={labelId}
        type={answer.field_type === "number" ? "number" : "text"}
        inputMode={answer.field_type === "number" ? "decimal" : undefined}
        value={value}
        onChange={(e) => change(e.target.value)}
        onBlur={() => void autosave.flush()}
        aria-invalid={empty || undefined}
      />
    );
  }

  return (
    <li
      className={cn(
        "rounded-xl border p-4 transition-colors",
        unconfirmed ? "border-warning/40 bg-warning-soft/25" : empty ? "border-danger/30" : "border-border bg-surface",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p id={labelId} className="min-w-0 text-sm font-medium leading-snug text-text">
          {answer.question}
          {answer.required && (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          )}
          {answer.required && <span className="sr-only"> (required)</span>}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          <CopyButton text={value} label="Copy answer" successMessage="Answer copied" />
          {!readOnly && !answer.required && (
            <Tooltip content="Remove question">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove question"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(answer.id, {
                    onSuccess: () => toast.success("Question removed"),
                    onError: (e) => toast.error(errorMessage(e)),
                  })
                }
              >
                {!remove.isPending && <Trash2 />}
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone} size="xs" title={meta.hint}>
          <SourceIcon className="size-3" aria-hidden /> {meta.label}
        </Badge>
        {!readOnly && <SaveIndicator status={autosave.status} error={autosave.error} onRetry={() => void autosave.retry()} />}
      </div>

      <div className="mt-3">{control}</div>
      {empty && !readOnly && <p className="mt-1.5 text-caption text-danger">Required — the employer&apos;s form won&apos;t submit without it.</p>}

      {answer.needs_confirmation && !readOnly && (
        <div
          className={cn(
            "mt-3 flex items-start gap-2.5 rounded-lg px-3 py-2.5",
            answer.confirmed ? "bg-success-soft/50" : "bg-warning-soft/60",
          )}
        >
          <Checkbox
            id={`${inputId}-confirm`}
            checked={answer.confirmed}
            disabled={update.isPending}
            onCheckedChange={(c) => setConfirmed(c === true)}
            className="mt-0.5"
          />
          <label htmlFor={`${inputId}-confirm`} className="min-w-0 cursor-pointer text-sm">
            <span className="flex items-center gap-1.5 font-medium text-text">
              {answer.confirmed ? (
                <>
                  <CheckCircle2 className="size-3.5 text-success" aria-hidden /> Confirmed by you
                </>
              ) : (
                <>
                  <AlertTriangle className="size-3.5 text-warning" aria-hidden /> Confirm this answer
                </>
              )}
            </span>
            <span className="mt-0.5 block text-muted">
              {answer.confirmed
                ? "Thanks — Applier will use exactly this answer."
                : "This answer affects eligibility or is personal. Please check it's accurate before applying."}
            </span>
          </label>
        </div>
      )}
    </li>
  );
}

function AddQuestionForm({ applicationId, onDone }: { applicationId: number; onDone: () => void }) {
  const create = useCreateAnswer(applicationId);
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [fieldType, setFieldType] = React.useState<Answer["field_type"]>("text");
  const [options, setOptions] = React.useState<string[]>([]);
  const [required, setRequired] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) {
      setError("Enter the question as it appears on the employer's form.");
      return;
    }
    create.mutate(
      { question: question.trim(), answer, field_type: fieldType, options: fieldType === "select" ? options : [], required },
      {
        onSuccess: () => {
          toast.success("Question added", { description: "It's saved with this application and included in your copy list." });
          onDone();
        },
        onError: (err) => setError((err instanceof ApiError && err.fieldErrors[0]?.message) || errorMessage(err)),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-dashed border-border-strong bg-bg-subtle/50 p-4">
      <Field label="Question" required error={error}>
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Why do you want to work here?" autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Answer type">
          <Select value={fieldType} onChange={(e) => setFieldType(e.target.value as Answer["field_type"])}>
            <option value="text">Short text</option>
            <option value="textarea">Paragraph</option>
            <option value="yes_no">Yes / No</option>
            <option value="number">Number</option>
            <option value="select">Multiple choice</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2.5 pt-7 text-sm">
          <Checkbox checked={required} onCheckedChange={(c) => setRequired(c === true)} /> Required on the form
        </label>
      </div>
      {fieldType === "select" && (
        <Field label="Options" hint="Press Enter after each option.">
          <TagInput value={options} onChange={setOptions} placeholder="Add an option" />
        </Field>
      )}
      {fieldType === "textarea" ? (
        <Field label="Your answer">
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} />
        </Field>
      ) : fieldType !== "select" ? (
        <Field label="Your answer" hint={fieldType === "yes_no" ? "Type Yes or No" : undefined}>
          <Input value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </Field>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={create.isPending}>
          Add question
        </Button>
      </div>
    </form>
  );
}

export function AnswersSection({ answers, applicationId, readOnly }: { answers: Answer[]; applicationId: number; readOnly?: boolean }) {
  const [adding, setAdding] = React.useState(false);
  const sorted = [...answers].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const complete = answers.filter(isAnswerComplete).length;
  const toConfirm = answers.filter((a) => a.needs_confirmation && !a.confirmed).length;
  const copyAll = sorted.map((a) => `${a.question}\n${a.answer}`).join("\n\n");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={complete === answers.length ? "success" : "warning"}>
          {complete}/{answers.length} completed
        </Badge>
        {toConfirm > 0 && !readOnly && (
          <Badge tone="warning">
            <AlertTriangle className="size-3" aria-hidden /> {toConfirm} to confirm
          </Badge>
        )}
        <div className="ml-auto flex gap-1">
          {answers.length > 0 && <CopyButton text={copyAll} label="Copy all" showLabel size="sm" successMessage="All answers copied" />}
        </div>
      </div>

      {answers.length === 0 && !adding && (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          This posting didn&apos;t ask any extra questions. If the employer&apos;s form has one, add it below and we&apos;ll keep it with
          this application.
        </p>
      )}

      <ul className="space-y-3">
        {sorted.map((a) => (
          <AnswerCard key={a.id} answer={a} applicationId={applicationId} readOnly={readOnly} />
        ))}
      </ul>

      {!readOnly &&
        (adding ? (
          <AddQuestionForm applicationId={applicationId} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add a custom question
          </Button>
        ))}
    </div>
  );
}
