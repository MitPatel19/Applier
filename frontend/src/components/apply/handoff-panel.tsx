"use client";

/**
 * Hand-off after approval. Honest by design: the application is only recorded as "Applied" once
 * the user confirms they actually submitted it on the employer's site.
 */

import * as React from "react";
import Link from "next/link";
import {
  AlertOctagon,
  ArrowRight,
  BellRing,
  CalendarCheck,
  CheckCircle2,
  ExternalLink,
  FileDown,
  Hand,
  KanbanSquare,
  PauseCircle,
  PartyPopper,
  RotateCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import type { ApplicationDetail, SubmitResult } from "@/lib/types";
import { applicationDocumentUrl, useConfirmSubmitted } from "@/lib/queries/prepare";
import { coverLetterRenderUrl } from "@/lib/queries/cover-letters";
import { resumeUrls } from "@/lib/queries/resumes";
import { cn, formatDate, hostFromUrl } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/primitives";
import { CopyButton } from "./bits";

/**
 * Rebuild a hand-off from stored state when the user returns mid-submission. Failed attempts are
 * not restored — the user goes back to review and approves again.
 */
export function resultFromDetail(detail: ApplicationDetail): SubmitResult | null {
  const state = detail.submission_state;
  if (state !== "pending_user" && state !== "paused") return null;
  return {
    application_id: detail.id,
    state,
    message:
      state === "paused"
        ? "Submission is paused — the employer's site needs something only you can provide."
        : `You approved this application${detail.approved_at ? ` on ${formatDate(detail.approved_at)}` : ""}. Finish it on the employer's site, then confirm here.`,
    apply_url: detail.apply_url ?? detail.url,
    steps: [
      { label: "Approval recorded", done: true, requires_user: false },
      { label: "Open the employer's application page", done: false, requires_user: true },
      { label: "Upload your documents and paste your answers", done: false, requires_user: true },
      { label: "Submit on the employer's site", done: false, requires_user: true },
      { label: "Confirm here so we can track it", done: false, requires_user: true },
    ],
    status: detail.status,
  };
}

function Documents({ detail }: { detail: ApplicationDetail }) {
  const docs =
    detail.documents.length > 0
      ? detail.documents.map((d) => ({
          key: `d${d.id}`,
          label: d.file_name,
          kind: d.kind === "resume" ? "Resume" : d.kind === "cover_letter" ? "Cover letter" : "Document",
          href: applicationDocumentUrl(detail.id, d.id),
        }))
      : [
          ...(detail.resume_version
            ? [{ key: "rv", label: detail.resume_version.file_name, kind: "Resume", href: resumeUrls.versionRender(detail.resume_version.id, "pdf") }]
            : detail.resume
              ? [{ key: "r", label: detail.resume.file_name ?? `${detail.resume.name}.pdf`, kind: "Resume", href: resumeUrls.render(detail.resume.id, "pdf") }]
              : []),
          ...(detail.cover_letter
            ? [{ key: "cl", label: `${detail.cover_letter.title}.pdf`, kind: "Cover letter", href: coverLetterRenderUrl(detail.cover_letter.id, "pdf") }]
            : []),
        ];
  if (!docs.length) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Your approved documents</p>
      <ul className="space-y-2">
        {docs.map((d) => (
          <li key={d.key} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
            <FileDown className="size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.label}</p>
              <p className="text-caption text-subtle">{d.kind}</p>
            </div>
            <Button asChild size="xs" variant="secondary">
              <a href={d.href} download aria-label={`Download ${d.kind}: ${d.label}`}>
                Download
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnswersToCopy({ detail }: { detail: ApplicationDetail }) {
  if (!detail.answers.length) return null;
  const sorted = [...detail.answers].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Your answers — copy &amp; paste</p>
        <CopyButton
          text={sorted.map((a) => `${a.question}\n${a.answer}`).join("\n\n")}
          label="Copy all"
          showLabel
          size="xs"
          successMessage="All answers copied"
        />
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {sorted.map((a) => (
          <li key={a.id} className="flex items-start gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-caption text-subtle">{a.question}</p>
              <p className="mt-0.5 whitespace-pre-line break-words text-sm text-text">{a.answer || "—"}</p>
            </div>
            <CopyButton text={a.answer} label={`Copy answer: ${a.question}`} successMessage="Answer copied" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HandoffPanel({
  detail,
  result,
  onRetrySubmit,
  retrying,
  onConfirmed,
  onNotSubmitted,
}: {
  detail: ApplicationDetail;
  result: SubmitResult;
  onRetrySubmit: () => void;
  retrying: boolean;
  onConfirmed: (detail: ApplicationDetail) => void;
  onNotSubmitted: () => void;
}) {
  const confirm = useConfirmSubmitted(detail.id);
  const [followUp, setFollowUp] = React.useState(true);
  const [days, setDays] = React.useState(7);
  const [opened, setOpened] = React.useState(false);
  const followId = React.useId();
  const applyUrl = result.apply_url ?? detail.apply_url ?? detail.url;
  const host = hostFromUrl(applyUrl);

  const submitConfirmation = (submitted: boolean) => {
    confirm.mutate(
      { submitted, schedule_follow_up: submitted && followUp, follow_up_days: days },
      {
        onSuccess: (d) => {
          if (submitted) {
            onConfirmed(d);
          } else {
            toast("Nothing was recorded as applied", {
              description: "Your application is back to Ready. Your documents and answers are saved.",
            });
            onNotSubmitted();
          }
        },
        onError: (e) => toast.error(errorMessage(e, "We couldn't record that. Please try again.")),
      },
    );
  };

  const header =
    result.state === "paused"
      ? {
          icon: PauseCircle,
          tone: "warning" as const,
          title: "Paused — the employer's site needs you",
          body: "It's asking for something only you can provide, like a CAPTCHA, a sign-in, or a verification code. Applier never bypasses these. Open the page, complete that step yourself, then submit.",
        }
      : result.state === "failed"
        ? {
            icon: AlertOctagon,
            tone: "danger" as const,
            title: "That didn't go through",
            body: "Nothing was submitted. You can try again, or open the employer's page and apply there with the documents below.",
          }
        : result.state === "submitted"
          ? {
              icon: CheckCircle2,
              tone: "success" as const,
              title: "Sent — please verify it arrived",
              body: "The employer's site accepted the form. Check for their confirmation email or page, then confirm below so we can track it.",
            }
          : {
              icon: Hand,
              tone: "primary" as const,
              title: "Almost done — finish on the employer's site",
              body: "Your approval is recorded. Open the application page, upload your documents, paste your answers and submit. Then come back and tell us.",
            };
  const HeaderIcon = header.icon;

  return (
    <Card className="animate-rise overflow-hidden" aria-live="polite">
      <div className={cn("h-1", header.tone === "danger" ? "bg-danger" : header.tone === "warning" ? "bg-warning" : "bg-gradient-brand")} aria-hidden />
      <div className="space-y-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              header.tone === "danger" && "bg-danger-soft text-danger",
              header.tone === "warning" && "bg-warning-soft text-warning",
              header.tone === "success" && "bg-success-soft text-success",
              header.tone === "primary" && "bg-primary-soft text-primary-soft-fg",
            )}
            aria-hidden
          >
            <HeaderIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-h2 font-semibold">{header.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{header.body}</p>
            {result.message && <p className="mt-2 text-sm text-text">{result.message}</p>}
          </div>
        </div>

        {result.steps.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">Steps</p>
            <ol className="space-y-2">
              {result.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm">
                  <span
                    className={cn(
                      "mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                      s.done ? "bg-success-soft text-success" : s.requires_user ? "bg-primary-soft text-primary-soft-fg" : "bg-bg-subtle text-muted",
                    )}
                    aria-hidden
                  >
                    {s.done ? <CheckCircle2 className="size-3.5" /> : i + 1}
                  </span>
                  <span className={cn("min-w-0 flex-1", s.done ? "text-muted line-through decoration-subtle/50" : "text-text")}>
                    {s.label}
                    <span className="sr-only">{s.done ? " (done)" : s.requires_user ? " (your action)" : ""}</span>
                  </span>
                  {!s.done && s.requires_user && (
                    <Badge tone="primary" size="xs">
                      You
                    </Badge>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {applyUrl ? (
            <Button asChild variant="gradient" size="lg" className="w-full sm:w-auto">
              <a href={applyUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>
                <ExternalLink /> Open application page
              </a>
            </Button>
          ) : (
            <Callout tone="warning" className="w-full">
              We don&apos;t have a link to the employer&apos;s application page. Search for the role on {detail.company_name}&apos;s careers
              site and apply there.
            </Callout>
          )}
          {result.state === "failed" && (
            <Button variant="secondary" size="lg" onClick={onRetrySubmit} loading={retrying}>
              {!retrying && <RotateCw />} Try again
            </Button>
          )}
        </div>
        {host && <p className="-mt-3 text-caption text-subtle">Opens {host} in a new tab. Keep this tab open to confirm afterwards.</p>}

        <div className="grid gap-6 lg:grid-cols-2">
          <Documents detail={detail} />
          <AnswersToCopy detail={detail} />
        </div>

        <div className={cn("rounded-2xl border p-4 sm:p-5", opened ? "border-primary/40 bg-primary-soft/30 shadow-glow" : "border-border bg-bg-subtle/50")}>
          <p className="font-semibold">Did you submit your application?</p>
          <p className="mt-0.5 text-sm text-muted">
            We only mark it as Applied when you tell us — so your tracker always reflects reality.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Switch id={followId} checked={followUp} onCheckedChange={setFollowUp} />
            <label htmlFor={followId} className="flex items-center gap-1.5 text-sm font-medium">
              <BellRing className="size-4 text-subtle" aria-hidden /> Remind me to follow up in
            </label>
            <Select
              aria-label="Follow-up delay"
              value={String(days)}
              onChange={(e) => setDays(Number(e.target.value))}
              disabled={!followUp}
              className="h-8 w-auto"
            >
              {[3, 5, 7, 10, 14].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="success" size="lg" onClick={() => submitConfirmation(true)} loading={confirm.isPending && confirm.variables?.submitted === true} disabled={confirm.isPending}>
              {!(confirm.isPending && confirm.variables?.submitted) && <CheckCircle2 />} I submitted my application
            </Button>
            <Button variant="ghost" size="lg" onClick={() => submitConfirmation(false)} loading={confirm.isPending && confirm.variables?.submitted === false} disabled={confirm.isPending}>
              I didn&apos;t submit
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function AppliedSuccess({ detail }: { detail: ApplicationDetail }) {
  const followUpAt = detail.next_follow_up_at ?? detail.follow_ups.find((f) => f.status === "pending")?.due_at ?? null;
  return (
    <Card className="animate-rise overflow-hidden text-center" aria-live="polite">
      <div className="h-1 bg-gradient-brand" aria-hidden />
      <div className="relative px-5 py-10 sm:px-10">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto flex size-16 items-center justify-center rounded-2xl bg-success-soft text-success shadow-glow">
          <PartyPopper className="size-7" aria-hidden />
        </div>
        <h2 className="relative mt-5 text-h1 font-semibold">Application recorded</h2>
        <p className="relative mx-auto mt-2 max-w-md text-muted">
          <span className="font-medium text-text">
            {detail.job_title} at {detail.company_name}
          </span>{" "}
          is recorded as <span className="font-medium text-text">Applied on {formatDate(detail.applied_at)}</span>.
        </p>
        <div className="relative mx-auto mt-6 grid max-w-md gap-2 text-left">
          <p className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <CalendarCheck className="size-4 shrink-0 text-success" aria-hidden />
            {followUpAt ? (
              <span>
                Follow-up reminder set for <span className="font-medium">{formatDate(followUpAt)}</span>
              </span>
            ) : (
              <span className="text-muted">No follow-up reminder scheduled — you can add one from the application page.</span>
            )}
          </p>
          <p className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
            <KanbanSquare className="size-4 shrink-0 text-primary" aria-hidden />
            We&apos;ll watch for replies and keep your tracker up to date.
          </p>
        </div>
        <div className="relative mt-8 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href={`/applications/${detail.id}`}>
              View application <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/applications">
              <KanbanSquare /> Go to tracker
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/jobs/recommended">
              <Search /> Find more jobs
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
