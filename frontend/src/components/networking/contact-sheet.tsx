"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellPlus, CalendarCheck, Link2, Mail, Pencil, Phone, Save, Sparkles } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { NetworkingPurpose, Recruiter } from "@/lib/types";
import { useApplications } from "@/lib/queries/applications";
import { useFollowUps } from "@/lib/queries/followups";
import { useGenerateRecruiterMessage, useUpdateRecruiter } from "@/lib/queries/networking";
import { cn, formatDate, initials, parseDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/card";
import { FollowUpCard, TemplateStarter } from "@/components/applications/follow-ups";
import { addDays, dateInputToIso, dayLabel, toDateInputValue, useNow } from "@/components/interviews/time";
import { CONTACT_KIND_LABELS } from "./contact-dialog";
import { MessageEditor } from "./message-editor";

export const PURPOSE_LABELS: Record<NetworkingPurpose, string> = {
  introduction: "Introduction",
  follow_up: "Follow-up",
  thank_you: "Thank-you",
  referral_request: "Referral request",
  informational_interview: "Informational interview",
};

const PURPOSE_HINTS: Record<NetworkingPurpose, string> = {
  introduction: "Introduce yourself and why you're reaching out.",
  follow_up: "A polite check-in on an application or conversation.",
  thank_you: "Thank them after an interview or a helpful chat.",
  referral_request: "Ask — respectfully — if they'd refer you for a role.",
  informational_interview: "Request 15–20 minutes to learn about their work.",
};

function MessageGenerator({ contact, defaultApplicationId }: { contact: Recruiter; defaultApplicationId?: number | null }) {
  const generate = useGenerateRecruiterMessage(contact.id);
  const apps = useApplications();
  const [purpose, setPurpose] = React.useState<NetworkingPurpose>(defaultApplicationId ? "follow_up" : "introduction");
  const [applicationId, setApplicationId] = React.useState(defaultApplicationId ? String(defaultApplicationId) : "");
  const [extra, setExtra] = React.useState("");
  const [draft, setDraft] = React.useState<{ subject: string; body: string; by: "template" | "ai" | null } | null>(null);

  const appOptions = React.useMemo(() => {
    const list = apps.data ?? [];
    const company = contact.company?.toLowerCase();
    const same = list.filter((a) => company && a.company_name.toLowerCase() === company);
    const other = list.filter((a) => !same.includes(a));
    return { same, other };
  }, [apps.data, contact.company]);

  return (
    <section aria-labelledby="gen-heading" className="space-y-3">
      <Eyebrow id="gen-heading">Write a message</Eyebrow>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          generate.mutate(
            { purpose, application_id: applicationId ? Number(applicationId) : null, extra_context: extra.trim() || null },
            {
              onSuccess: (g) => setDraft({ subject: g.subject ?? "", body: g.body, by: g.generated_by }),
              onError: (err) => toast.error("Couldn't draft a message", { description: errorMessage(err) }),
            },
          );
        }}
      >
        <Field label="Purpose" hint={PURPOSE_HINTS[purpose]}>
          <Select value={purpose} onChange={(e) => setPurpose(e.target.value as NetworkingPurpose)}>
            {(Object.keys(PURPOSE_LABELS) as NetworkingPurpose[]).map((p) => (
              <option key={p} value={p}>
                {PURPOSE_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Related application (optional)">
          <Select value={applicationId} onChange={(e) => setApplicationId(e.target.value)} disabled={apps.isLoading}>
            <option value="">None</option>
            {appOptions.same.length > 0 && (
              <optgroup label={`At ${contact.company}`}>
                {appOptions.same.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.job_title}
                  </option>
                ))}
              </optgroup>
            )}
            {appOptions.other.length > 0 && (
              <optgroup label="Other applications">
                {appOptions.other.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.company_name} — {a.job_title}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
        <Field label="Extra context (optional)" hint={`${extra.length}/1000`}>
          <Textarea
            rows={2}
            maxLength={1000}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="e.g. We met at the Toronto Tech Meetup; they mentioned the team is hiring for Q4."
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={generate.isPending}>
            <Sparkles /> {draft ? "Regenerate" : "Generate message"}
          </Button>
          <TemplateStarter
            kinds={["recruiter_message", "thank_you"]}
            recruiterId={contact.id}
            applicationId={applicationId ? Number(applicationId) : null}
            onApply={(subject, body) => setDraft({ subject, body, by: "template" })}
          />
        </div>
      </form>
      {draft && (
        <MessageEditor
          subject={draft.subject}
          body={draft.body}
          onSubjectChange={(v) => setDraft((d) => (d ? { ...d, subject: v } : d))}
          onBodyChange={(v) => setDraft((d) => (d ? { ...d, body: v } : d))}
          generatedBy={draft.by}
          email={contact.email}
        />
      )}
    </section>
  );
}

function NotesEditor({ contact }: { contact: Recruiter }) {
  const update = useUpdateRecruiter();
  const [notes, setNotes] = React.useState(contact.notes ?? "");
  const dirty = notes !== (contact.notes ?? "");
  const id = React.useId();
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-caption font-semibold uppercase tracking-[0.12em] text-subtle">
          Notes
        </label>
        {dirty && (
          <Button
            size="xs"
            variant="soft"
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                { id: contact.id, body: { notes: notes.trim() || null } },
                { onSuccess: () => toast.success("Notes saved"), onError: (err) => toast.error(errorMessage(err)) },
              )
            }
          >
            <Save /> Save notes
          </Button>
        )}
      </div>
      <Textarea id={id} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Conversation notes, interests, what they're hiring for…" />
    </section>
  );
}

function FollowUpScheduler({ contact }: { contact: Recruiter }) {
  const now = useNow();
  const update = useUpdateRecruiter();
  const followUps = useFollowUps({ recruiter_id: contact.id, status: "pending" });
  const [date, setDate] = React.useState(() => toDateInputValue(contact.next_follow_up_at) || toDateInputValue(addDays(new Date(now), 7)));
  const next = parseDate(contact.next_follow_up_at);
  const overdue = next ? next.getTime() < now : false;
  return (
    <section className="space-y-3">
      <Eyebrow>Follow-up</Eyebrow>
      {next ? (
        <p className={cn("text-sm", overdue ? "font-medium text-danger" : "text-muted")}>
          {overdue ? "Overdue — " : "Next follow-up: "}
          {dayLabel(next, now)}
        </p>
      ) : (
        <p className="text-sm text-muted">No follow-up planned. Staying in touch every few weeks keeps the relationship warm.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Remind me on" className="min-w-0 flex-1">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Button
          variant="secondary"
          loading={update.isPending}
          onClick={() =>
            update.mutate(
              { id: contact.id, body: { next_follow_up_at: dateInputToIso(date) } },
              { onSuccess: () => toast.success("Follow-up reminder set"), onError: (err) => toast.error(errorMessage(err)) },
            )
          }
        >
          <BellPlus /> Set reminder
        </Button>
        {next && (
          <Button
            variant="ghost"
            onClick={() =>
              update.mutate(
                { id: contact.id, body: { next_follow_up_at: null, last_contact_at: new Date(now).toISOString() } },
                { onSuccess: () => toast.success("Marked as contacted"), onError: (err) => toast.error(errorMessage(err)) },
              )
            }
          >
            <CalendarCheck /> Done
          </Button>
        )}
      </div>
      {(followUps.data ?? []).length > 0 && (
        <div className="space-y-2">
          {(followUps.data ?? []).map((f) => (
            <FollowUpCard key={f.id} followUp={f} email={contact.email} compact />
          ))}
        </div>
      )}
    </section>
  );
}

export function ContactSheet({
  contact,
  open,
  onOpenChange,
  onEdit,
  defaultApplicationId,
}: {
  contact: Recruiter | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEdit: (c: Recruiter) => void;
  defaultApplicationId?: number | null;
}) {
  const now = useNow();
  const update = useUpdateRecruiter();
  if (!contact) return null;
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-3">
          <span className="bg-gradient-brand flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" aria-hidden>
            {initials(contact.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate">{contact.name}</span>
            <span className="block truncate text-sm font-normal text-muted">
              {[contact.title, contact.company].filter(Boolean).join(" · ") || CONTACT_KIND_LABELS[contact.kind]}
            </span>
          </span>
        </span>
      }
      description={undefined}
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info" size="xs">
              {CONTACT_KIND_LABELS[contact.kind]}
            </Badge>
            {contact.applications_count > 0 && (
              <Badge tone="neutral" size="xs">
                Linked to {contact.applications_count} {contact.applications_count === 1 ? "application" : "applications"}
              </Badge>
            )}
            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => onEdit(contact)}>
              <Pencil /> Edit
            </Button>
          </div>
          <dl className="grid gap-2 text-sm">
            {contact.email && (
              <div className="flex items-center gap-2">
                <dt className="sr-only">Email</dt>
                <Mail className="size-4 text-subtle" aria-hidden />
                <dd>
                  <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                    {contact.email}
                  </a>
                </dd>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2">
                <dt className="sr-only">Phone</dt>
                <Phone className="size-4 text-subtle" aria-hidden />
                <dd>
                  <a href={`tel:${contact.phone}`} className="hover:underline">
                    {contact.phone}
                  </a>
                </dd>
              </div>
            )}
            {contact.linkedin_url && (
              <div className="flex items-center gap-2">
                <dt className="sr-only">LinkedIn</dt>
                <Link2 className="size-4 text-subtle" aria-hidden />
                <dd>
                  <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    LinkedIn profile<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </dd>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted">
              <dt className="sr-only">Last contacted</dt>
              <CalendarCheck className="size-4 text-subtle" aria-hidden />
              <dd className="flex flex-wrap items-center gap-2">
                {contact.last_contact_at ? `Last contacted ${formatDate(contact.last_contact_at)}` : "Not contacted yet"}
                <button
                  type="button"
                  className="text-caption font-medium text-primary hover:underline"
                  onClick={() =>
                    update.mutate(
                      { id: contact.id, body: { last_contact_at: new Date(now).toISOString() } },
                      { onSuccess: () => toast.success("Logged contact for today"), onError: (err) => toast.error(errorMessage(err)) },
                    )
                  }
                >
                  Log contact today
                </button>
              </dd>
            </div>
          </dl>
        </section>

        <MessageGenerator key={`${contact.id}-${defaultApplicationId ?? ""}`} contact={contact} defaultApplicationId={defaultApplicationId} />
        <FollowUpScheduler key={`f-${contact.id}-${contact.next_follow_up_at ?? ""}`} contact={contact} />
        <NotesEditor key={`n-${contact.id}`} contact={contact} />
      </div>
    </Sheet>
  );
}
