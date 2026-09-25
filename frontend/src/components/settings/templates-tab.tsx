"use client";

import * as React from "react";
import { ArrowLeft, FileText, Plus, Star } from "lucide-react";
import { useTemplates } from "@/lib/queries/templates";
import type { Template, TemplateKind } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, SkeletonList } from "@/components/ui/feedback";
import { KIND_LABELS, TemplateEditor } from "./template-editor";
import { SettingsPanel } from "./settings-shared";

type KindFilter = TemplateKind | "all";
type Selection = number | "new" | null;

const FILTERS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...(Object.keys(KIND_LABELS) as TemplateKind[]).map((k) => ({ value: k, label: KIND_LABELS[k].plural })),
];

function TemplateListItem({ t, active, showKind, onSelect }: { t: Template; active: boolean; showKind: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full rounded-xl border p-3.5 text-left transition-all",
        active ? "border-primary bg-primary-soft/40 shadow-[0_0_0_3px_var(--primary-soft)]" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-text">{t.name}</span>
        {t.is_default && (
          <Badge tone="primary" size="xs">
            <Star className="size-3" aria-hidden /> Default
          </Badge>
        )}
      </span>
      <span className="mt-1 line-clamp-2 block text-caption text-muted">{t.kind === "question" && t.question ? t.question : t.body}</span>
      <span className="mt-2 flex items-center gap-2 text-caption text-subtle">
        {showKind && (
          <Badge tone="neutral" size="xs">
            {KIND_LABELS[t.kind]?.singular ?? t.kind}
          </Badge>
        )}
        Updated {relativeTime(t.updated_at)}
      </span>
    </button>
  );
}

export function TemplatesTab() {
  const [kind, setKind] = React.useState<KindFilter>("all");
  const [selected, setSelected] = React.useState<Selection>(null);
  const [lastSaved, setLastSaved] = React.useState<Template | null>(null);
  const [pending, setPending] = React.useState<{ selection: Selection; kind?: KindFilter } | null>(null);
  const dirtyRef = React.useRef(false);
  const onDirtyChange = React.useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);
  const { data, isLoading, error, refetch } = useTemplates(kind);

  const templates = React.useMemo(
    () => [...(data ?? [])].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)),
    [data],
  );
  const current =
    typeof selected === "number"
      ? (templates.find((t) => t.id === selected) ?? (lastSaved?.id === selected ? lastSaved : null))
      : null;
  // A selected template that's no longer in the filtered list closes the editor.
  const editorOpen = selected === "new" || current !== null;

  const go = (selection: Selection, nextKind?: KindFilter) => {
    if (dirtyRef.current && selection !== selected) {
      setPending({ selection, kind: nextKind });
      return;
    }
    dirtyRef.current = false;
    if (nextKind) setKind(nextKind);
    setSelected(selection);
  };

  return (
    <SettingsPanel
      title="Application templates"
      description="Reusable cover letters, answers and messages. Placeholders like {{company}} are filled in automatically."
      actions={
        <Button size="sm" onClick={() => go("new")}>
          <Plus /> New template
        </Button>
      }
    >
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2" role="group" aria-label="Filter templates by type">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={kind === f.value}
              onClick={() => go(selected === "new" ? "new" : null, f.value)}
              className={cn(
                "h-8 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-all",
                kind === f.value
                  ? "border-primary bg-primary-soft text-primary-soft-fg"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className={cn("space-y-2", editorOpen && "hidden lg:block")}>
          {isLoading ? (
            <SkeletonList count={4} />
          ) : error ? (
            <ErrorState compact error={error} title="We couldn't load your templates" onRetry={() => refetch()} />
          ) : templates.length === 0 ? (
            <EmptyState
              compact
              icon={<FileText />}
              title="No templates yet"
              description={kind === "all" ? "Create your first reusable message." : `You don't have any ${KIND_LABELS[kind].plural.toLowerCase()} yet.`}
              action={
                <Button size="sm" onClick={() => go("new")}>
                  <Plus /> New template
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2" aria-label="Templates">
              {templates.map((t) => (
                <li key={t.id}>
                  <TemplateListItem t={t} active={t.id === selected} showKind={kind === "all"} onSelect={() => go(t.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn(!editorOpen && "hidden lg:block")}>
          {editorOpen ? (
            <div className="space-y-3">
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => go(null)}>
                <ArrowLeft /> All templates
              </Button>
              <TemplateEditor
                key={current ? `${current.id}-${current.updated_at}` : "new"}
                template={current}
                defaultKind={kind === "all" ? "cover_letter" : kind}
                onDirtyChange={onDirtyChange}
                onSaved={(t) => {
                  dirtyRef.current = false;
                  if (kind !== "all" && kind !== t.kind) setKind(t.kind);
                  setLastSaved(t);
                  setSelected(t.id);
                }}
                onDeleted={() => {
                  dirtyRef.current = false;
                  setSelected(null);
                }}
              />
            </div>
          ) : (
            <EmptyState
              icon={<FileText />}
              title="Select a template"
              description="Choose a template to edit it and preview how it reads with real application details."
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Discard unsaved changes?"
        description="You have edits to this template that haven't been saved."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => {
          if (!pending) return;
          dirtyRef.current = false;
          if (pending.kind) setKind(pending.kind);
          setSelected(pending.selection);
          setPending(null);
        }}
      />
    </SettingsPanel>
  );
}
