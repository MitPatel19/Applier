"use client";

import * as React from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useCreateJobSearch, useUpdateJobSearch } from "@/lib/queries/jobs";
import type { JobSearch, SearchFilters, SourceKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";

export const SCHEDULES: { value: JobSearch["schedule"]; label: string; description: string }[] = [
  { value: "manual", label: "Only when I run it", description: "Nothing runs in the background." },
  { value: "daily", label: "Once a day", description: "Fresh jobs every morning." },
  { value: "several_daily", label: "Several times a day", description: "Best for competitive roles — catch postings early." },
];

export function scheduleLabel(s: JobSearch["schedule"]) {
  return s === "manual" ? "Manual" : s === "daily" ? "Daily" : "Several times a day";
}

export function SaveSearchDialog({
  open,
  onOpenChange,
  defaultName,
  editing,
  filters,
  sources,
  queryText,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultName: string;
  editing: JobSearch | null;
  filters: SearchFilters;
  sources: SourceKey[];
  queryText: string | null;
  onSaved?: (s: JobSearch) => void;
}) {
  const [name, setName] = React.useState(editing?.name ?? defaultName);
  const [schedule, setSchedule] = React.useState<JobSearch["schedule"]>(editing?.schedule ?? "daily");
  const [error, setError] = React.useState<string | null>(null);
  const create = useCreateJobSearch();
  const update = useUpdateJobSearch();
  const pending = create.isPending || update.isPending;

  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(editing?.name ?? defaultName);
      setSchedule(editing?.schedule ?? "daily");
      setError(null);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give your search a name so you can find it later.");
    const body = { name: name.trim(), filters, sources, schedule, query_text: queryText };
    const onError = (err: unknown) => toast.error("Couldn't save this search", { description: errorMessage(err) });
    if (editing) {
      update.mutate(
        { id: editing.id, ...body },
        {
          onSuccess: (s) => {
            toast.success("Search updated", { description: s.schedule === "manual" ? "Run it whenever you like." : `It will run ${scheduleLabel(s.schedule).toLowerCase()}.` });
            onOpenChange(false);
            onSaved?.(s);
          },
          onError,
        },
      );
    } else {
      create.mutate(
        { ...body, is_active: true },
        {
          onSuccess: (s) => {
            toast.success("Search saved", {
              description:
                s.schedule === "manual"
                  ? "Find it under Saved searches and run it any time."
                  : `Your agent will run it ${scheduleLabel(s.schedule).toLowerCase()} and notify you about strong matches.`,
            });
            onOpenChange(false);
            onSaved?.(s);
          },
          onError,
        },
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Update saved search" : "Save this search"}
      description="Saved searches can run automatically. You'll always review results before anything is prepared or sent."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="save-search-form" loading={pending}>
            {editing ? "Save changes" : "Save search"}
          </Button>
        </>
      }
    >
      <form id="save-search-form" onSubmit={submit} className="space-y-5" noValidate>
        <Field label="Name" required error={error}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="Junior Python — Thunder Bay + Remote"
            autoFocus
          />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">How often should it run?</legend>
          <div className="space-y-2">
            {SCHEDULES.map((s) => (
              <label
                key={s.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                  schedule === s.value ? "border-primary bg-primary-soft/50" : "border-border hover:border-border-strong",
                )}
              >
                <input
                  type="radio"
                  name="schedule"
                  value={s.value}
                  checked={schedule === s.value}
                  onChange={() => setSchedule(s.value)}
                  className="mt-1 accent-[var(--primary)]"
                />
                <span>
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-sm text-muted">{s.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {schedule !== "manual" && (
          <Callout tone="info">Scheduled searches only find and score jobs. Applications are never submitted automatically.</Callout>
        )}
      </form>
    </Dialog>
  );
}
