"use client";

import * as React from "react";
import Link from "next/link";
import {
  Ban,
  Bot,
  ChevronDown,
  Eye,
  FlaskConical,
  Globe,
  Lock,
  MailX,
  PlugZap,
  Search,
  Settings2,
  ShieldCheck,
  ShieldOff,
  UserRound,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useAgentSettings, useAgentTasks, useAudit, useUpdateAgentSettings } from "@/lib/queries/agent";
import type { AgentSettings, AgentSourceStatus, AgentTask, AuditEntry } from "@/lib/types";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton, SkeletonList } from "@/components/ui/feedback";
import { SwitchRow } from "@/components/ui/primitives";
import { AgentStepList } from "@/components/app/agent-progress";
import { formatDuration, TaskStatusBadge, TRIGGER_LABEL, taskResultEntries } from "./agent-run";

// ------------------------------------------------------------------ sources

const SOURCE_STATE: Record<AgentSourceStatus["status"], { label: string; tone: BadgeTone }> = {
  ready: { label: "Ready", tone: "success" },
  not_connected: { label: "Not connected", tone: "neutral" },
  demo: { label: "Demo data", tone: "info" },
  unavailable: { label: "Unavailable", tone: "warning" },
};

function SourceIcon({ sourceKey }: { sourceKey: string }) {
  if (sourceKey.includes("company")) return <Globe className="size-4" />;
  return <Search className="size-4" />;
}

export function SourcesCard({ sources, demoMode }: { sources: AgentSourceStatus[]; demoMode: boolean }) {
  const needsSetup = sources.some((s) => s.status === "not_connected");
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Job sources</CardTitle>
          <CardDescription>Where your agent looks for jobs.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {sources.length === 0 ? (
          <p className="text-sm text-muted">No sources configured yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sources.map((s) => {
              const st = SOURCE_STATE[s.status];
              return (
                <li key={s.key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-muted">
                    <SourceIcon sourceKey={s.key} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{s.label}</p>
                      <Badge tone={st.tone} size="xs" dot>
                        {st.label}
                      </Badge>
                    </div>
                    {s.note && <p className="mt-0.5 text-sm text-muted">{s.note}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {demoMode && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-info-soft/60 px-3 py-2 text-sm text-muted">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            Demo mode is on — some results are sample jobs so you can explore safely.
          </p>
        )}
        <Button asChild variant={needsSetup ? "soft" : "ghost"} size="sm" className="mt-4 w-full">
          <Link href="/settings?tab=integrations">
            <PlugZap /> {needsSetup ? "Connect sources" : "Manage connections"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ run history

function HistoryRow({ task }: { task: AgentTask }) {
  const [open, setOpen] = React.useState(false);
  const results = taskResultEntries(task);
  const panelId = React.useId();
  return (
    <li className={cn("rounded-xl transition-colors", open && "bg-bg-subtle")}>
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-3 text-left hover:bg-bg-subtle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate text-sm font-medium">{task.title}</p>
          <p className="mt-0.5 text-caption text-subtle">
            {TRIGGER_LABEL[task.trigger]} ·{" "}
            <time dateTime={task.created_at} title={formatDateTime(task.created_at)}>
              {relativeTime(task.started_at ?? task.created_at)}
            </time>{" "}
            · {formatDuration(task.started_at, task.finished_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {results.slice(0, 3).map((r) => (
            <Badge key={r.key} tone="outline" size="xs">
              <span className="tabular font-semibold text-text">{r.value}</span> {r.label.toLowerCase()}
            </Badge>
          ))}
        </div>
        <TaskStatusBadge status={task.status} size="xs" />
        <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="px-3 pb-4">
          {task.steps.length > 0 ? (
            <AgentStepList steps={task.steps} />
          ) : (
            <p className="text-sm text-muted">No step details were recorded for this run.</p>
          )}
          {task.error && <p className="mt-2 text-sm text-warning">{task.error}</p>}
        </div>
      )}
    </li>
  );
}

export function RunHistoryCard() {
  const tasks = useAgentTasks(20);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Run history</CardTitle>
          <CardDescription>Every search and analysis your agent has performed.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-3">
        {tasks.isLoading ? (
          <SkeletonList count={3} className="px-2" />
        ) : tasks.isError ? (
          <ErrorState compact error={tasks.error} title="We couldn't load the run history" onRetry={() => tasks.refetch()} />
        ) : !tasks.data?.length ? (
          <EmptyState compact icon={<Bot />} title="No runs yet" description="When your agent runs, each run and its results will be listed here." />
        ) : (
          <ul className="space-y-1">
            {tasks.data.map((t) => (
              <HistoryRow key={t.id} task={t} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ controls

type AutoKey = Exclude<keyof AgentSettings, "search_frequency" | "auto_submit" | "sources" | "strong_match_threshold">;

const AUTO_ACTIONS: { key: AutoKey; label: string; description: string }[] = [
  { key: "auto_search", label: "Search for jobs", description: "Look for new postings on your schedule." },
  { key: "auto_dedupe", label: "Merge duplicate postings", description: "Combine the same job found on several sites into one record." },
  { key: "auto_analyze", label: "Analyze job descriptions", description: "Extract skills, requirements and red flags from each posting." },
  { key: "auto_score", label: "Score matches", description: "Compare each job with your profile and explain the score." },
  { key: "auto_company_research", label: "Research companies", description: "Collect public facts about employers you're considering." },
  { key: "auto_customize_resume", label: "Draft tailored resumes", description: "Prepare a resume version for strong matches — you review every change." },
  { key: "auto_cover_letter", label: "Draft cover letters", description: "Write a first draft for strong matches — never sent without you." },
  { key: "notify_on_strong_match", label: "Notify me about strong matches", description: "Get a notification when a job scores above your threshold." },
];

export function AgentControlsCard() {
  const settings = useAgentSettings();
  const update = useUpdateAgentSettings();

  const save = (patch: Partial<AgentSettings>, message: string) =>
    update.mutate(patch, {
      onSuccess: () => toast.success(message),
      onError: (e) => toast.error("Couldn't save that change", { description: errorMessage(e) }),
    });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="size-4 text-subtle" aria-hidden /> Agent controls
          </CardTitle>
          <CardDescription>Choose what your agent does on its own. You can change this any time.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {settings.isLoading ? (
          <div className="space-y-4" aria-hidden>
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : settings.isError || !settings.data ? (
          <ErrorState compact error={settings.error} title="We couldn't load your agent settings" onRetry={() => settings.refetch()} />
        ) : (
          <>
            <Field label="How often should your agent search?" hint="Scheduled runs use your job preferences from your profile.">
              <Select
                value={settings.data.search_frequency}
                onChange={(e) =>
                  save({ search_frequency: e.target.value as AgentSettings["search_frequency"] }, "Search schedule updated")
                }
              >
                <option value="manual">Only when I ask</option>
                <option value="daily">Once a day</option>
                <option value="several_daily">Several times a day</option>
              </Select>
            </Field>

            <div className="mt-4 divide-y divide-border">
              {AUTO_ACTIONS.map((a) => (
                <SwitchRow
                  key={a.key}
                  label={a.label}
                  description={a.description}
                  checked={!!settings.data[a.key]}
                  onCheckedChange={(v) => save({ [a.key]: v } as Partial<AgentSettings>, `${a.label}: ${v ? "on" : "off"}`)}
                />
              ))}
              <SwitchRow
                label="Submit applications automatically"
                badge={
                  <Badge tone="neutral" size="xs">
                    <Lock className="size-3" aria-hidden /> Always off
                  </Badge>
                }
                description="Applier never submits an application for you. Every submission needs your explicit approval, one application at a time."
                checked={false}
                onCheckedChange={() => undefined}
                disabled
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ transparency

const NEVER = [
  { icon: ShieldCheck, title: "Never submit without your approval", body: "You review and approve every application before it goes anywhere." },
  { icon: UserX, title: "Never invent experience", body: "Resumes and answers only use facts from your profile. Gaps are shown, not hidden." },
  { icon: ShieldOff, title: "Never bypass CAPTCHAs or security", body: "If a site asks for a human check, the agent stops and hands it to you." },
  { icon: MailX, title: "Never read unrelated emails", body: "Email access is limited to job-application messages you've allowed." },
];

export function NeverDoCard() {
  return (
    <Card className="relative overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <CardHeader className="relative">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Ban className="size-4 text-primary" aria-hidden /> What your agent will never do
          </CardTitle>
          <CardDescription>These limits are built in and can&apos;t be turned off.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="relative">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {NEVER.map((n) => (
            <li key={n.title} className="flex gap-3 rounded-xl border border-border bg-surface/80 p-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-fg">
                <n.icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="mt-0.5 text-sm text-muted">{n.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ activity

const ACTOR: Record<AuditEntry["actor"], { icon: typeof Bot; label: string; className: string }> = {
  agent: { icon: Bot, label: "Agent", className: "bg-primary-soft text-primary-soft-fg" },
  user: { icon: UserRound, label: "You", className: "bg-accent-soft text-accent" },
  system: { icon: Eye, label: "System", className: "bg-bg-subtle text-muted" },
};

export function ActivityFeedCard() {
  const audit = useAudit(20);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>A transparent log of everything you and your agent did.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {audit.isLoading ? (
          <div className="space-y-4" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : audit.isError ? (
          <ErrorState compact error={audit.error} title="We couldn't load recent activity" onRetry={() => audit.refetch()} />
        ) : !audit.data?.length ? (
          <p className="py-6 text-center text-sm text-muted">No activity yet. Actions you and your agent take will appear here.</p>
        ) : (
          <ol className="relative space-y-0">
            {audit.data.map((e, i) => {
              const a = ACTOR[e.actor] ?? ACTOR.system;
              return (
                <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < audit.data.length - 1 && <span className="absolute left-4 top-9 h-[calc(100%-28px)] w-px bg-border" aria-hidden />}
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", a.className)}>
                    <a.icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-sm">
                      <span className="sr-only">{a.label}: </span>
                      {e.summary}
                    </p>
                    <p className="mt-0.5 text-caption text-subtle">
                      {a.label} ·{" "}
                      <time dateTime={e.created_at} title={formatDateTime(e.created_at)}>
                        {relativeTime(e.created_at)}
                      </time>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
