"use client";

import * as React from "react";
import { Bookmark, BookmarkCheck, Ellipsis, EyeOff, RefreshCw, ThumbsDown, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useHideJob, useJobFeedback, useRescoreJob, useUnhideJob } from "@/lib/queries/jobs";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/primitives";
import { useToggleSave } from "@/components/app/job-card";

const HIDE_REASONS = [
  "Not relevant to my goals",
  "Salary is too low",
  "Location doesn't work for me",
  "Not interested in this company",
  "Looks suspicious or spammy",
  "Already applied elsewhere",
];

export function SaveJobButton({ job, compact, className }: { job: Pick<Job, "id" | "is_saved">; compact?: boolean; className?: string }) {
  const toggle = useToggleSave();
  const label = job.is_saved ? "Saved" : "Save";
  return (
    <Button
      variant="secondary"
      size={compact ? "icon" : "md"}
      className={className}
      aria-pressed={job.is_saved}
      aria-label={compact ? (job.is_saved ? "Remove from saved" : "Save job") : undefined}
      loading={toggle.isPending}
      onClick={() => toggle.mutate({ id: job.id, save: !job.is_saved })}
    >
      {!toggle.isPending && (job.is_saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />)}
      {!compact && label}
    </Button>
  );
}

function HideDialog({ job, open, onOpenChange }: { job: Pick<Job, "id" | "title">; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [reason, setReason] = React.useState<string>(HIDE_REASONS[0]);
  const [note, setNote] = React.useState("");
  const hide = useHideJob();
  const unhide = useUnhideJob();
  const submit = () => {
    const full = note.trim() ? `${reason} — ${note.trim()}` : reason;
    hide.mutate(
      { id: job.id, reason: full },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success("Job hidden", {
            description: "It won't appear in your lists. You can find it any time under Hidden jobs.",
            action: { label: "Undo", onClick: () => unhide.mutate(job.id) },
          });
        },
        onError: (e) => toast.error("Couldn't hide this job", { description: errorMessage(e) }),
      },
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Hide this job?"
      description="Tell us why and your agent will use it to improve future recommendations. You can unhide it later."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={hide.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={hide.isPending}>
            <EyeOff /> Hide job
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Reason</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {HIDE_REASONS.map((r) => (
            <label
              key={r}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                reason === r ? "border-primary bg-primary-soft/60 text-text" : "border-border text-muted hover:border-border-strong",
              )}
            >
              <input type="radio" name="hide-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--primary)]" />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Anything else? (optional)" className="mt-4">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Requires relocation to Toronto" />
      </Field>
    </Dialog>
  );
}

/** Secondary job actions: hide/unhide, not interested, rescore. */
export function JobMoreActions({ job }: { job: Pick<Job, "id" | "title" | "is_hidden"> }) {
  const [hideOpen, setHideOpen] = React.useState(false);
  const unhide = useUnhideJob();
  const feedback = useJobFeedback();
  const rescore = useRescoreJob();

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" aria-label="More actions" loading={rescore.isPending || feedback.isPending || unhide.isPending}>
            {!(rescore.isPending || feedback.isPending || unhide.isPending) && <Ellipsis />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={() =>
              rescore.mutate(job.id, {
                onSuccess: (m) =>
                  toast.success(`Match updated: ${m.overall}%`, { description: "Scored again with your latest profile and preferences." }),
                onError: (e) => toast.error("Couldn't rescore", { description: errorMessage(e) }),
              })
            }
          >
            <RefreshCw /> Rescore with my latest profile
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              feedback.mutate(
                { id: job.id, feedback: "not_interested" },
                {
                  onSuccess: () =>
                    toast.success("Thanks for the feedback", {
                      description: "Your agent will rank similar jobs lower from now on.",
                      action: { label: "Undo", onClick: () => feedback.mutate({ id: job.id, feedback: null }) },
                    }),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            <ThumbsDown /> Not interested
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {job.is_hidden ? (
            <DropdownMenuItem
              onSelect={() =>
                unhide.mutate(job.id, {
                  onSuccess: () => toast.success("Job is visible again", { description: "It's back in your Discover list." }),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              <Undo2 /> Unhide job
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem destructive onSelect={() => setHideOpen(true)}>
              <EyeOff /> Hide job…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <HideDialog job={job} open={hideOpen} onOpenChange={setHideOpen} />
    </>
  );
}
