"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/api";
import { JOB_TYPE_LABELS, WORK_ARRANGEMENT_LABELS } from "@/lib/constants";
import { useAddManualJob } from "@/lib/queries/jobs";
import type { JobType, ManualJobIn, WorkArrangement } from "@/lib/types";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

interface FormState {
  title: string;
  company_name: string;
  location: string;
  url: string;
  description: string;
  work_arrangement: WorkArrangement | "";
  employment_type: JobType | "";
  salary_min: string;
  salary_max: string;
  salary_period: "yearly" | "hourly";
  deadline: string;
}

const EMPTY: FormState = {
  title: "",
  company_name: "",
  location: "",
  url: "",
  description: "",
  work_arrangement: "",
  employment_type: "",
  salary_min: "",
  salary_max: "",
  salary_period: "yearly",
  deadline: "",
};

type Errors = Partial<Record<keyof FormState, string>>;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.title.trim()) e.title = "Add the job title.";
  if (!f.company_name.trim()) e.company_name = "Add the company name.";
  if (f.description.trim().length < 40) e.description = "Paste the full job description (at least a few sentences) so we can analyze it.";
  if (f.url.trim()) {
    try {
      const u = new URL(f.url.trim());
      if (!/^https?:$/.test(u.protocol)) e.url = "Use a link that starts with https://";
    } catch {
      e.url = "That doesn't look like a valid link. It should start with https://";
    }
  }
  const min = f.salary_min ? Number(f.salary_min) : null;
  const max = f.salary_max ? Number(f.salary_max) : null;
  if (min !== null && (Number.isNaN(min) || min < 0)) e.salary_min = "Enter a positive number.";
  if (max !== null && (Number.isNaN(max) || max < 0)) e.salary_max = "Enter a positive number.";
  if (min !== null && max !== null && max < min) e.salary_max = "Maximum should be at least the minimum.";
  return e;
}

/** "Add a job manually" — paste a posting found elsewhere; it's analyzed, deduplicated and scored. */
export function AddJobDialog({ triggerVariant = "secondary", triggerLabel = "Add a job" }: { triggerVariant?: ButtonProps["variant"]; triggerLabel?: string }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [errors, setErrors] = React.useState<Errors>({});
  const add = useAddManualJob();
  const router = useRouter();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: ManualJobIn = {
      title: form.title.trim(),
      company_name: form.company_name.trim(),
      location: form.location.trim() || null,
      url: form.url.trim() || null,
      description: form.description.trim(),
      work_arrangement: form.work_arrangement || null,
      employment_type: form.employment_type || null,
      salary_min: form.salary_min ? Number(form.salary_min) : null,
      salary_max: form.salary_max ? Number(form.salary_max) : null,
      salary_period: form.salary_min || form.salary_max ? form.salary_period : null,
      deadline: form.deadline || null,
    };
    add.mutate(body, {
      onSuccess: (job) => {
        toast.success("Job added and analyzed", {
          description: job.full_match
            ? `It scored ${job.full_match.overall}% against your profile. Review the breakdown before preparing an application.`
            : "We extracted the requirements. Review it before preparing an application.",
        });
        setOpen(false);
        setForm(EMPTY);
        router.push(`/jobs/${job.id}`);
      },
      onError: (e) => {
        if (e instanceof ApiError && e.fieldErrors.length) {
          const next: Errors = {};
          for (const fe of e.fieldErrors) {
            const key = fe.field.split(".").pop() as keyof FormState;
            if (key in EMPTY) next[key] = fe.message;
          }
          setErrors(next);
        }
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) add.reset();
      }}
      size="lg"
      title="Add a job manually"
      description="Found a job somewhere else? Paste it here. Your agent will extract the requirements, merge it with any duplicate, and score it against your profile."
      trigger={
        <Button variant={triggerVariant}>
          <Plus /> {triggerLabel}
        </Button>
      }
      footer={
        <>
          <Button variant="secondary" type="button" onClick={() => setOpen(false)} disabled={add.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="add-job-form" loading={add.isPending}>
            {add.isPending ? "Analyzing…" : "Add & analyze"}
          </Button>
        </>
      }
    >
      <form id="add-job-form" onSubmit={submit} className="space-y-4" noValidate>
        {add.isError && !(add.error instanceof ApiError && add.error.fieldErrors.length) && (
          <Callout tone="warning" title="We couldn't add this job">
            {errorMessage(add.error)} Your entries are still here — try again.
          </Callout>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job title" required error={errors.title}>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Junior Python Developer" autoComplete="off" />
          </Field>
          <Field label="Company" required error={errors.company_name}>
            <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Northwind Labs" autoComplete="organization" />
          </Field>
          <Field label="Location" error={errors.location}>
            <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Thunder Bay, ON" />
          </Field>
          <Field label="Posting link" hint="Where you found it — used for the Apply button." error={errors.url}>
            <Input type="url" inputMode="url" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Work arrangement">
            <Select value={form.work_arrangement} onChange={(e) => set("work_arrangement", e.target.value as FormState["work_arrangement"])}>
              <option value="">Not specified</option>
              {(Object.keys(WORK_ARRANGEMENT_LABELS) as WorkArrangement[]).map((k) => (
                <option key={k} value={k}>
                  {WORK_ARRANGEMENT_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Job type">
            <Select value={form.employment_type} onChange={(e) => set("employment_type", e.target.value as FormState["employment_type"])}>
              <option value="">Not specified</option>
              {(Object.keys(JOB_TYPE_LABELS) as JobType[]).map((k) => (
                <option key={k} value={k}>
                  {JOB_TYPE_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-[1fr_1fr_8rem]">
          <legend className="sr-only">Salary</legend>
          <Field label="Salary from" error={errors.salary_min}>
            <Input type="number" inputMode="numeric" min={0} value={form.salary_min} onChange={(e) => set("salary_min", e.target.value)} placeholder="55000" />
          </Field>
          <Field label="Salary to" error={errors.salary_max}>
            <Input type="number" inputMode="numeric" min={0} value={form.salary_max} onChange={(e) => set("salary_max", e.target.value)} placeholder="70000" />
          </Field>
          <Field label="Per">
            <Select value={form.salary_period} onChange={(e) => set("salary_period", e.target.value as FormState["salary_period"])}>
              <option value="yearly">Year</option>
              <option value="hourly">Hour</option>
            </Select>
          </Field>
        </fieldset>

        <Field label="Application deadline" className="sm:max-w-xs">
          <Input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
        </Field>

        <Field label="Job description" required hint="Paste the whole posting — responsibilities, requirements and benefits." error={errors.description}>
          <Textarea rows={8} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="About the role…" />
        </Field>
      </form>
    </Dialog>
  );
}
