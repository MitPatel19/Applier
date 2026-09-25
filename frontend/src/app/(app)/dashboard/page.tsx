"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Kanban, Radar, Search } from "lucide-react";
import { useDashboard } from "@/lib/queries/dashboard";
import { useAgentStatus } from "@/lib/queries/core";
import type { Dashboard } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Eyebrow } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton, SkeletonCard } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { RunAgentButton } from "@/components/agent/run-agent";
import { AgentStatusCard, DashboardHero } from "@/components/dashboard/hero";
import {
  ActionRequired,
  CompactJobList,
  DemoDataCallout,
  FollowUpsDue,
  OnboardingBanner,
  OpportunityCard,
  PipelineMini,
  ProfileNudge,
  ReadyToApply,
  StatGroup,
  UpcomingInterviews,
} from "@/components/dashboard/widgets";

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading your dashboard">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8" aria-hidden>
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="mt-5 h-9 w-3/4" />
            <Skeleton className="mt-3 h-5 w-1/2" />
            <div className="mt-6 flex gap-2">
              <Skeleton className="h-10 w-44" />
              <Skeleton className="h-10 w-36" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
          <SkeletonCard lines={4} />
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
        </div>
        <div className="space-y-6">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function FirstRunEmpty() {
  return (
    <EmptyState
      icon={<Radar />}
      title="No jobs yet — run your first search"
      description="Your Career Agent will search LinkedIn, Indeed and employer websites, merge duplicates, and explain how well each job fits you. Nothing is ever submitted without your approval."
      action={<RunAgentButton label="Run your first search" />}
      secondaryAction={
        <Button asChild variant="secondary">
          <Link href="/jobs/search">
            <Search /> Describe your ideal job
          </Link>
        </Button>
      }
    />
  );
}

function TopOpportunities({ data }: { data: Dashboard }) {
  if (data.job_search.found === 0) return <FirstRunEmpty />;
  return (
    <section aria-labelledby="top-opps" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Eyebrow>Top opportunities</Eyebrow>
          <h2 id="top-opps" className="mt-1 text-h2 font-semibold">
            Best matches for you right now
          </h2>
        </div>
        <Link href="/jobs/recommended" className="text-sm font-medium text-primary hover:underline">
          See all recommended
        </Link>
      </div>
      {data.top_opportunities.length === 0 ? (
        <Card className="p-6 text-sm text-muted">
          No strong matches yet. Try widening your search or{" "}
          <Link href="/profile" className="font-medium text-primary hover:underline">
            adding skills to your profile
          </Link>{" "}
          so the agent can recognise more good fits.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.top_opportunities.slice(0, 4).map((j, i) => (
            <OpportunityCard key={j.id} job={j} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function JobLists({ data }: { data: Dashboard }) {
  return (
    <Card>
      <Tabs defaultValue="new">
        <CardHeader className="flex-wrap pb-0">
          <CardTitle>Your jobs</CardTitle>
          <TabsList aria-label="Job lists">
            <TabsTrigger value="new">New · {data.new_jobs.length}</TabsTrigger>
            <TabsTrigger value="closing">Closing soon · {data.closing_soon.length}</TabsTrigger>
            <TabsTrigger value="saved">Saved · {data.saved_jobs.length}</TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent>
          <TabsContent value="new" className="mt-3">
            <CompactJobList jobs={data.new_jobs} empty="No new jobs since your last visit." />
            <div className="mt-3 text-right">
              <Link href="/jobs?view=new" className="text-sm font-medium text-primary hover:underline">
                View all new jobs
              </Link>
            </div>
          </TabsContent>
          <TabsContent value="closing" className="mt-3">
            <CompactJobList jobs={data.closing_soon} empty="No deadlines coming up. We'll flag jobs that close soon." showDeadline />
            <div className="mt-3 text-right">
              <Link href="/jobs?view=closing_soon" className="text-sm font-medium text-primary hover:underline">
                View all closing soon
              </Link>
            </div>
          </TabsContent>
          <TabsContent value="saved" className="mt-3">
            <CompactJobList jobs={data.saved_jobs} empty="No saved jobs yet. Tap the bookmark on any job to keep it here." />
            <div className="mt-3 text-right">
              <Link href="/jobs/saved" className="text-sm font-medium text-primary hover:underline">
                View saved jobs
              </Link>
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}

export default function DashboardPage() {
  const dash = useDashboard();
  const agent = useAgentStatus();
  const router = useRouter();

  if (dash.isLoading) return <DashboardSkeleton />;
  if (dash.isError || !dash.data) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <ErrorState
          error={dash.error}
          title="We couldn't load your dashboard"
          onRetry={() => dash.refetch()}
          onContinue={() => router.push("/jobs")}
          continueLabel="Go to jobs instead"
        />
      </div>
    );
  }

  const data = dash.data;
  const showDemo =
    !!agent.data?.demo_mode || [...data.top_opportunities, ...data.new_jobs].some((j) => j.sources.includes("demo"));
  const js = data.job_search;
  const apps = data.applications;

  return (
    <div className="space-y-6">
      {!data.onboarding_completed && <OnboardingBanner />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <div className="animate-rise">
            <DashboardHero data={data} />
          </div>
          {showDemo && <DemoDataCallout />}

          <ActionRequired actions={data.actions} />

          {/* On mobile, time-sensitive items come right after actions. */}
          {data.upcoming_interviews.length > 0 && <UpcomingInterviews items={data.upcoming_interviews} className="lg:hidden" />}
          {data.ready_to_apply.length > 0 && <ReadyToApply items={data.ready_to_apply} className="lg:hidden" />}

          <TopOpportunities data={data} />

          <div className="grid gap-4 xl:grid-cols-2">
            <StatGroup
              eyebrow="Job search"
              icon={<Briefcase />}
              items={[
                { label: "Found", value: js.found, href: "/jobs" },
                { label: "Relevant", value: js.relevant, href: "/jobs/recommended" },
                { label: "Strong", value: js.strong, href: "/jobs?tier=strong", emphasis: true },
                { label: "New", value: js.new, href: "/jobs?view=new" },
              ]}
            />
            <StatGroup
              eyebrow="Applications"
              icon={<Kanban />}
              items={[
                { label: "Applied", value: apps.applied, href: "/applications" },
                { label: "Interviews", value: apps.interviews, href: "/interviews", emphasis: true },
                { label: "Awaiting reply", value: apps.awaiting_response, href: "/applications" },
                { label: "Offers", value: apps.offers, href: "/applications", emphasis: true },
              ]}
            />
          </div>

          {js.found > 0 && <JobLists data={data} />}
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Agent and upcoming">
          <AgentStatusCard />
          <UpcomingInterviews items={data.upcoming_interviews} className={data.upcoming_interviews.length ? "hidden lg:block" : ""} />
          <ReadyToApply items={data.ready_to_apply} className={data.ready_to_apply.length ? "hidden lg:block" : ""} />
          <FollowUpsDue items={data.follow_ups_due} />
          <PipelineMini pipeline={data.pipeline} />
          {data.profile_completeness < 80 && <ProfileNudge percent={data.profile_completeness} />}
        </aside>
      </div>
    </div>
  );
}
