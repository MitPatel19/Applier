"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookmarkPlus, CalendarClock, CircleStop, Pause, Pencil, Play, Radar, Trash, X } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useDeleteJobSearch, useJobSearches, useRunSavedSearch, useUpdateJobSearch } from "@/lib/queries/jobs";
import type { AgentTask, JobSearch } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, SkeletonList } from "@/components/ui/feedback";
import { Tooltip } from "@/components/ui/primitives";
import { AgentTaskProgress } from "@/components/app/agent-progress";
import { taskResultEntries } from "@/components/agent/agent-run";
import { scheduleLabel } from "./save-search-dialog";
import { summarizeFilters } from "./search-filters-form";

// ------------------------------------------------------------------ live run panel

export function SearchRunPanel({ taskId, label, onClose }: { taskId: number; label: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [done, setDone] = React.useState<AgentTask | null>(null);
  const onDone = React.useCallback(
    (task: AgentTask) => {
      setDone(task);
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["agent"] });
      if (task.status === "completed") toast.success("Search complete", { description: "Your new matches are ready to review." });
      else if (task.status === "failed") toast.warning("Search finished with issues", { description: "Some sources didn't respond. Anything found was kept." });
    },
    [qc],
  );
  const results = done ? taskResultEntries(done) : [];

  return (
    <Card className={cn("relative overflow-hidden animate-rise", !done && "shadow-glow")}>
      <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 h-28 opacity-80" aria-hidden />
      <CardHeader className="relative">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow">
            {done ? <CircleStop className="size-5" aria-hidden /> : <Radar className="size-5 animate-pulse" aria-hidden />}
          </span>
          <div className="min-w-0">
            <CardTitle className="truncate">{done ? "Search finished" : "Searching now…"}</CardTitle>
            <CardDescription className="truncate">{label}</CardDescription>
          </div>
        </div>
        {done && (
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onClose}>
            <X />
          </Button>
        )}
      </CardHeader>
      <CardContent className="relative">
        <div className="rounded-xl border border-border bg-surface/90 p-4" role="status" aria-live="polite">
          <AgentTaskProgress taskId={taskId} onDone={onDone} />
        </div>
        {done && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            {results.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {results.slice(0, 4).map((r) => (
                  <Badge key={r.key} tone="outline">
                    <span className="tabular font-semibold text-text">{r.value}</span> {r.label.toLowerCase()}
                  </Badge>
                ))}
              </div>
            )}
            <Button asChild variant="gradient" className="sm:ml-auto">
              <Link href="/jobs?view=recommended">
                View results <ArrowRight />
              </Link>
            </Button>
          </div>
        )}
        {!done && <p className="mt-3 text-caption text-subtle">You can leave this page — the search keeps running and results appear in Jobs.</p>}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ saved list

function SavedSearchRow({
  search,
  onEdit,
  onRun,
  isEditing,
}: {
  search: JobSearch;
  onEdit: (s: JobSearch) => void;
  onRun: (taskId: number, label: string) => void;
  isEditing: boolean;
}) {
  const run = useRunSavedSearch();
  const update = useUpdateJobSearch();
  const del = useDeleteJobSearch();
  const [confirm, setConfirm] = React.useState(false);

  return (
    <li
      className={cn(
        "rounded-xl border border-border bg-surface p-4 transition-shadow",
        isEditing && "border-primary/40 shadow-glow",
        !search.is_active && "bg-bg-subtle/60",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{search.name}</p>
            <Badge tone={search.schedule === "manual" ? "neutral" : "accent"} size="xs">
              {scheduleLabel(search.schedule)}
            </Badge>
            {!search.is_active && (
              <Badge tone="warning" size="xs" dot>
                Paused
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{summarizeFilters(search.filters)}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-subtle">
            <span>
              {search.last_run_at
                ? `Last run ${relativeTime(search.last_run_at)}${search.last_result_count !== null ? ` · ${search.last_result_count} jobs` : ""}`
                : "Never run"}
            </span>
            {search.is_active && search.schedule !== "manual" && search.next_run_at && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3" aria-hidden /> Next {relativeTime(search.next_run_at)}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="soft"
            loading={run.isPending}
            onClick={() =>
              run.mutate(search.id, {
                onSuccess: (task) => onRun(task.id, search.name),
                onError: (e) => toast.error("The search couldn't start", { description: errorMessage(e) }),
              })
            }
          >
            {!run.isPending && <Play />} Run now
          </Button>
          <Tooltip content="Edit">
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${search.name}`} onClick={() => onEdit(search)}>
              <Pencil />
            </Button>
          </Tooltip>
          <Tooltip content={search.is_active ? "Pause scheduled runs" : "Resume scheduled runs"}>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={search.is_active ? `Pause ${search.name}` : `Resume ${search.name}`}
              loading={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: search.id, is_active: !search.is_active },
                  {
                    onSuccess: (s) =>
                      toast.success(s.is_active ? "Search resumed" : "Search paused", {
                        description: s.is_active ? "It will run on its schedule again." : "It won't run automatically until you resume it.",
                      }),
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            >
              {!update.isPending && (search.is_active ? <Pause /> : <Play />)}
            </Button>
          </Tooltip>
          <Tooltip content="Delete">
            <Button size="icon-sm" variant="danger-ghost" aria-label={`Delete ${search.name}`} onClick={() => setConfirm(true)}>
              <Trash />
            </Button>
          </Tooltip>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="danger"
        title={`Delete “${search.name}”?`}
        description="The saved search and its schedule will be removed. Jobs it already found stay in your lists."
        confirmLabel="Delete search"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(search.id, {
            onSuccess: () => {
              setConfirm(false);
              toast.success("Saved search deleted");
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </li>
  );
}

export function SavedSearches({
  editingId,
  onEdit,
  onRun,
}: {
  editingId: number | null;
  onEdit: (s: JobSearch) => void;
  onRun: (taskId: number, label: string) => void;
}) {
  const searches = useJobSearches();
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Saved searches</CardTitle>
          <CardDescription>Run them on demand or let your agent run them on a schedule.</CardDescription>
        </div>
        {searches.data && searches.data.length > 0 && <Badge tone="neutral">{searches.data.length}</Badge>}
      </CardHeader>
      <CardContent>
        {searches.isLoading ? (
          <SkeletonList count={2} />
        ) : searches.isError ? (
          <ErrorState compact error={searches.error} title="We couldn't load your saved searches" onRetry={() => searches.refetch()} />
        ) : !searches.data?.length ? (
          <EmptyState
            compact
            icon={<BookmarkPlus />}
            title="No saved searches yet"
            description="Build a search above and choose “Save search” to have your agent run it automatically."
          />
        ) : (
          <ul className="space-y-3">
            {searches.data.map((s) => (
              <SavedSearchRow key={s.id} search={s} onEdit={onEdit} onRun={onRun} isEditing={editingId === s.id} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
