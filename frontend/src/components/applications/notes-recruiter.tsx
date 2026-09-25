"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, CloudOff, Link2, Loader2, Mail, MessageSquareText, Phone, Plus, UserMinus, UserRoundPlus, Users } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { ApplicationDetail, Recruiter, RecruiterIn } from "@/lib/types";
import { useUpdateApplication } from "@/lib/queries/applications";
import { useCreateRecruiter, useRecruiters } from "@/lib/queries/networking";
import { initials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

// ---------------------------------------------------------------- notes (autosave)
type SaveState = "idle" | "saving" | "saved" | "error";

export function NotesTab({ app }: { app: ApplicationDetail }) {
  const update = useUpdateApplication(app.id);
  const [draft, setDraft] = React.useState(app.notes ?? "");
  const [state, setState] = React.useState<SaveState>("idle");
  const lastSaved = React.useRef(app.notes ?? "");
  const mutateRef = React.useRef(update.mutate);
  React.useEffect(() => {
    mutateRef.current = update.mutate;
  }, [update.mutate]);

  const save = React.useCallback((value: string) => {
    if (value === lastSaved.current) return;
    setState("saving");
    mutateRef.current(
      { notes: value },
      {
        onSuccess: () => {
          lastSaved.current = value;
          setState("saved");
        },
        onError: () => setState("error"),
      },
    );
  }, []);

  React.useEffect(() => {
    if (draft === lastSaved.current) return;
    const t = window.setTimeout(() => save(draft), 900);
    return () => window.clearTimeout(t);
  }, [draft, save]);

  const id = React.useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          Private notes
        </label>
        <span className="inline-flex items-center gap-1.5 text-caption text-subtle" aria-live="polite">
          {state === "saving" && (
            <>
              <Loader2 className="size-3 animate-spin" /> Saving…
            </>
          )}
          {state === "saved" && (
            <>
              <Check className="size-3 text-success" /> Saved
            </>
          )}
          {state === "error" && (
            <span className="inline-flex items-center gap-1.5 text-danger">
              <CloudOff className="size-3" /> Couldn&apos;t save —{" "}
              <button type="button" className="font-medium underline" onClick={() => save(draft)}>
                retry
              </button>
            </span>
          )}
        </span>
      </div>
      <Textarea
        id={id}
        rows={12}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => save(draft)}
        placeholder="Interview impressions, people you spoke with, questions to ask, salary discussions… Only you can see these notes."
        className="min-h-60"
      />
      <p className="text-caption text-subtle">Notes save automatically as you type.</p>
    </div>
  );
}

// ---------------------------------------------------------------- recruiter
const KIND_LABELS: Record<NonNullable<RecruiterIn["kind"]>, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  contact: "Contact",
};

export function ContactCard({ contact, actions }: { contact: Recruiter; actions?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="bg-gradient-brand flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" aria-hidden>
          {initials(contact.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {contact.name}
            <Badge size="xs" tone="info">
              {KIND_LABELS[contact.kind] ?? "Contact"}
            </Badge>
          </p>
          <p className="text-sm text-muted">{[contact.title, contact.company].filter(Boolean).join(" · ") || "No title yet"}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                <Mail className="size-3.5" /> {contact.email}
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 text-muted hover:text-text">
                <Phone className="size-3.5" /> {contact.phone}
              </a>
            )}
            {contact.linkedin_url && (
              <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-muted hover:text-text">
                <Link2 className="size-3.5" /> LinkedIn<span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </div>
          {contact.notes && <p className="mt-2 line-clamp-3 text-sm text-muted">{contact.notes}</p>}
        </div>
      </div>
      {actions && <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">{actions}</div>}
    </div>
  );
}

function QuickCreateContact({ app, onCreated, onCancel }: { app: ApplicationDetail; onCreated: (r: Recruiter) => void; onCancel: () => void }) {
  const create = useCreateRecruiter();
  const [form, setForm] = React.useState<RecruiterIn>({ name: "", title: "", company: app.company_name, kind: "recruiter", email: "", linkedin_url: "" });
  const [error, setError] = React.useState<string | null>(null);
  const set = <K extends keyof RecruiterIn>(k: K, v: RecruiterIn[K]) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <form
      className="space-y-3 rounded-xl border border-primary/25 bg-primary-soft/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name.trim()) return setError("Add the contact's name.");
        setError(null);
        const body: RecruiterIn = {
          ...form,
          name: form.name.trim(),
          title: form.title?.trim() || null,
          company: form.company?.trim() || null,
          email: form.email?.trim() || null,
          linkedin_url: form.linkedin_url?.trim() || null,
        };
        create.mutate(body, { onSuccess: onCreated, onError: (err) => toast.error(errorMessage(err)) });
      }}
    >
      <p className="text-sm font-medium">New contact</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required error={error}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        <Field label="Role">
          <Select value={form.kind} onChange={(e) => set("kind", e.target.value as RecruiterIn["kind"])}>
            {Object.entries(KIND_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title">
          <Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Technical Recruiter" />
        </Field>
        <Field label="Company">
          <Input value={form.company ?? ""} onChange={(e) => set("company", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="LinkedIn URL">
          <Input type="url" value={form.linkedin_url ?? ""} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/…" />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          <UserRoundPlus /> Add & assign
        </Button>
      </div>
    </form>
  );
}

export function RecruiterTab({ app }: { app: ApplicationDetail }) {
  const { data, isLoading, error, refetch } = useRecruiters();
  const update = useUpdateApplication(app.id);
  const [choice, setChoice] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const current = data?.find((r) => r.id === app.recruiter_id) ?? null;
  const selectId = React.useId();

  const assign = (id: number | null, name?: string) =>
    update.mutate(
      { recruiter_id: id },
      {
        onSuccess: () => {
          toast.success(id ? `${name ?? "Contact"} assigned` : "Contact removed");
          setChoice("");
          setCreating(false);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );

  if (isLoading) return <Skeleton className="h-32 rounded-xl" />;
  if (error) return <ErrorState compact error={error} title="We couldn't load your contacts" onRetry={() => refetch()} />;

  const options = (data ?? []).filter((r) => r.id !== app.recruiter_id);
  const sameCompany = options.filter((r) => r.company && r.company.toLowerCase() === app.company_name.toLowerCase());
  const others = options.filter((r) => !sameCompany.includes(r));

  return (
    <div className="space-y-4">
      {current ? (
        <ContactCard
          contact={current}
          actions={
            <>
              <Button asChild size="sm" variant="soft">
                <Link href={`/networking?contact=${current.id}&application=${app.id}`}>
                  <MessageSquareText /> Write a message
                </Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => assign(null)} loading={update.isPending}>
                <UserMinus /> Unassign
              </Button>
            </>
          }
        />
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-border-strong bg-surface-2/60 p-4">
          <Users className="mt-0.5 size-5 shrink-0 text-subtle" aria-hidden />
          <p className="text-sm text-muted">
            No recruiter or hiring manager linked yet. Linking a contact lets Applier draft personalized follow-ups and thank-you notes.
          </p>
        </div>
      )}

      {!creating && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label={current ? "Replace with another contact" : "Assign an existing contact"} className="min-w-0 flex-1" id={selectId}>
            <Select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={!options.length}>
              <option value="">{options.length ? "Choose a contact" : "No other contacts yet"}</option>
              {sameCompany.length > 0 && (
                <optgroup label={`At ${app.company_name}`}>
                  {sameCompany.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.title ? ` — ${r.title}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="Other contacts">
                  {others.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.company ? ` — ${r.company}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={!choice}
              loading={update.isPending && !!choice}
              onClick={() => {
                const r = data?.find((x) => x.id === Number(choice));
                assign(Number(choice), r?.name);
              }}
            >
              Assign
            </Button>
            <Button variant="ghost" onClick={() => setCreating(true)}>
              <Plus /> New contact
            </Button>
          </div>
        </div>
      )}
      {creating && <QuickCreateContact app={app} onCancel={() => setCreating(false)} onCreated={(r) => assign(r.id, r.name)} />}
    </div>
  );
}

