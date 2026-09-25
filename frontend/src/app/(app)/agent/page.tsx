"use client";

import * as React from "react";
import { Bot, Sparkles } from "lucide-react";
import { useAgentStatus } from "@/lib/queries/core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState, Skeleton, SkeletonCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { AgentRunHero, AgentSchedule } from "@/components/agent/agent-run";
import { useAgentFinishRefresh } from "@/components/agent/run-agent";
import { ActivityFeedCard, AgentControlsCard, NeverDoCard, RunHistoryCard, SourcesCard } from "@/components/agent/agent-panels";

function HeroSkeleton() {
  return (
    <Card className="p-6" aria-hidden>
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
      </div>
      <Skeleton className="mt-6 h-2 w-full" />
      <div className="mt-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AgentPage() {
  const status = useAgentStatus();
  const data = status.data;
  useAgentFinishRefresh({ notify: false });

  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={
          <Badge tone="primary" size="xs">
            <Bot className="size-3" aria-hidden /> Career Agent
          </Badge>
        }
        title="Your Career Agent"
        description="See exactly what your agent is doing, what it found, and what it's allowed to do on its own. You stay in control of every application."
      >
        {data && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={data.running ? "size-2 rounded-full bg-success animate-pulse-dot" : "size-2 rounded-full bg-border-strong"}
                aria-hidden
              />
              {data.running ? "Working right now" : "Idle — ready when you are"}
            </span>
            {data.ai_writing_available ? (
              <Badge tone="accent" size="xs">
                <Sparkles className="size-3" aria-hidden /> AI writing on
              </Badge>
            ) : (
              <Badge tone="neutral" size="xs">
                Template writing
              </Badge>
            )}
          </p>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          {status.isLoading ? (
            <HeroSkeleton />
          ) : status.isError || !data ? (
            <ErrorState error={status.error} title="We couldn't reach your agent" onRetry={() => status.refetch()} />
          ) : (
            <AgentRunHero status={data} />
          )}
          <RunHistoryCard />
          <ActivityFeedCard />
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Agent settings and sources">
          {data ? (
            <Card>
              <CardContent className="pt-5">
                <AgentSchedule status={data} />
              </CardContent>
            </Card>
          ) : status.isLoading ? (
            <SkeletonCard lines={1} />
          ) : null}
          {data ? <SourcesCard sources={data.sources} demoMode={data.demo_mode} /> : status.isLoading ? <SkeletonCard lines={3} /> : null}
          <AgentControlsCard />
          <NeverDoCard />
        </aside>
      </div>
    </div>
  );
}
