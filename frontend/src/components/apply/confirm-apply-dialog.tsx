"use client";

/**
 * "Confirm Application" — the explicit, per-application approval step. Nothing leaves Applier
 * until the user presses Apply Now here.
 */

import * as React from "react";
import { Rocket, ShieldCheck, XCircle } from "lucide-react";
import type { ApplicationDetail, ApplicationPreview } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/feedback";
import { Checkbox } from "@/components/ui/primitives";
import { StepsList } from "./bits";

export function ConfirmApplyDialog({
  open,
  onOpenChange,
  detail,
  preview,
  loading,
  error,
  onConfirm,
  onReviewAgain,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: ApplicationDetail;
  preview: ApplicationPreview | undefined;
  loading: boolean;
  error: string | null;
  onConfirm: (acknowledgeAnswers: boolean) => void;
  onReviewAgain: () => void;
}) {
  // Mirrors the backend: answered, unconfirmed answers need an explicit acknowledgement.
  const needsAck = detail.answers.some((a) => a.needs_confirmation && !a.confirmed && a.answer.trim() !== "");
  const [ack, setAck] = React.useState(false);
  const ackId = React.useId();
  const blocked = needsAck && !ack;
  const external = (preview?.submission_method ?? "external_link") !== "automation";

  const summary: [string, string][] = [
    ["Company", detail.company_name],
    ["Position", detail.job_title],
    ["Resume", preview?.resume_file_name ?? detail.resume_version?.file_name ?? detail.resume_name ?? "—"],
    ["Cover letter", detail.cover_letter ? preview?.cover_letter_file_name ?? "Prepared" : "Not included"],
    ["Questions", preview ? `${preview.answers_completed}/${preview.answers_total} completed` : `${detail.answers.length}`],
    ["Sent to", preview?.destination ?? "Employer's application page"],
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!loading) onOpenChange(o);
      }}
      title="Confirm Application"
      description="Everything is ready. Would you like to proceed with this application?"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onReviewAgain} disabled={loading}>
            Review Again
          </Button>
          <Button
            variant="gradient"
            onClick={() => onConfirm(ack)}
            disabled={blocked}
            loading={loading}
            aria-describedby={blocked ? `${ackId}-why` : undefined}
          >
            {!loading && <Rocket />} Apply Now
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 rounded-xl border border-border bg-bg-subtle/60 p-4 sm:grid-cols-2">
          {summary.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">{k}</dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-text" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="mb-2 text-sm font-semibold">What happens next</p>
          <StepsList
            steps={
              external
                ? [
                    { label: "We record your approval for this one application." },
                    { label: "We open the employer's application page and give you your documents and answers." },
                    { label: "You review and submit on their site.", you: true },
                    { label: "Come back and tell us it's submitted — then we track it and remind you to follow up." },
                  ]
                : [
                    { label: "We record your approval for this one application." },
                    { label: "Applier fills in the employer's form with exactly what you reviewed." },
                    { label: "If the site asks for a CAPTCHA or sign-in code, we pause and hand it to you.", you: true },
                    { label: "You confirm it went through — then we track it." },
                  ]
            }
          />
        </div>

        <label
          htmlFor={ackId}
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 transition-colors hover:border-border-strong"
        >
          <Checkbox id={ackId} checked={ack} onCheckedChange={(c) => setAck(c === true)} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-medium text-text">I&apos;ve reviewed my answers and documents</span>
            {needsAck ? (
              <span id={`${ackId}-why`} className="mt-0.5 block text-muted">
                Required — some answers (like salary or work eligibility) are personal, so we need your explicit OK.
              </span>
            ) : (
              <span className="mt-0.5 block text-muted">Optional, but a last look never hurts.</span>
            )}
          </span>
        </label>

        {error && (
          <Callout tone="danger" icon={<XCircle />} title="We couldn't continue">
            {error}
          </Callout>
        )}

        <p className="flex items-center gap-2 text-caption text-subtle">
          <ShieldCheck className="size-3.5 text-success" aria-hidden /> Your approval covers this application only and expires after 30
          minutes.
        </p>
      </div>
    </Dialog>
  );
}
