"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, CalendarPlus, Kanban, Sparkles, Video } from "lucide-react";
import { INTERVIEW_KIND_LABELS } from "@/lib/constants";
import type { Interview } from "@/lib/types";
import { useInterviews } from "@/lib/queries/interviews";
import { formatDateTime, parseDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { InterviewRow } from "@/components/interviews/interview-agenda";
import { ScheduleInterviewDialog } from "@/components/interviews/schedule-interview-dialog";
import { countdown, dayBucket, dayLabel, useNow, type DayBucket } from "@/components/interviews/time";

const GROUPS: { key: DayBucket; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "unscheduled", label: "Date to be confirmed" },
];

function isPast(i: Interview, now: number) {
  const d = parseDate(i.scheduled_at);
  if (i.outcome && i.outcome !== "pending") return true;
  if (!d) return false;
  return d.getTime() + (i.duration_minutes ?? 60) * 60_000 < now;
}

function NextUpHero({ interview, now }: { interview: Interview; now: number }) {
  const cd = countdown(interview.scheduled_at, now, interview.duration_minutes ?? 60);
  return (
    <section
      aria-label="Next interview"
      className="relative mb-6 overflow-hidden rounded-2xl border border-primary/25 bg-surface p-5 shadow-glow sm:p-6"
    >
      <div className="bg-aurora pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="bg-gradient-brand flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-glow" aria-hidden>
          <CalendarClock className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-primary">
            Next up{cd ? ` · ${cd.label}` : ""}
          </p>
          <p className="mt-1 text-h2 font-semibold">
            {INTERVIEW_KIND_LABELS[interview.kind] ?? "Interview"} with {interview.company_name}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {interview.job_title} · {dayLabel(interview.scheduled_at, now)}, {formatDateTime(interview.scheduled_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {interview.meeting_url && (
            <Button asChild variant="secondary">
              <a href={interview.meeting_url} target="_blank" rel="noopener noreferrer">
                <Video /> Meeting link
              </a>
            </Button>
          )}
          <Button asChild variant="gradient">
            <Link href={`/interviews/${interview.id}`}>
              <Sparkles /> Open prep <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function AgendaSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading interviews">
      <Skeleton className="h-28 rounded-2xl" />
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g} className="space-y-2.5">
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 2 }).map((__, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export default function InterviewsPage() {
  const { data, isLoading, error, refetch } = useInterviews();
  const now = useNow(30_000);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [tab, setTab] = React.useState("upcoming");

  const { upcoming, past, groups, next } = React.useMemo(() => {
    const all = data ?? [];
    const time = (i: Interview) => parseDate(i.scheduled_at)?.getTime() ?? Infinity;
    const upcoming = all.filter((i) => !isPast(i, now)).sort((a, b) => time(a) - time(b));
    const past = all.filter((i) => isPast(i, now)).sort((a, b) => time(b) - time(a));
    const groups = GROUPS.map((g) => ({ ...g, items: upcoming.filter((i) => dayBucket(i.scheduled_at, now) === g.key || (g.key === "today" && dayBucket(i.scheduled_at, now) === "past")) })).filter(
      (g) => g.items.length,
    );
    const next = upcoming.find((i) => i.scheduled_at);
    return { upcoming, past, groups, next };
  }, [data, now]);

  const awaiting = past.filter((i) => !i.outcome || i.outcome === "pending").length;

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.12em] text-subtle">
            <CalendarClock className="size-3.5" /> Interviews
          </span>
        }
        title="Interview Schedule"
        description="Your upcoming conversations, with a tailored preparation plan for each one."
        actions={
          <Button onClick={() => setScheduleOpen(true)}>
            <CalendarPlus /> Schedule interview
          </Button>
        }
      />

      {isLoading ? (
        <AgendaSkeleton />
      ) : error ? (
        <ErrorState error={error} title="We couldn't load your interviews" onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState
          icon={<CalendarClock />}
          title="No Interviews Yet"
          description="When an employer invites you to talk, schedule it here. Applier will build a preparation plan with likely questions, STAR stories and talking points."
          action={
            <Button onClick={() => setScheduleOpen(true)}>
              <CalendarPlus /> Schedule interview
            </Button>
          }
          secondaryAction={
            <Button asChild variant="ghost">
              <Link href="/applications">
                <Kanban /> View pipeline
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {next && <NextUpHero interview={next} now={now} />}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Interview lists">
              <TabsTrigger value="upcoming">
                Upcoming <span className="tabular text-subtle">{upcoming.length}</span>
              </TabsTrigger>
              <TabsTrigger value="past">
                Past <span className="tabular text-subtle">{past.length}</span>
                {awaiting > 0 && <span className="size-1.5 rounded-full bg-warning" aria-label={`${awaiting} awaiting outcome`} />}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming">
              {groups.length === 0 ? (
                <EmptyState
                  compact
                  icon={<CalendarClock />}
                  title="Nothing on the calendar"
                  description="No upcoming interviews right now. Keep applying — your next conversation is coming."
                  action={
                    <Button variant="secondary" onClick={() => setScheduleOpen(true)}>
                      <CalendarPlus /> Schedule interview
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-7">
                  {groups.map((g) => (
                    <section key={g.key} aria-labelledby={`group-${g.key}`}>
                      <h2 id={`group-${g.key}`} className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
                        {g.label}
                        <span className="tabular rounded-full bg-bg-subtle px-1.5 text-[11px] text-muted">{g.items.length}</span>
                        <span className="h-px flex-1 bg-border" aria-hidden />
                      </h2>
                      <ul className="space-y-2.5">
                        {g.items.map((i) => (
                          <li key={i.id}>
                            {(g.key === "week" || g.key === "later") && (
                              <p className="mb-1 pl-1 text-caption font-medium text-subtle">{dayLabel(i.scheduled_at, now)}</p>
                            )}
                            <InterviewRow interview={i} now={now} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="past">
              {past.length === 0 ? (
                <EmptyState compact icon={<CalendarClock />} title="No past interviews" description="Completed interviews and their outcomes will be listed here." />
              ) : (
                <>
                  {awaiting > 0 && (
                    <p className="mb-3 text-sm text-muted">
                      {awaiting === 1 ? "1 interview is" : `${awaiting} interviews are`} waiting for an outcome — update it to keep your analytics accurate.
                    </p>
                  )}
                  <ul className="space-y-2.5">
                    {past.map((i) => (
                      <li key={i.id}>
                        <InterviewRow interview={i} now={now} past />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <ScheduleInterviewDialog open={scheduleOpen} onOpenChange={setScheduleOpen} />
    </div>
  );
}
