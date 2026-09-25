"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { BellRing, CalendarClock, FileText, History, ListChecks, NotebookPen, UserRound } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useApplication } from "@/lib/queries/applications";
import { useRecruiters } from "@/lib/queries/networking";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { ApplicationHeader } from "@/components/applications/detail-header";
import { AnswersTab, DocumentsTab, InterviewsTab, TimelineTab } from "@/components/applications/detail-tabs";
import { FollowUpsTab } from "@/components/applications/follow-ups";
import { NotesTab, RecruiterTab } from "@/components/applications/notes-recruiter";
import { useStatusFlow } from "@/components/pipeline/status-flow";

const TABS = ["timeline", "documents", "answers", "interviews", "follow-ups", "notes", "recruiter"] as const;
type TabKey = (typeof TABS)[number];

function Count({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="tabular rounded-full bg-primary-soft px-1.5 text-[11px] font-semibold text-primary-soft-fg">{n}</span>;
}

function DetailSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading application">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-xl rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function ApplicationDetailView() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { data: app, isLoading, error, refetch } = useApplication(id);
  const recruiters = useRecruiters();
  const flow = useStatusFlow();

  const tabParam = search.get("tab");
  const tab: TabKey = TABS.includes(tabParam as TabKey) ? (tabParam as TabKey) : "timeline";
  const setTab = (t: string) => {
    const next = new URLSearchParams(search.toString());
    if (t === "timeline") next.delete("tab");
    else next.set("tab", t);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (!Number.isFinite(id)) return <NotFound />;
  if (isLoading) return <DetailSkeleton />;
  if (error instanceof ApiError && error.status === 404) return <NotFound />;
  if (error || !app) return <ErrorState error={error} title="We couldn't load this application" onRetry={() => refetch()} />;

  const recruiterEmail = recruiters.data?.find((r) => r.id === app.recruiter_id)?.email ?? null;
  const pendingInterviews = app.interviews.filter((i) => !i.outcome || i.outcome === "pending").length;
  const pendingFollowUps = app.follow_ups.filter((f) => f.status === "pending").length;

  return (
    <div className="animate-fade-in space-y-6">
      <ApplicationHeader app={app} flow={flow} />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList aria-label="Application sections">
            <TabsTrigger value="timeline">
              <History /> Timeline
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileText /> Documents
            </TabsTrigger>
            <TabsTrigger value="answers">
              <ListChecks /> Answers <Count n={app.answers.length} />
            </TabsTrigger>
            <TabsTrigger value="interviews">
              <CalendarClock /> Interviews <Count n={pendingInterviews} />
            </TabsTrigger>
            <TabsTrigger value="follow-ups">
              <BellRing /> Follow-ups <Count n={pendingFollowUps} />
            </TabsTrigger>
            <TabsTrigger value="notes">
              <NotebookPen /> Notes
            </TabsTrigger>
            <TabsTrigger value="recruiter">
              <UserRound /> Recruiter
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-6 [&>[role=tabpanel]]:mt-0">
          <TabsContent value="timeline">
            <TimelineTab app={app} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab app={app} />
          </TabsContent>
          <TabsContent value="answers">
            <AnswersTab app={app} />
          </TabsContent>
          <TabsContent value="interviews">
            <InterviewsTab app={app} />
          </TabsContent>
          <TabsContent value="follow-ups">
            <FollowUpsTab applicationId={app.id} appliedAt={app.applied_at} email={recruiterEmail} />
          </TabsContent>
          <TabsContent value="notes">
            <NotesTab key={app.id} app={app} />
          </TabsContent>
          <TabsContent value="recruiter">
            <RecruiterTab app={app} />
          </TabsContent>
        </div>
      </Tabs>
      {flow.element}
    </div>
  );
}

function NotFound() {
  return (
    <EmptyState
      icon={<FileText />}
      title="Application not found"
      description="It may have been deleted, or the link is incorrect."
      action={
        <Button asChild>
          <Link href="/applications">Back to pipeline</Link>
        </Button>
      }
    />
  );
}

export default function ApplicationDetailPage() {
  return (
    <React.Suspense fallback={<DetailSkeleton />}>
      <ApplicationDetailView />
    </React.Suspense>
  );
}
