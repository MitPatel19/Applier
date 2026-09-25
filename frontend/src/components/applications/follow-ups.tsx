"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellPlus, BellRing, Check, FileText, Save, Sparkles, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { FollowUp, TemplateKind } from "@/lib/types";
import {
  useCompleteFollowUp,
  useCreateFollowUp,
  useDeleteFollowUp,
  useFollowUps,
  useGenerateFollowUpMessage,
  useMessageTemplates,
  useRenderTemplate,
  useUpdateFollowUp,
} from "@/lib/queries/followups";
import { cn, parseDate } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, SkeletonList } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/primitives";
import { MessageEditor } from "@/components/networking/message-editor";
import { addDays, dateInputToIso, dayLabel, shortDate, startOfDay, toDateInputValue, useNow } from "@/components/interviews/time";

export const CHANNEL_LABELS: Record<FollowUp["channel"], string> = {
  dashboard: "Dashboard reminder",
  email: "Email reminder",
  manual: "Just track it",
};

/** "Today (Sep 25)" / "Thursday, October 1" */
function dueLabel(due: Date, now: number) {
  const label = dayLabel(due, now);
  return label.includes(",") ? label : `${label} (${shortDate(due)})`;
}

const STATUS: Record<FollowUp["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "info" },
  done: { label: "Done", tone: "success" },
  dismissed: { label: "Dismissed", tone: "neutral" },
  snoozed: { label: "Snoozed", tone: "neutral" },
};

/** Template picker that fills a message from a saved template (follow_up / thank_you / recruiter_message). */
export function TemplateStarter({
  kinds,
  applicationId,
  recruiterId,
  onApply,
}: {
  kinds: TemplateKind[];
  applicationId?: number | null;
  recruiterId?: number | null;
  onApply: (subject: string, body: string) => void;
}) {
  const first = useMessageTemplates(kinds[0]);
  const second = useMessageTemplates(kinds[1] ?? kinds[0]);
  const render = useRenderTemplate();
  const templates = [...(first.data ?? []), ...(kinds[1] ? second.data ?? [] : [])];
  if (!templates.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" loading={render.isPending}>
          <FileText /> Start from template
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your templates</DropdownMenuLabel>
        {templates.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onSelect={() =>
              render.mutate(
                { id: t.id, application_id: applicationId ?? undefined, recruiter_id: recruiterId ?? undefined },
                {
                  onSuccess: (r) => {
                    onApply(r.subject ?? "", r.body);
                    if (r.unresolved.length) toast.message("Some placeholders need your input", { description: r.unresolved.join(", ") });
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                },
              )
            }
          >
            <span className="truncate">{t.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FollowUpCard({ followUp, email, compact }: { followUp: FollowUp; email?: string | null; compact?: boolean }) {
  const now = useNow();
  const generate = useGenerateFollowUpMessage();
  const update = useUpdateFollowUp();
  const complete = useCompleteFollowUp();
  const del = useDeleteFollowUp();
  const [subject, setSubject] = React.useState(followUp.subject ?? "");
  const [body, setBody] = React.useState(followUp.message ?? "");
  const [editorOpen, setEditorOpen] = React.useState(!!followUp.message && !compact);
  const [generatedBy, setGeneratedBy] = React.useState<"template" | "ai" | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const due = parseDate(followUp.due_at);
  const pending = followUp.status === "pending" || followUp.status === "snoozed";
  const overdue = pending && (followUp.is_overdue || (due ? due.getTime() < startOfDay(new Date(now)).getTime() : false));
  const dirty = subject !== (followUp.subject ?? "") || body !== (followUp.message ?? "");

  const onGenerate = () =>
    generate.mutate(followUp.id, {
      onSuccess: (g) => {
        setSubject(g.subject ?? "");
        setBody(g.body);
        setGeneratedBy(g.generated_by);
        setEditorOpen(true);
      },
      onError: (err) => toast.error("Couldn't draft a message", { description: errorMessage(err) }),
    });

  return (
    <article
      className={cn(
        "rounded-xl border bg-surface p-4 transition-colors",
        overdue ? "border-danger/35" : "border-border",
        !pending && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            overdue ? "bg-danger-soft text-danger" : pending ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
          )}
          aria-hidden
        >
          {pending ? <BellRing className="size-4" /> : <Check className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {pending ? (overdue ? "Overdue — " : "Follow up ") : "Followed up · "}
            <span className={cn(overdue && "text-danger")}>{due ? dueLabel(due, now) : "—"}</span>
          </p>
          <p className="mt-0.5 text-caption text-subtle">
            {[followUp.recruiter_name && `With ${followUp.recruiter_name}`, followUp.company_name && compact ? followUp.company_name : null, CHANNEL_LABELS[followUp.channel]]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {followUp.note && <p className="mt-2 text-sm text-muted">{followUp.note}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {!pending && (
            <Badge tone={STATUS[followUp.status].tone} size="xs">
              {STATUS[followUp.status].label}
            </Badge>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Delete follow-up" onClick={() => setConfirmDelete(true)}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {pending && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="soft" onClick={onGenerate} loading={generate.isPending}>
            <Sparkles /> {body ? "Regenerate message" : "Generate message"}
          </Button>
          {!editorOpen && body && (
            <Button size="sm" variant="ghost" onClick={() => setEditorOpen(true)}>
              View draft
            </Button>
          )}
          <TemplateStarter
            kinds={["follow_up", "thank_you"]}
            applicationId={followUp.application_id}
            recruiterId={followUp.recruiter_id}
            onApply={(s, b) => {
              setSubject(s);
              setBody(b);
              setGeneratedBy("template");
              setEditorOpen(true);
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            loading={complete.isPending}
            onClick={() =>
              complete.mutate(followUp.id, {
                onSuccess: () => toast.success("Marked as done", { description: "Nice — staying in touch pays off." }),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            <Check /> Mark done
          </Button>
        </div>
      )}

      {editorOpen && (
        <MessageEditor
          className="mt-3"
          subject={subject}
          body={body}
          onSubjectChange={setSubject}
          onBodyChange={setBody}
          generatedBy={generatedBy}
          email={email}
          rows={8}
          actions={
            dirty ? (
              <Button
                size="sm"
                variant="ghost"
                loading={update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: followUp.id, body: { subject: subject || null, message: body || null } },
                    { onSuccess: () => toast.success("Draft saved"), onError: (err) => toast.error(errorMessage(err)) },
                  )
                }
              >
                <Save /> Save draft
              </Button>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this follow-up?"
        description="The reminder and any drafted message will be removed."
        confirmLabel="Delete"
        tone="danger"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(
            { id: followUp.id, applicationId: followUp.application_id },
            { onSuccess: () => setConfirmDelete(false), onError: (err) => toast.error(errorMessage(err)) },
          )
        }
      />
    </article>
  );
}

/** Follow-up suggestion: applied date + 7 days (or tomorrow if that has already passed). */
export function suggestFollowUpDate(appliedAt: string | null | undefined, now: number) {
  const today = startOfDay(new Date(now));
  const applied = parseDate(appliedAt);
  const base = applied ? addDays(startOfDay(applied), 7) : addDays(today, 7);
  const suggested = base.getTime() <= today.getTime() ? addDays(today, 1) : base;
  const explanation = applied
    ? base.getTime() <= today.getTime()
      ? `Applied ${shortDate(applied)} → a week has passed, so following up tomorrow (${shortDate(suggested)}) is a good idea.`
      : `Applied ${shortDate(applied)} → follow up around ${shortDate(suggested)}.`
    : `Not applied yet → we suggest ${shortDate(suggested)}, a week from today.`;
  return { date: suggested, explanation };
}

function NewFollowUpForm({
  applicationId,
  appliedAt,
  onDone,
}: {
  applicationId: number;
  appliedAt: string | null;
  onDone: () => void;
}) {
  const now = useNow();
  const create = useCreateFollowUp();
  const suggestion = React.useMemo(() => suggestFollowUpDate(appliedAt, now), [appliedAt, now]);
  const [date, setDate] = React.useState(() => toDateInputValue(suggestion.date));
  const [channel, setChannel] = React.useState<FollowUp["channel"]>("dashboard");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  return (
    <form
      className="space-y-4 rounded-xl border border-primary/25 bg-primary-soft/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const iso = dateInputToIso(date);
        if (!iso) return setError("Pick a date for the reminder.");
        setError(null);
        create.mutate(
          { application_id: applicationId, due_at: iso, channel, note: note.trim() || null },
          {
            onSuccess: () => {
              toast.success("Follow-up scheduled");
              onDone();
            },
            onError: (err) => toast.error("Couldn't schedule the follow-up", { description: errorMessage(err) }),
          },
        );
      }}
    >
      <p className="flex items-start gap-2 text-sm text-muted">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {suggestion.explanation}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Follow up on" error={error} required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={toDateInputValue(new Date(now))} />
        </Field>
        <Field label="Remind me via">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as FollowUp["channel"])}>
            {(Object.keys(CHANNEL_LABELS) as FollowUp["channel"][]).map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Note (optional)">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ask about the timeline for the next round" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          <BellPlus /> Schedule follow-up
        </Button>
      </div>
    </form>
  );
}

export function FollowUpsTab({ applicationId, appliedAt, email }: { applicationId: number; appliedAt: string | null; email?: string | null }) {
  const { data, isLoading, error, refetch } = useFollowUps({ application_id: applicationId });
  const [creating, setCreating] = React.useState(false);
  const items = React.useMemo(
    () =>
      [...(data ?? [])].sort((a, b) => {
        const ap = a.status === "pending" ? 0 : 1;
        const bp = b.status === "pending" ? 0 : 1;
        return ap - bp || (parseDate(a.due_at)?.getTime() ?? 0) - (parseDate(b.due_at)?.getTime() ?? 0);
      }),
    [data],
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">A polite check-in a week after applying keeps you top of mind.</p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <BellPlus /> New follow-up
          </Button>
        )}
      </div>
      {creating && <NewFollowUpForm applicationId={applicationId} appliedAt={appliedAt} onDone={() => setCreating(false)} />}
      {isLoading ? (
        <SkeletonList count={2} />
      ) : error ? (
        <ErrorState compact error={error} title="We couldn't load follow-ups" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        !creating && (
          <EmptyState
            compact
            icon={<BellRing />}
            title="No follow-ups scheduled"
            description="Schedule a reminder and Applier will draft a friendly check-in message for you."
            action={
              <Button onClick={() => setCreating(true)}>
                <BellPlus /> Schedule a follow-up
              </Button>
            }
          />
        )
      ) : (
        <div className="space-y-2.5">
          {items.map((f) => (
            <FollowUpCard key={f.id} followUp={f} email={email} />
          ))}
        </div>
      )}
    </div>
  );
}
