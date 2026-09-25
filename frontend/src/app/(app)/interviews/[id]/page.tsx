"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CalendarPlus,
  Clock,
  Code2,
  LayoutGrid,
  MapPin,
  MessageCircleQuestion,
  Mic,
  Pencil,
  Quote,
  RefreshCw,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { ApiError, api, errorMessage } from "@/lib/api";
import { INTERVIEW_KIND_LABELS } from "@/lib/constants";
import type { InterviewDetail } from "@/lib/types";
import { useInterview, useRegeneratePrep } from "@/lib/queries/interviews";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { OutcomeSelect } from "@/components/interviews/interview-agenda";
import { MockInterview } from "@/components/interviews/mock-interview";
import {
  BehavioralSection,
  OverviewSection,
  QuestionsToAskSection,
  TalkingPointsSection,
  TechnicalSection,
} from "@/components/interviews/prep-sections";
import { ScheduleInterviewDialog } from "@/components/interviews/schedule-interview-dialog";
import { countdown, dayLabel, scrollBehavior, useNow } from "@/components/interviews/time";

function PrepSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading interview preparation">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-10 w-full max-w-2xl rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function prepIsEmpty(i: InterviewDetail) {
  const p = i.prep;
  return (
    !p ||
    (!p.company_overview &&
      !p.role_summary &&
      !p.behavioral_questions?.length &&
      !p.technical_questions?.length &&
      !p.star_stories?.length &&
      !p.questions_to_ask?.length)
  );
}

function Header({ interview, now }: { interview: InterviewDetail; now: number }) {
  const [editing, setEditing] = React.useState(false);
  const cd = countdown(interview.scheduled_at, now, interview.duration_minutes ?? 60);
  const isFuture = cd && !cd.past;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="bg-aurora pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">{INTERVIEW_KIND_LABELS[interview.kind] ?? "Interview"}</Badge>
            {cd && (
              <Badge tone={cd.live ? "success" : cd.past ? "neutral" : "primary"} dot={cd.live}>
                {cd.label}
              </Badge>
            )}
          </div>
          <h1 className="mt-2 text-h1 font-semibold">
            {interview.company_name}
            <span className="block text-base font-normal text-muted sm:text-lg">{interview.job_title}</span>
          </h1>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4 text-subtle" />
              {interview.scheduled_at ? `${dayLabel(interview.scheduled_at, now)} · ${formatDateTime(interview.scheduled_at)}` : "Date not set yet"}
            </span>
            {interview.duration_minutes && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4 text-subtle" /> {interview.duration_minutes} min
              </span>
            )}
            {interview.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 text-subtle" /> {interview.location}
              </span>
            )}
            {interview.interviewers.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4 text-subtle" /> {interview.interviewers.join(", ")}
              </span>
            )}
          </div>
          {interview.notes && <p className="mt-3 max-w-2xl rounded-lg bg-bg-subtle/80 px-3 py-2 text-sm text-muted">{interview.notes}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:max-w-xs lg:flex-col lg:items-stretch">
          {interview.meeting_url && (
            <Button asChild variant={cd?.live || isFuture ? "gradient" : "secondary"}>
              <a href={interview.meeting_url} target="_blank" rel="noopener noreferrer">
                <Video /> Join meeting
              </a>
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(true)}>
              <Pencil /> Edit details
            </Button>
            {interview.scheduled_at && (
              <Button asChild variant="secondary" size="icon" aria-label="Add to calendar (.ics)">
                <a href={api.url(`/interviews/${interview.id}/ics`)} download>
                  <CalendarPlus />
                </a>
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface/80 px-3 py-1.5">
            <span className="text-sm text-muted">Outcome</span>
            <OutcomeSelect interview={interview} />
          </div>
        </div>
      </div>
      <ScheduleInterviewDialog open={editing} onOpenChange={setEditing} interview={interview} />
    </div>
  );
}

function InterviewPrepView({ id }: { id: number }) {
  const { data: interview, isLoading, error, refetch } = useInterview(id);
  const regenerate = useRegeneratePrep(id);
  const now = useNow(30_000);
  const [tab, setTab] = React.useState("overview");
  const [practiceQuestion, setPracticeQuestion] = React.useState("");
  const [confirmRegen, setConfirmRegen] = React.useState(false);

  if (isLoading) return <PrepSkeleton />;
  if (error instanceof ApiError && error.status === 404)
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="Interview not found"
        description="It may have been deleted, or the link is incorrect."
        action={
          <Button asChild>
            <Link href="/interviews">Back to interviews</Link>
          </Button>
        }
      />
    );
  if (error || !interview) return <ErrorState error={error} title="We couldn't load this interview" onRetry={() => refetch()} />;

  const practice = (q: string) => {
    setPracticeQuestion(q);
    setTab("mock");
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  };

  const onRegenerate = () =>
    regenerate.mutate(undefined, {
      onSuccess: () => {
        setConfirmRegen(false);
        toast.success("Preparation plan refreshed");
      },
      onError: (err) => toast.error("Couldn't regenerate the prep", { description: errorMessage(err) }),
    });

  const empty = prepIsEmpty(interview);
  const prep = interview.prep;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/interviews" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
          <ArrowLeft className="size-4" /> Interviews
        </Link>
        <Link href={`/applications/${interview.application_id}`} className="text-sm font-medium text-muted hover:text-text">
          View application
        </Link>
      </div>

      <Header interview={interview} now={now} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-h2 font-semibold">
            <Sparkles className="size-5 text-primary" /> Preparation Center
          </h2>
          <p className="text-sm text-muted">
            {prep?.generated_at ? `Prep generated ${formatDate(prep.generated_at)} from the posting, company research and your profile.` : "Built from the posting, company research and your profile."}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setConfirmRegen(true)} loading={regenerate.isPending}>
          <RefreshCw /> Regenerate prep
        </Button>
      </div>

      {empty ? (
        <EmptyState
          icon={<Sparkles />}
          title="Your prep plan isn't ready yet"
          description="Generate a tailored plan with likely questions, STAR stories from your experience and smart questions to ask."
          action={
            <Button onClick={onRegenerate} loading={regenerate.isPending}>
              <Sparkles /> Generate prep
            </Button>
          }
        />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList aria-label="Preparation sections">
              <TabsTrigger value="overview">
                <LayoutGrid /> Overview
              </TabsTrigger>
              <TabsTrigger value="technical">
                <Code2 /> Technical
              </TabsTrigger>
              <TabsTrigger value="behavioral">
                <BookOpen /> Behavioral
              </TabsTrigger>
              <TabsTrigger value="talking">
                <Quote /> Your Talking Points
              </TabsTrigger>
              <TabsTrigger value="ask">
                <MessageCircleQuestion /> Questions to Ask
              </TabsTrigger>
              <TabsTrigger value="mock" className={cn(tab !== "mock" && "text-primary")}>
                <Mic /> Mock Interview
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview">
            <OverviewSection prep={prep} />
          </TabsContent>
          <TabsContent value="technical">
            <TechnicalSection prep={prep} onPractice={practice} />
          </TabsContent>
          <TabsContent value="behavioral">
            <BehavioralSection prep={prep} onPractice={practice} />
          </TabsContent>
          <TabsContent value="talking">
            <TalkingPointsSection prep={prep} />
          </TabsContent>
          <TabsContent value="ask">
            <QuestionsToAskSection prep={prep} />
          </TabsContent>
          <TabsContent value="mock">
            <MockInterview interview={interview} question={practiceQuestion} onQuestionChange={setPracticeQuestion} />
          </TabsContent>
        </Tabs>
      )}

      <ConfirmDialog
        open={confirmRegen}
        onOpenChange={setConfirmRegen}
        title="Regenerate the preparation plan?"
        description="Applier will rebuild questions, STAR stories and talking points using your latest profile. Your practice history is kept."
        confirmLabel="Regenerate"
        loading={regenerate.isPending}
        onConfirm={onRegenerate}
      />
    </div>
  );
}

export default function InterviewPrepPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="Interview not found"
        action={
          <Button asChild>
            <Link href="/interviews">Back to interviews</Link>
          </Button>
        }
      />
    );
  }
  return <InterviewPrepView id={id} />;
}
