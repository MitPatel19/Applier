"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, errorMessage } from "@/lib/api";
import { INTERVIEW_KIND_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { ApplicationDetail, ApplicationStatus, Interview, InterviewDetail, InterviewKind } from "@/lib/types";
import { useApplications, appKeys } from "@/lib/queries/applications";
import { useCreateInterview, useUpdateInterview, type InterviewUpdateIn } from "@/lib/queries/interviews";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { localInputToIso, toLocalInputValue } from "./time";

export const INTERVIEW_KINDS: InterviewKind[] = ["phone_screen", "recruiter", "technical", "behavioral", "onsite", "final", "other"];

export function kindForStatus(status: ApplicationStatus | null | undefined): InterviewKind {
  if (status === "technical_interview") return "technical";
  if (status === "final_interview") return "final";
  if (status === "recruiter_contacted") return "recruiter";
  return "phone_screen";
}

const ACTIVE_FOR_INTERVIEW: ApplicationStatus[] = [
  "interview",
  "technical_interview",
  "final_interview",
  "recruiter_contacted",
  "confirmed",
  "applied",
  "offer",
  "ready",
  "reviewing",
];

interface FormState {
  applicationId: string;
  kind: InterviewKind;
  when: string;
  duration: string;
  location: string;
  meetingUrl: string;
  interviewers: string[];
  notes: string;
}

function initialState(interview: Interview | null | undefined, applicationId: number | null | undefined, defaultKind: InterviewKind): FormState {
  return {
    applicationId: applicationId ? String(applicationId) : interview ? String(interview.application_id) : "",
    kind: interview?.kind ?? defaultKind,
    when: toLocalInputValue(interview?.scheduled_at),
    duration: interview?.duration_minutes ? String(interview.duration_minutes) : "45",
    location: interview?.location ?? "",
    meetingUrl: interview?.meeting_url ?? "",
    interviewers: interview?.interviewers ?? [],
    notes: interview?.notes ?? "",
  };
}

function ApplicationPicker({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | null }) {
  const { data, isLoading } = useApplications();
  const options = React.useMemo(() => {
    const items = (data ?? []).filter((a) => ACTIVE_FOR_INTERVIEW.includes(a.status));
    return items.sort((a, b) => ACTIVE_FOR_INTERVIEW.indexOf(a.status) - ACTIVE_FOR_INTERVIEW.indexOf(b.status));
  }, [data]);
  return (
    <Field label="Application" required error={error} hint={!isLoading && !options.length ? "Apply to a job first — interviews attach to an application." : undefined}>
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading}>
        <option value="">{isLoading ? "Loading applications…" : "Choose an application"}</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.company_name} — {a.job_title} ({STATUS_LABELS[a.status]})
          </option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * Schedule (POST /interviews) or edit (PATCH /interviews/{id}) an interview.
 * With `reuseUnscheduled`, an interview the backend auto-created for a status change (no date yet)
 * is updated instead of creating a duplicate.
 */
export function ScheduleInterviewDialog({
  open,
  onOpenChange,
  applicationId,
  interview,
  defaultKind = "phone_screen",
  reuseUnscheduled,
  title,
  description,
  cancelLabel = "Cancel",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId?: number | null;
  interview?: Interview | null;
  defaultKind?: InterviewKind;
  reuseUnscheduled?: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  cancelLabel?: string;
  onSaved?: (interview: InterviewDetail) => void;
}) {
  const formId = React.useId();
  const [saving, setSaving] = React.useState(false);
  const editing = !!interview;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !saving && onOpenChange(v)}
      size="lg"
      title={title ?? (editing ? "Edit interview details" : "Schedule interview")}
      description={
        description ??
        (editing
          ? "Update the time, format or who you're meeting."
          : "Add the details and Applier will prepare a tailored prep plan for you.")
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            {cancelLabel}
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {editing ? "Save changes" : "Schedule interview"}
          </Button>
        </>
      }
    >
      {open && (
        <ScheduleForm
          formId={formId}
          interview={interview}
          applicationId={applicationId}
          defaultKind={defaultKind}
          reuseUnscheduled={reuseUnscheduled}
          onSavingChange={setSaving}
          onDone={(saved) => {
            onOpenChange(false);
            onSaved?.(saved);
          }}
        />
      )}
    </Dialog>
  );
}

function ScheduleForm({
  formId,
  interview,
  applicationId,
  defaultKind,
  reuseUnscheduled,
  onSavingChange,
  onDone,
}: {
  formId: string;
  interview?: Interview | null;
  applicationId?: number | null;
  defaultKind: InterviewKind;
  reuseUnscheduled?: boolean;
  onSavingChange: (v: boolean) => void;
  onDone: (saved: InterviewDetail) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const create = useCreateInterview();
  const update = useUpdateInterview();
  const [form, setForm] = React.useState<FormState>(() => initialState(interview, applicationId, defaultKind));
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    const appId = Number(form.applicationId);
    if (!interview && !appId) nextErrors.applicationId = "Choose which application this interview is for.";
    const duration = form.duration ? Number(form.duration) : null;
    if (duration !== null && (Number.isNaN(duration) || duration < 5 || duration > 600)) nextErrors.duration = "Between 5 and 600 minutes.";
    if (form.meetingUrl && !/^https?:\/\//i.test(form.meetingUrl)) nextErrors.meetingUrl = "Use a full link starting with https://";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const body: InterviewUpdateIn = {
      kind: form.kind,
      scheduled_at: localInputToIso(form.when),
      duration_minutes: duration,
      location: form.location.trim() || null,
      meeting_url: form.meetingUrl.trim() || null,
      interviewers: form.interviewers,
      notes: form.notes.trim() || null,
    };
    onSavingChange(true);
    try {
      let saved: InterviewDetail;
      if (interview) {
        saved = await update.mutateAsync({ id: interview.id, body });
      } else {
        let reuseId: number | null = null;
        if (reuseUnscheduled) {
          try {
            const detail = await qc.fetchQuery({
              queryKey: appKeys.detail(appId),
              queryFn: () => api.get<ApplicationDetail>(`/applications/${appId}`),
              staleTime: 0,
            });
            const candidate = detail.interviews.find((i) => !i.scheduled_at && (!i.outcome || i.outcome === "pending"));
            reuseId = candidate?.id ?? null;
          } catch {
            reuseId = null;
          }
        }
        saved = reuseId
          ? await update.mutateAsync({ id: reuseId, body })
          : await create.mutateAsync({ application_id: appId, ...body, interviewers: form.interviewers });
      }
      toast.success(interview ? "Interview updated" : "Interview scheduled", {
        description: interview ? undefined : "Your preparation plan is ready.",
        action: interview ? undefined : { label: "Open prep", onClick: () => router.push(`/interviews/${saved.id}`) },
      });
      onDone(saved);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) {
        const fe: typeof errors = {};
        for (const f of err.fieldErrors) {
          if (f.field.includes("scheduled")) fe.when = f.message;
          else if (f.field.includes("duration")) fe.duration = f.message;
          else if (f.field.includes("meeting")) fe.meetingUrl = f.message;
          else if (f.field.includes("application")) fe.applicationId = f.message;
        }
        setErrors(fe);
      }
      toast.error("Couldn't save the interview", { description: errorMessage(err) });
    } finally {
      onSavingChange(false);
    }
  };

  return (
    <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      {!interview && !applicationId && (
        <div className="sm:col-span-2">
          <ApplicationPicker value={form.applicationId} onChange={(v) => set("applicationId", v)} error={errors.applicationId} />
        </div>
      )}
      <Field label="Interview type">
        <Select value={form.kind} onChange={(e) => set("kind", e.target.value as InterviewKind)}>
          {INTERVIEW_KINDS.map((k) => (
            <option key={k} value={k}>
              {INTERVIEW_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date & time" hint="Your local time. Leave empty if not confirmed yet." error={errors.when}>
        <Input type="datetime-local" value={form.when} onChange={(e) => set("when", e.target.value)} />
      </Field>
      <Field label="Duration (minutes)" error={errors.duration}>
        <Input type="number" inputMode="numeric" min={5} max={600} step={5} value={form.duration} onChange={(e) => set("duration", e.target.value)} />
      </Field>
      <Field label="Location" hint="Office address, “Phone”, or “Video call”.">
        <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Video call" />
      </Field>
      <Field label="Meeting link" className="sm:col-span-2" error={errors.meetingUrl}>
        <Input type="url" value={form.meetingUrl} onChange={(e) => set("meetingUrl", e.target.value)} placeholder="https://meet.google.com/…" />
      </Field>
      <Field label="Interviewers" className="sm:col-span-2" hint="Press Enter after each name.">
        <TagInput value={form.interviewers} onChange={(v) => set("interviewers", v)} placeholder="e.g. Priya Shah, Engineering Manager" />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Anything the recruiter mentioned — format, topics, what to bring…" />
      </Field>
    </form>
  );
}
