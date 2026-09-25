"use client";

import * as React from "react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/api";
import type { Recruiter, RecruiterIn } from "@/lib/types";
import { useCreateRecruiter, useUpdateRecruiter } from "@/lib/queries/networking";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { dateInputToIso, toDateInputValue } from "@/components/interviews/time";

export type ContactKind = NonNullable<RecruiterIn["kind"]>;

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  contact: "Contact",
};

interface FormState {
  name: string;
  title: string;
  company: string;
  kind: ContactKind;
  linkedin_url: string;
  email: string;
  phone: string;
  notes: string;
  last_contact: string;
  next_follow_up: string;
}

function toForm(c?: Recruiter | null, defaults?: Partial<RecruiterIn>): FormState {
  return {
    name: c?.name ?? defaults?.name ?? "",
    title: c?.title ?? defaults?.title ?? "",
    company: c?.company ?? defaults?.company ?? "",
    kind: c?.kind ?? defaults?.kind ?? "recruiter",
    linkedin_url: c?.linkedin_url ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    notes: c?.notes ?? "",
    last_contact: toDateInputValue(c?.last_contact_at),
    next_follow_up: toDateInputValue(c?.next_follow_up_at),
  };
}

type Errors = Partial<Record<keyof FormState, string>>;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = "Add a name.";
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "That email doesn't look right.";
  if (f.linkedin_url && !/^https?:\/\//i.test(f.linkedin_url.trim())) e.linkedin_url = "Use the full profile link (https://…).";
  return e;
}

export function ContactDialog({
  open,
  onOpenChange,
  contact,
  defaults,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Recruiter | null;
  defaults?: Partial<RecruiterIn>;
  onSaved?: (r: Recruiter) => void;
}) {
  const formId = React.useId();
  const create = useCreateRecruiter();
  const update = useUpdateRecruiter();
  const saving = create.isPending || update.isPending;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={contact ? `Edit ${contact.name}` : "Add contact"}
      description="Recruiters, hiring managers and people in your network. Only you can see this."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {contact ? "Save changes" : "Add contact"}
          </Button>
        </>
      }
    >
      {open && (
        <ContactForm
          formId={formId}
          contact={contact}
          defaults={defaults}
          onSubmit={(body) => {
            const opts = {
              onSuccess: (r: Recruiter) => {
                toast.success(contact ? "Contact updated" : `${r.name} added`);
                onOpenChange(false);
                onSaved?.(r);
              },
              onError: (err: unknown) => toast.error("Couldn't save the contact", { description: errorMessage(err) }),
            };
            if (contact) update.mutate({ id: contact.id, body }, opts);
            else create.mutate(body, opts);
          }}
          serverErrors={(create.error ?? update.error) instanceof ApiError ? ((create.error ?? update.error) as ApiError).fieldErrors : []}
        />
      )}
    </Dialog>
  );
}

function ContactForm({
  formId,
  contact,
  defaults,
  onSubmit,
  serverErrors,
}: {
  formId: string;
  contact?: Recruiter | null;
  defaults?: Partial<RecruiterIn>;
  onSubmit: (body: RecruiterIn) => void;
  serverErrors: { field: string; message: string }[];
}) {
  const [form, setForm] = React.useState<FormState>(() => toForm(contact, defaults));
  const [errors, setErrors] = React.useState<Errors>({});
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const serverError = (k: string) => serverErrors.find((e) => e.field.endsWith(k))?.message;

  return (
    <form
      id={formId}
      noValidate
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const errs = validate(form);
        setErrors(errs);
        if (Object.keys(errs).length) return;
        const t = (v: string) => v.trim() || null;
        onSubmit({
          name: form.name.trim(),
          title: t(form.title),
          company: t(form.company),
          kind: form.kind,
          linkedin_url: t(form.linkedin_url),
          email: t(form.email),
          phone: t(form.phone),
          notes: t(form.notes),
          last_contact_at: dateInputToIso(form.last_contact, 12),
          next_follow_up_at: dateInputToIso(form.next_follow_up, 9),
        });
      }}
    >
      <Field label="Name" required error={errors.name ?? serverError("name")}>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus autoComplete="off" />
      </Field>
      <Field label="Type">
        <Select value={form.kind} onChange={(e) => set("kind", e.target.value as ContactKind)}>
          {(Object.keys(CONTACT_KIND_LABELS) as ContactKind[]).map((k) => (
            <option key={k} value={k}>
              {CONTACT_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title">
        <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Senior Technical Recruiter" />
      </Field>
      <Field label="Company">
        <Input value={form.company} onChange={(e) => set("company", e.target.value)} />
      </Field>
      <Field label="Email" error={errors.email ?? serverError("email")}>
        <Input type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
      </Field>
      <Field label="Phone">
        <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="off" />
      </Field>
      <Field label="LinkedIn URL" className="sm:col-span-2" error={errors.linkedin_url ?? serverError("linkedin_url")}>
        <Input type="url" value={form.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://www.linkedin.com/in/…" />
      </Field>
      <Field label="Last contacted">
        <Input type="date" value={form.last_contact} onChange={(e) => set("last_contact", e.target.value)} />
      </Field>
      <Field label="Next follow-up" hint="You'll see a reminder on the dashboard.">
        <Input type="date" value={form.next_follow_up} onChange={(e) => set("next_follow_up", e.target.value)} />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="How you met, what you talked about, shared interests…" />
      </Field>
    </form>
  );
}
