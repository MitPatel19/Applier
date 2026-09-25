"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Radar,
  Rocket,
  Trash2,
  Undo2,
} from "lucide-react";
import { errorMessage } from "@/lib/api";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import type { ApplicationDetail, ApplicationStatus } from "@/lib/types";
import { useDeleteApplication, useUpdateApplication } from "@/lib/queries/applications";
import { cn, formatDate, hostFromUrl, initials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { ScoreRing } from "@/components/ui/score";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/primitives";
import { DemoBadge, StatusBadge } from "@/components/app/status";
import { ReadinessMeter } from "@/components/pipeline/application-card";
import type { StatusFlow } from "@/components/pipeline/status-flow";
import { sourceLabel } from "./history-table";

const SUBMISSION_METHOD: Record<NonNullable<ApplicationDetail["submission_method"]>, string> = {
  external_link: "On the employer's site",
  automation: "Assisted submission",
  manual: "Submitted manually",
};
const SUBMISSION_STATE: Record<NonNullable<ApplicationDetail["submission_state"]>, { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  pending_user: { label: "Waiting for you", tone: "warning" },
  submitted: { label: "Submitted", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  paused: { label: "Paused", tone: "neutral" },
};

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-border bg-surface-2/60 px-3.5 py-3", className)}>
      <dt className="text-caption font-medium uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="mt-1 min-w-0 text-sm text-text">{children}</dd>
    </div>
  );
}

function SalaryDialog({ app, open, onOpenChange }: { app: ApplicationDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const update = useUpdateApplication(app.id);
  const [value, setValue] = React.useState(app.salary_expectation ?? "");
  const formId = React.useId();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Salary expectation"
      description="What you'll say if asked on the form or by a recruiter for this role."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={update.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(
            { salary_expectation: value.trim() || null },
            {
              onSuccess: () => {
                toast.success("Salary expectation saved");
                onOpenChange(false);
              },
              onError: (err) => toast.error(errorMessage(err)),
            },
          );
        }}
      >
        <Field label="Expectation" hint="e.g. “$85,000–95,000 CAD, flexible for the right role”">
          <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
      </form>
    </Dialog>
  );
}

export function ApplicationHeader({ app, flow }: { app: ApplicationDetail; flow: StatusFlow }) {
  const router = useRouter();
  const del = useDeleteApplication();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = React.useState(false);
  const [salaryOpen, setSalaryOpen] = React.useState(false);
  const postingUrl = app.url ?? app.apply_url;
  const isReady = app.status === "ready" || app.status === "reviewing";
  const readiness = app.readiness_summary;
  const statusId = React.useId();

  return (
    <div className="space-y-5">
      <Link href="/applications" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Pipeline
      </Link>

      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="bg-aurora pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 gap-4">
            <div
              className="bg-gradient-brand hidden size-14 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-white shadow-glow sm:flex"
              aria-hidden
            >
              {initials(app.company_name) || <Building2 />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted">
                {app.company ? (
                  <Link href={`/companies/${app.company.id}`} className="hover:text-primary">
                    {app.company_name}
                  </Link>
                ) : (
                  app.company_name
                )}
                {app.is_demo && <DemoBadge />}
              </p>
              <h1 className="mt-1 text-h1 font-semibold text-text">{app.job_title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                <StatusBadge status={app.status} />
                {app.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-subtle" /> {app.location}
                  </span>
                )}
                {app.source && (
                  <span className="inline-flex items-center gap-1.5">
                    <Radar className="size-3.5 text-subtle" /> {sourceLabel(app.source)}
                  </span>
                )}
                {postingUrl && (
                  <a
                    href={postingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                  >
                    View posting{hostFromUrl(postingUrl) ? ` on ${hostFromUrl(postingUrl)}` : ""}
                    <ExternalLink className="size-3.5" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
                {app.job_id && (
                  <Link href={`/jobs/${app.job_id}`} className="font-medium text-muted hover:text-text">
                    Job details
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:flex-col lg:items-end">
            <ScoreRing score={app.match_score} size={64} label="Match" />
            <div className="flex flex-1 items-center gap-2 lg:flex-none">
              <label htmlFor={statusId} className="sr-only">
                Application status
              </label>
              <Select
                id={statusId}
                value={app.status}
                onChange={(e) => flow.request(app, e.target.value as ApplicationStatus)}
                className="min-w-0 flex-1 lg:w-52"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => setSalaryOpen(true)}>
                    <Pencil /> Edit salary expectation
                  </DropdownMenuItem>
                  {postingUrl && (
                    <DropdownMenuItem onSelect={() => window.open(postingUrl, "_blank", "noopener,noreferrer")}>
                      <ExternalLink /> Open posting
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {app.status !== "withdrawn" && (
                    <DropdownMenuItem destructive onSelect={() => setConfirmWithdraw(true)}>
                      <Undo2 /> Withdraw application
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem destructive onSelect={() => setConfirmDelete(true)}>
                    <Trash2 /> Delete application
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {isReady && (
          <div className="relative mt-5 flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary-soft/50 p-4 sm:flex-row sm:items-center">
            <div className="bg-gradient-brand flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow" aria-hidden>
              <Rocket className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text">
                {app.status === "ready" ? "Your application is prepared" : "A few things need your review"}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                Review the tailored resume, cover letter and answers. Nothing is submitted until you approve it.
              </p>
              <ReadinessMeter summary={readiness} className="mt-2 max-w-sm" />
            </div>
            <Button asChild variant="gradient" size="lg" className="w-full sm:w-auto">
              <Link href={`/applications/${app.id}/prepare`}>
                <Rocket /> Review & Apply
              </Link>
            </Button>
          </div>
        )}

        {app.status === "rejected" && app.rejection_reason && (
          <p className="relative mt-4 rounded-lg bg-danger-soft/60 px-3 py-2 text-sm text-danger">
            Rejection reason: <span className="font-medium">{app.rejection_reason}</span>
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Fact label="Discovered">{formatDate(app.date_discovered ?? app.created_at)}</Fact>
        <Fact label="Applied">{app.applied_at ? formatDate(app.applied_at) : <span className="text-subtle">Not yet</span>}</Fact>
        <Fact label="Match score">
          {app.match_score !== null ? <span className="tabular font-semibold">{app.match_score}%</span> : <span className="text-subtle">Not scored</span>}
        </Fact>
        <Fact label="Salary expectation">
          <button
            type="button"
            onClick={() => setSalaryOpen(true)}
            className="group inline-flex max-w-full items-center gap-1.5 text-left hover:text-primary"
          >
            <span className="truncate">{app.salary_expectation || <span className="text-subtle">Add</span>}</span>
            <Pencil className="size-3 shrink-0 text-subtle group-hover:text-primary" aria-hidden />
            <span className="sr-only">Edit salary expectation</span>
          </button>
        </Fact>
        <Fact label="Resume version" className="col-span-2">
          {app.resume_version_id ? (
            <Link href={`/resumes/versions/${app.resume_version_id}`} className="inline-flex max-w-full items-center gap-1.5 font-medium hover:text-primary">
              <FileText className="size-3.5 shrink-0 text-subtle" />
              <span className="truncate">{app.resume_version?.label ?? app.resume_name ?? "Tailored resume"}</span>
            </Link>
          ) : app.resume_id ? (
            <Link href={`/resumes/${app.resume_id}`} className="inline-flex max-w-full items-center gap-1.5 font-medium hover:text-primary">
              <FileText className="size-3.5 shrink-0 text-subtle" />
              <span className="truncate">{app.resume_name ?? "Resume"}</span>
            </Link>
          ) : (
            <span className="text-subtle">Not selected yet</span>
          )}
        </Fact>
        <Fact label="Cover letter" className="col-span-2">
          {app.cover_letter_id ? (
            <Link href={`/cover-letters/${app.cover_letter_id}`} className="inline-flex max-w-full items-center gap-1.5 font-medium hover:text-primary">
              <Mail className="size-3.5 shrink-0 text-subtle" />
              <span className="truncate">{app.cover_letter?.title ?? "Cover letter"}</span>
            </Link>
          ) : (
            <span className="text-subtle">None</span>
          )}
        </Fact>
        <Fact label="Submission" className="col-span-2 md:col-span-4">
          {app.submission_method || app.submission_state ? (
            <span className="flex flex-wrap items-center gap-2">
              {app.submission_method && <span>{SUBMISSION_METHOD[app.submission_method]}</span>}
              {app.submission_state && (
                <Badge tone={SUBMISSION_STATE[app.submission_state].tone} size="xs">
                  {SUBMISSION_STATE[app.submission_state].label}
                </Badge>
              )}
              {app.approved_at && <span className="text-subtle">Approved {formatDate(app.approved_at)}</span>}
            </span>
          ) : (
            <span className="text-subtle">Not submitted — you approve every application before it goes out.</span>
          )}
        </Fact>
      </dl>

      <SalaryDialog key={String(salaryOpen)} app={app} open={salaryOpen} onOpenChange={setSalaryOpen} />
      <ConfirmDialog
        open={confirmWithdraw}
        onOpenChange={setConfirmWithdraw}
        title="Withdraw this application?"
        description="It will move to Withdrawn. This only updates Applier — let the employer know yourself if needed."
        confirmLabel="Withdraw"
        tone="danger"
        onConfirm={() => {
          flow.request(app, "withdrawn");
          setConfirmWithdraw(false);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this application?"
        description="Its history, notes, answers, interviews and follow-ups will be permanently removed. The job itself stays in your job list."
        confirmLabel="Delete permanently"
        tone="danger"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(app.id, {
            onSuccess: () => {
              toast.success("Application deleted");
              router.push("/applications");
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
