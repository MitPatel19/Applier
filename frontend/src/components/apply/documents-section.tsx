"use client";

/** Documents on the "Ready to Apply" screen: tailored resume + cover letter. */

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, FileDown, FileText, Mail, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import type { ApplicationDetail, CoverLetterVariant } from "@/lib/types";
import { useGenerateCoverLetter } from "@/lib/queries/cover-letters";
import { useRefreshReadiness, useUpdateApplication } from "@/lib/queries/prepare";
import { resumeUrls, useResumeVersion } from "@/lib/queries/resumes";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/feedback";
import { ScoreRing } from "@/components/ui/score";
import { ChangeReview } from "@/components/resume/change-review";
import { CoverLetterEditor, VariantSwitcher } from "@/components/cover-letters/cover-letter-editor";
import { DownloadLink } from "./bits";

function DocIcon({ tone = "primary", children }: { tone?: "primary" | "accent"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
        tone === "primary" ? "bg-primary-soft text-primary-soft-fg" : "bg-accent-soft text-accent",
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

export function ResumeDocumentCard({
  detail,
  reviewOpen,
  onReviewOpenChange,
}: {
  detail: ApplicationDetail;
  reviewOpen: boolean;
  onReviewOpenChange: (open: boolean) => void;
}) {
  // Subscribe to the version query so accept/reject decisions update this card immediately.
  const { data: liveVersion } = useResumeVersion(detail.resume_version?.id, detail.resume_version);
  const version = liveVersion ?? detail.resume_version;
  const resume = detail.resume;

  if (!version && !resume) {
    return (
      <Card id="resume" className="scroll-mt-24 p-5">
        <div className="flex items-start gap-3">
          <DocIcon>
            <FileText />
          </DocIcon>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Resume</p>
            <Callout tone="danger" className="mt-3" title="No resume attached">
              Upload a resume or create one from your profile, then re-run preparation so Applier can tailor it for this job.
            </Callout>
            <Button asChild size="sm" className="mt-3">
              <Link href="/resumes">Go to Resume Center</Link>
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const pending = version ? version.changes.filter((c) => c.accepted === null).length : 0;
  const accepted = version ? version.changes.filter((c) => c.accepted === true).length : 0;
  const fileName = version?.file_name ?? resume?.file_name ?? `${resume?.name ?? "Resume"}.pdf`;

  return (
    <Card id="resume" className="scroll-mt-24 p-5">
      <div className="flex items-start gap-3">
        <DocIcon>
          <FileText />
        </DocIcon>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">Resume</p>
            {version ? (
              <Badge tone={version.status === "approved" ? "success" : "primary"} size="xs">
                {version.status === "approved" ? "Approved" : "Customized for this job"}
              </Badge>
            ) : (
              <Badge tone="neutral" size="xs">
                Not tailored
              </Badge>
            )}
          </div>
          <p className="mt-1 break-all text-sm text-muted">{fileName}</p>
          {version && (
            <p className="mt-1 text-caption text-subtle">
              Based on “{resume?.name ?? "your resume"}” · {version.changes.length} changes · {accepted} accepted
              {pending > 0 && <span className="font-medium text-warning"> · {pending} awaiting review</span>}
            </p>
          )}
        </div>
        {version?.ats_score !== null && version?.ats_score !== undefined && (
          <div className="hidden text-center sm:block">
            <ScoreRing score={version.ats_score} size={52} stroke={4} label="ATS score" />
            <p className="mt-1 text-[11px] text-subtle">ATS score</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {version ? (
          <>
            <Button size="sm" variant={pending > 0 ? "primary" : "secondary"} onClick={() => onReviewOpenChange(true)}>
              <Sparkles /> Review changes
              {pending > 0 && (
                <span className="ml-0.5 rounded-full bg-primary-fg/20 px-1.5 text-[11px] font-semibold">{pending}</span>
              )}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={resumeUrls.versionRender(version.id, "pdf")} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Preview
              </a>
            </Button>
            <DownloadLink href={resumeUrls.versionRender(version.id, "pdf")} variant="ghost">
              <FileDown /> PDF
            </DownloadLink>
            <DownloadLink href={resumeUrls.versionRender(version.id, "docx")} variant="ghost">
              <FileDown /> DOCX
            </DownloadLink>
            {version.ats_score !== null && (
              <span className="text-caption text-subtle sm:hidden">ATS score {version.ats_score}%</span>
            )}
          </>
        ) : resume ? (
          <>
            <DownloadLink href={resumeUrls.render(resume.id, "pdf")} variant="secondary">
              <FileDown /> PDF
            </DownloadLink>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/resumes/${resume.id}`}>Open resume</Link>
            </Button>
          </>
        ) : null}
      </div>

      {version && (
        <Sheet
          open={reviewOpen}
          onOpenChange={onReviewOpenChange}
          title="Resume changes"
          description={`Tailored for ${detail.job_title} at ${detail.company_name}. Accept or reject each change.`}
          footer={
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/resumes/versions/${version.id}`}>Open full page</Link>
              </Button>
              <Button size="sm" onClick={() => onReviewOpenChange(false)}>
                Done
              </Button>
            </>
          }
        >
          <ChangeReview version={version} />
        </Sheet>
      )}
    </Card>
  );
}

export function CoverLetterCard({
  detail,
  open,
  onOpenChange,
}: {
  detail: ApplicationDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cl = detail.cover_letter;
  const generate = useGenerateCoverLetter();
  const attach = useUpdateApplication(detail.id);
  const refresh = useRefreshReadiness(detail.id);
  const [variant, setVariant] = React.useState<CoverLetterVariant>("professional");
  const bodyId = React.useId();

  const create = async () => {
    if (!detail.job_id) return;
    try {
      const letter = await generate.mutateAsync({ job_id: detail.job_id, variant });
      await attach.mutateAsync({ cover_letter_id: letter.id });
      await refresh.mutateAsync();
      onOpenChange(true);
      toast.success("Cover letter drafted", { description: "Review and edit it below — nothing is sent until you approve." });
    } catch (e) {
      toast.error(errorMessage(e, "We couldn't draft a cover letter right now."));
    }
  };

  const busy = generate.isPending || attach.isPending || refresh.isPending;

  return (
    <Card id="cover-letter" className="scroll-mt-24 p-5">
      <div className="flex items-start gap-3">
        <DocIcon tone="accent">
          <Mail />
        </DocIcon>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">Cover letter</p>
            {cl ? (
              <Badge tone={cl.status === "approved" ? "success" : "accent"} size="xs">
                {cl.status === "approved" ? "Approved" : "Prepared"}
              </Badge>
            ) : (
              <Badge tone="neutral" size="xs">
                Not included
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {cl ? cl.title : "No cover letter yet. Many employers don't require one — but a short, specific letter can help."}
          </p>
        </div>
        {cl && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={open ? "Collapse cover letter" : "Expand cover letter"}
            onClick={() => onOpenChange(!open)}
          >
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        )}
      </div>

      {cl ? (
        open ? (
          <div id={bodyId} className="mt-4 animate-fade-in">
            <CoverLetterEditor coverLetter={cl} compact />
          </div>
        ) : (
          <div className="mt-3">
            <p className="line-clamp-3 text-sm leading-relaxed text-muted">{cl.content}</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => onOpenChange(true)}>
              Edit cover letter
            </Button>
          </div>
        )
      ) : detail.job_id ? (
        <div className="mt-4 space-y-3">
          <VariantSwitcher value={variant} onChange={setVariant} disabled={busy} />
          <Button size="sm" onClick={create} loading={busy}>
            {!busy && <Plus />} Draft a cover letter
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
