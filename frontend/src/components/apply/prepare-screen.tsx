"use client";

/**
 * "Ready to Apply" — the application preparation & confirmation screen.
 *
 * Flow: Review (readiness, documents, answers) → Confirm (explicit approval dialog) → Apply
 * (hand-off to the employer's site) → Track (only after the user confirms they submitted).
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  ChevronDown,
  ClipboardCheck,
  FileStack,
  Globe,
  MapPin,
  MessageSquareText,
  Radar,
  SearchX,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/api";
import { SOURCE_LABELS } from "@/lib/constants";
import type { ApplicationDetail, ApplicationStatus, CompanyFact, SubmitResult } from "@/lib/types";
import {
  useApplication,
  useApplicationPreview,
  useApproveApplication,
  useSubmitApplication,
} from "@/lib/queries/prepare";
import { cn, hostFromUrl, titleCase } from "@/lib/utils";
import { MatchBreakdown } from "@/components/app/match-breakdown";
import { DemoBadge, StatusBadge, TierBadge } from "@/components/app/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Callout, EmptyState, ErrorState, Skeleton, SkeletonCard } from "@/components/ui/feedback";
import { ScoreRing } from "@/components/ui/score";
import { AnswersSection } from "./answers-section";
import { AppliedSummary } from "./applied-summary";
import { scrollToSection } from "./bits";
import { ConfirmApplyDialog } from "./confirm-apply-dialog";
import { CoverLetterCard, ResumeDocumentCard } from "./documents-section";
import { AppliedSuccess, HandoffPanel, resultFromDetail } from "./handoff-panel";
import { JourneyStepper, type JourneyStep } from "./journey-stepper";
import { PrepareStart } from "./prepare-start";
import { MobileApplyBar, PreviewContent, PreviewPanelSkeleton } from "./preview-panel";
import { ReadinessChecklist, type ReadinessTarget } from "./readiness-checklist";

const SUBMITTED_STATUSES: ApplicationStatus[] = [
  "applied",
  "confirmed",
  "recruiter_contacted",
  "interview",
  "technical_interview",
  "final_interview",
  "offer",
  "rejected",
  "withdrawn",
  "closed",
];

type Flow = { stage: "handoff"; result: SubmitResult } | { stage: "done"; detail: ApplicationDetail } | null;

// ------------------------------------------------------------------ header

function Header({ detail, destination }: { detail: ApplicationDetail; destination: string | null }) {
  const source = detail.source ? SOURCE_LABELS[detail.source] ?? titleCase(detail.source) : null;
  const score = detail.match?.overall ?? detail.match_score;
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow className="text-primary-soft-fg">Ready to Apply</Eyebrow>
          <StatusBadge status={detail.status} size="xs" />
          {detail.is_demo && <DemoBadge />}
        </div>
        <h1 className="mt-2 text-h1 font-semibold text-balance">{detail.job_title}</h1>
        <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Company</dt>
            <Building2 className="size-3.5 text-subtle" aria-hidden />
            <dd className="font-medium text-text">{detail.company_name}</dd>
          </div>
          {detail.location && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Location</dt>
              <MapPin className="size-3.5 text-subtle" aria-hidden />
              <dd>{detail.location}</dd>
            </div>
          )}
          {source && (
            <div className="flex items-center gap-1.5">
              <dt className="text-subtle">Found on</dt>
              <dd>{source}</dd>
            </div>
          )}
          {destination && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Applies at</dt>
              <Globe className="size-3.5 text-subtle" aria-hidden />
              <dd>{destination}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="flex shrink-0 flex-col items-center">
        <ScoreRing score={score} size={64} stroke={5} className="sm:hidden" />
        <ScoreRing score={score} size={84} stroke={6} className="hidden sm:inline-flex" />
        {detail.match && (
          <div className="mt-1.5 hidden sm:block">
            <TierBadge tier={detail.match.tier} size="xs" />
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sections

function SectionCard({
  id,
  icon,
  title,
  description,
  actions,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 focus:outline-none">
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg [&_svg]:size-[18px]" aria-hidden>
              {icon}
            </span>
            <div>
              <h2 id={`${id}-title`} className="text-h2 font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
          </div>
          {actions}
        </div>
        {children}
      </Card>
    </section>
  );
}

const FACT_TONE: Record<CompanyFact["kind"], "success" | "info" | "neutral"> = { verified: "success", opinion: "info", inferred: "neutral" };

function MatchAndResearch({
  detail,
  concerns,
  open,
  onOpenChange,
}: {
  detail: ApplicationDetail;
  concerns: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const match = detail.match;
  const company = detail.company;
  const top = detail.job?.match;
  return (
    <div className="space-y-6">
      {match ? (
        <div>
          <div className="flex items-start gap-4">
            <ScoreRing score={match.overall} size={56} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{match.overall}% match</p>
                <TierBadge tier={match.tier} size="xs" />
              </div>
              <p className="mt-1 text-sm text-muted">{match.recommendation}</p>
            </div>
          </div>
          {top && (top.top_matched.length > 0 || top.top_missing.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {top.top_matched.slice(0, 6).map((m) => (
                <Badge key={`m-${m}`} tone="success" size="xs">
                  {m}
                </Badge>
              ))}
              {top.top_missing.slice(0, 4).map((m) => (
                <Badge key={`x-${m}`} tone="outline" size="xs">
                  Missing: {m}
                </Badge>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
            className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
            {open ? "Hide full breakdown" : "See how this score was calculated"}
          </button>
          {open && <MatchBreakdown match={match} className="mt-4 animate-fade-in" />}
        </div>
      ) : (
        <p className="text-sm text-muted">This job hasn&apos;t been scored yet.</p>
      )}

      {concerns.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft/30 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4 text-warning" aria-hidden /> Things to consider
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {concerns.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {company && (company.description || company.facts.length > 0) && (
        <div className="border-t border-border pt-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">About {company.name}</p>
            <Link href={`/companies/${company.id}`} className="text-sm font-medium text-primary hover:underline">
              Full research
            </Link>
          </div>
          {company.description && <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-muted">{company.description}</p>}
          {company.facts.length > 0 && (
            <ul className="mt-3 space-y-2">
              {company.facts.slice(0, 3).map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Badge tone={FACT_TONE[f.kind]} size="xs" className="mt-0.5">
                    {titleCase(f.kind)}
                  </Badge>
                  <span className="min-w-0 text-muted">
                    {f.text} <span className="text-caption text-subtle">— {f.source}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ skeleton

function PrepareSkeleton() {
  return (
    <div role="status" aria-label="Loading application">
      <div className="flex items-start gap-4">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="size-20 rounded-full" />
      </div>
      <Skeleton className="mt-6 h-10 w-full" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={5} />
        </div>
        <div className="hidden rounded-xl border border-border bg-surface p-5 lg:block">
          <PreviewPanelSkeleton />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

// ------------------------------------------------------------------ screen

export function PrepareScreen({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const q = useApplication(applicationId);
  const detail = q.data;
  const isSubmitted = !!detail && SUBMITTED_STATUSES.includes(detail.status);
  const prepared = !!detail && (!!detail.resume_version || !!detail.prepared_at);
  const previewQ = useApplicationPreview(applicationId, prepared && !isSubmitted);
  const preview = previewQ.data;

  const approve = useApproveApplication(applicationId);
  const submit = useSubmitApplication(applicationId);

  const [flow, setFlow] = React.useState<Flow>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmKey, setConfirmKey] = React.useState(0);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [coverOpen, setCoverOpen] = React.useState(false);
  const [matchOpen, setMatchOpen] = React.useState(false);

  if (q.isLoading) return <PrepareSkeleton />;
  if (q.error || !detail) {
    if (q.error instanceof ApiError && q.error.status === 404) {
      return (
        <EmptyState
          icon={<SearchX />}
          title="We couldn't find this application"
          description="It may have been deleted, or the link is out of date. Your other applications are safe."
          action={
            <Button asChild>
              <Link href="/applications">Go to Applications</Link>
            </Button>
          }
        />
      );
    }
    return <ErrorState error={q.error} title="We couldn't load this application" onRetry={() => q.refetch()} />;
  }

  const handoff = flow?.stage === "handoff" ? flow.result : !isSubmitted ? resultFromDetail(detail) : null;
  const stage: JourneyStep =
    flow?.stage === "done" || isSubmitted ? "track" : handoff ? "apply" : confirmOpen ? "confirm" : "review";
  const destination = preview?.destination ?? hostFromUrl(detail.apply_url ?? detail.url);
  const backHref = detail.job_id ? `/jobs/${detail.job_id}` : "/applications";

  const openConfirm = () => {
    setConfirmError(null);
    setConfirmKey((k) => k + 1);
    setConfirmOpen(true);
  };

  const reviewAll = () => {
    setConfirmOpen(false);
    setCoverOpen(true);
    setMatchOpen(true);
    scrollToSection("prepare-top");
  };

  const cancel = () => {
    toast("Saved as draft — nothing was sent", {
      description: "Your documents and answers are kept. Pick up where you left off from Applications.",
    });
    router.push(backHref);
  };

  const runSubmit = async () => {
    const result = await submit.mutateAsync();
    setFlow({ stage: "handoff", result });
    scrollToSection("prepare-top");
    return result;
  };

  const doApply = async (acknowledge: boolean) => {
    setConfirmError(null);
    try {
      await approve.mutateAsync({ acknowledge_answers: acknowledge });
    } catch (e) {
      setConfirmError(errorMessage(e, "We couldn't record your approval. Please try again."));
      return;
    }
    try {
      const result = await runSubmit();
      setConfirmOpen(false);
      toast.success("Approval recorded", {
        description:
          result.state === "pending_user"
            ? "Next: finish on the employer's site, then confirm here."
            : result.message,
      });
    } catch (e) {
      setConfirmError(
        `${errorMessage(e, "We couldn't start the submission.")} Your approval is saved — nothing has been sent.`,
      );
    }
  };

  const retrySubmit = () => {
    runSubmit().catch((e) => {
      toast.error(errorMessage(e, "We couldn't retry the submission."), {
        description: "If your approval expired, review and approve again.",
      });
      setFlow(null);
    });
  };

  const onNavigate = (target: ReadinessTarget) => {
    if (target === "answers") scrollToSection("questions");
    if (target === "cover_letter") {
      setCoverOpen(true);
      scrollToSection("cover-letter");
    }
    if (target === "resume") {
      scrollToSection("resume");
      if (detail.resume_version) setReviewOpen(true);
    }
  };

  const concerns = Array.from(new Set([...(preview?.concerns ?? []), ...(detail.match?.concerns ?? [])]));
  const answersDone = preview ? `${preview.answers_completed}/${preview.answers_total} complete` : undefined;

  let body: React.ReactNode;
  if (flow?.stage === "done") {
    body = <AppliedSuccess detail={flow.detail} />;
  } else if (isSubmitted) {
    body = <AppliedSummary detail={detail} />;
  } else if (handoff) {
    body = (
      <HandoffPanel
        detail={detail}
        result={handoff}
        retrying={submit.isPending}
        onRetrySubmit={retrySubmit}
        onConfirmed={(d) => {
          setFlow({ stage: "done", detail: d });
          scrollToSection("prepare-top");
          toast.success("Application recorded as Applied");
        }}
        onNotSubmitted={() => setFlow(null)}
      />
    );
  } else if (!prepared) {
    body = <PrepareStart detail={detail} />;
  } else {
    const previewCard = previewQ.isLoading ? (
      <PreviewPanelSkeleton />
    ) : previewQ.error || !preview ? (
      <ErrorState compact error={previewQ.error} title="Preview unavailable" onRetry={() => previewQ.refetch()} />
    ) : null;

    body = (
      <>
        <div className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-0 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-6">
            {detail.submission_state === "failed" && (
              <Callout tone="warning" icon={<AlertTriangle />} title="Your last submission attempt didn't go through">
                Nothing was sent to {detail.company_name}. Review your application and press Apply Now to try again.
              </Callout>
            )}
            <SectionCard
              id="readiness"
              icon={<ClipboardCheck />}
              title="Application Readiness"
              description="What the employer needs, and whether you have it."
            >
              <ReadinessChecklist items={detail.readiness} applicationId={detail.id} onNavigate={onNavigate} />
            </SectionCard>

            <section id="documents" aria-labelledby="documents-title" className="scroll-mt-24 space-y-3">
              <div className="flex items-center gap-3 px-1">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg" aria-hidden>
                  <FileStack className="size-[18px]" />
                </span>
                <div>
                  <h2 id="documents-title" className="text-h2 font-semibold">
                    Documents
                  </h2>
                  <p className="text-sm text-muted">Tailored for this job. Review every change before it&apos;s used.</p>
                </div>
              </div>
              <ResumeDocumentCard detail={detail} reviewOpen={reviewOpen} onReviewOpenChange={setReviewOpen} />
              <CoverLetterCard detail={detail} open={coverOpen} onOpenChange={setCoverOpen} />
            </section>

            <SectionCard
              id="questions"
              icon={<MessageSquareText />}
              title="Application Questions"
              description="Edit anything — changes save automatically."
              actions={answersDone ? <span className="text-sm text-muted">{answersDone}</span> : undefined}
            >
              <AnswersSection answers={detail.answers} applicationId={detail.id} />
            </SectionCard>

            <SectionCard id="match" icon={<Radar />} title="Why this job fits" description="Match summary and company research.">
              <MatchAndResearch detail={detail} concerns={concerns} open={matchOpen} onOpenChange={setMatchOpen} />
            </SectionCard>
          </div>

          <aside className="hidden lg:block" aria-label="Application preview">
            <div className="sticky top-24">
              <Card className="overflow-hidden">
                <div className="h-1 bg-gradient-brand" aria-hidden />
                <div className="p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <Eyebrow>Application Preview</Eyebrow>
                    <Sparkles className="size-4 text-primary" aria-hidden />
                  </div>
                  {previewCard ??
                    (preview && (
                      <PreviewContent
                        preview={preview}
                        onReview={reviewAll}
                        onApply={openConfirm}
                        onCancel={cancel}
                        applying={approve.isPending || submit.isPending}
                      />
                    ))}
                </div>
              </Card>
            </div>
          </aside>
        </div>

        <MobileApplyBar preview={preview} onApply={openConfirm} applying={approve.isPending || submit.isPending}>
          {(close) =>
            previewCard ??
            (preview && (
              <PreviewContent
                preview={preview}
                onReview={() => {
                  close();
                  reviewAll();
                }}
                onApply={() => {
                  close();
                  openConfirm();
                }}
                onCancel={() => {
                  close();
                  cancel();
                }}
              />
            ))
          }
        </MobileApplyBar>

        <ConfirmApplyDialog
          key={confirmKey}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          detail={detail}
          preview={preview}
          loading={approve.isPending || submit.isPending}
          error={confirmError}
          onConfirm={doApply}
          onReviewAgain={reviewAll}
        />
      </>
    );
  }

  return (
    <div id="prepare-top" className="scroll-mt-24 focus:outline-none">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
        <Link href={backHref}>
          <ArrowLeft /> {detail.job_id ? "Back to job" : "Back to applications"}
        </Link>
      </Button>
      <Header detail={detail} destination={destination} />
      <JourneyStepper current={stage} className="my-6" />
      {body}
    </div>
  );
}
