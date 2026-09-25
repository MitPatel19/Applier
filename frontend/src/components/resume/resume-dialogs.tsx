"use client";

/** Upload / create-from-profile / edit-details dialogs for the Resume Center. */

import * as React from "react";
import { FileUp, ShieldCheck, UploadCloud, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/api";
import type { Resume, ResumeDetail } from "@/lib/types";
import { formatFileSize, useCreateResumeFromProfile, useUpdateResume, useUploadResume } from "@/lib/queries/resumes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/primitives";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function validateFile(f: File): string | null {
  const ok = /\.(pdf|docx)$/i.test(f.name);
  if (!ok) return "Please choose a PDF or Word (.docx) file.";
  if (f.size > MAX_BYTES) return "That file is larger than 10 MB. Try exporting a smaller PDF.";
  return null;
}

function fieldError(err: unknown, field: string) {
  return err instanceof ApiError ? err.fieldErrors.find((f) => f.field.endsWith(field))?.message ?? null : null;
}

export function UploadResumeDialog({
  open,
  onOpenChange,
  isFirst,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isFirst?: boolean;
  onUploaded?: (r: ResumeDetail) => void;
}) {
  const upload = useUploadResume();
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("");
  const [makeDefault, setMakeDefault] = React.useState(!!isFirst);
  const [dragging, setDragging] = React.useState(false);
  const inputId = React.useId();

  const reset = () => {
    setFile(null);
    setFileError(null);
    setName("");
    setRole("");
    setMakeDefault(!!isFirst);
    upload.reset();
  };

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const err = validateFile(f);
    setFileError(err);
    if (err) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.(pdf|docx)$/i, "").replace(/[_-]+/g, " ").trim());
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setFileError("Choose a file to upload.");
      return;
    }
    upload.mutate(
      { file, name: name.trim() || file.name, target_role: role.trim() || undefined, set_default: makeDefault },
      {
        onSuccess: (r) => {
          toast.success("Resume uploaded", {
            description: `We read ${r.skills_count} skills from it. Review the parsed content and fix anything we got wrong.`,
          });
          onOpenChange(false);
          reset();
          onUploaded?.(r);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (upload.isPending) return;
        onOpenChange(o);
        if (!o) reset();
      }}
      title="Upload a resume"
      description="PDF or Word (.docx), up to 10 MB. We'll read it so Applier can tailor it for each job."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="upload-resume-form" loading={upload.isPending}>
            {upload.isPending ? "Uploading & reading…" : "Upload resume"}
          </Button>
        </>
      }
    >
      <form id="upload-resume-form" onSubmit={submit} className="space-y-4">
        {file ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-subtle/60 p-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
              <FileUp className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-caption text-subtle">{formatFileSize(file.size)}</p>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove file" onClick={() => setFile(null)} disabled={upload.isPending}>
              <X />
            </Button>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
              "focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/20",
              dragging ? "border-primary bg-primary-soft/40" : "border-border-strong hover:border-primary/60 hover:bg-bg-subtle/60",
              fileError && "border-danger/60",
            )}
          >
            <UploadCloud className={cn("size-8", dragging ? "text-primary" : "text-subtle")} aria-hidden />
            <span className="mt-3 text-sm font-medium text-text">Drag &amp; drop your resume here</span>
            <span className="mt-1 text-caption text-subtle">or click to browse · PDF or DOCX · max 10 MB</span>
            <input
              id={inputId}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-describedby={fileError ? `${inputId}-err` : undefined}
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </label>
        )}
        {fileError && (
          <p id={`${inputId}-err`} role="alert" className="-mt-2 text-caption text-danger">
            {fileError}
          </p>
        )}

        <Field label="Name" hint="Only you see this — e.g. “Software Developer 2026”." error={fieldError(upload.error, "name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My resume" />
        </Field>
        <Field label="Target role" hint="Optional. Helps Applier pick the right resume for each job.">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Junior Software Developer" />
        </Field>
        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox checked={makeDefault} onCheckedChange={(c) => setMakeDefault(c === true)} className="mt-0.5" />
          <span>
            <span className="font-medium">Make this my default resume</span>
            <span className="block text-muted">Used when no other resume fits a job better.</span>
          </span>
        </label>

        {upload.isError && !fieldError(upload.error, "name") && (
          <Callout tone="danger" title="Upload failed">
            {errorMessage(upload.error)}
          </Callout>
        )}
        <p className="flex items-center gap-1.5 text-caption text-subtle">
          <ShieldCheck className="size-3.5 text-success" aria-hidden /> Stored privately and encrypted. Delete it any time.
        </p>
      </form>
    </Dialog>
  );
}

export function CreateFromProfileDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (r: ResumeDetail) => void;
}) {
  const create = useCreateResumeFromProfile();
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("");
  const [makeDefault, setMakeDefault] = React.useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: name.trim() || "Resume from profile", target_role: role.trim() || null, set_default: makeDefault },
      {
        onSuccess: (r) => {
          toast.success("Resume created from your profile", { description: "Edit any section, then download it as PDF or DOCX." });
          onOpenChange(false);
          setName("");
          setRole("");
          onCreated?.(r);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !create.isPending && onOpenChange(o)}
      title="Create a resume from your profile"
      description="We'll build a clean, ATS-friendly resume from your experience, skills, projects and education."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="from-profile-form" loading={create.isPending}>
            {!create.isPending && <UserRound />} Create resume
          </Button>
        </>
      }
    >
      <form id="from-profile-form" onSubmit={submit} className="space-y-4">
        <Field label="Name" required error={fieldError(create.error, "name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Software Developer resume" autoFocus />
        </Field>
        <Field label="Target role" hint="Optional.">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Junior Software Developer" />
        </Field>
        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox checked={makeDefault} onCheckedChange={(c) => setMakeDefault(c === true)} /> Make this my default resume
        </label>
        {create.isError && !fieldError(create.error, "name") && (
          <Callout tone="danger" title="We couldn't create the resume">
            {errorMessage(create.error)} If your profile is mostly empty, add some experience or skills first.
          </Callout>
        )}
      </form>
    </Dialog>
  );
}

export function EditResumeDetailsDialog({
  resume,
  open,
  onOpenChange,
}: {
  resume: Resume;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Resume details" description="Rename it, set a target role, or change its status.">
      {open && <EditForm resume={resume} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function EditForm({ resume, onDone }: { resume: Resume; onDone: () => void }) {
  const update = useUpdateResume();
  const [name, setName] = React.useState(resume.name);
  const [role, setRole] = React.useState(resume.target_role ?? "");
  const [status, setStatus] = React.useState<Resume["status"]>(resume.status);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { id: resume.id, name: name.trim(), target_role: role.trim() || null, status },
      {
        onSuccess: () => {
          toast.success("Resume details saved");
          onDone();
        },
      },
    );
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name" required error={fieldError(update.error, "name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Target role">
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Junior Software Developer" />
      </Field>
      <Field label="Status" hint="Archived resumes are never used for new applications.">
        <Select value={status} onChange={(e) => setStatus(e.target.value as Resume["status"])}>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>
      </Field>
      {update.isError && !fieldError(update.error, "name") && <Callout tone="danger">{errorMessage(update.error)}</Callout>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={update.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
