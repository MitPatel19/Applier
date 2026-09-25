"use client";

import * as React from "react";
import Link from "next/link";
import { BookmarkPlus, Brain, Play, PlugZap, RotateCcw, Sparkles, TriangleAlert, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useAgentStatus } from "@/lib/queries/core";
import { EMPTY_FILTERS, useParseQuery, useRunSearch } from "@/lib/queries/jobs";
import type { JobSearch, ParsedQuery, SearchFilters, SourceKey } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Eyebrow } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/input";
import { ChipSelect } from "@/components/ui/tag-input";
import { SaveSearchDialog } from "./save-search-dialog";
import { isEmptyFilters, SearchFiltersForm, SOURCE_OPTIONS, summarizeFilters } from "./search-filters-form";

const EXAMPLES = [
  "Find junior Python and Java developer jobs in Thunder Bay and remote Canada, posted within the last 7 days, paying at least $55,000.",
  "Remote React or TypeScript frontend roles in Canada, full-time, intermediate level.",
  "Entry-level data analyst jobs in Toronto or Ottawa, hybrid is fine, no staffing agencies.",
  "Software co-op or internship positions anywhere in Ontario for next summer.",
];

const ALL_SOURCES: SourceKey[] = ["linkedin", "indeed", "company_sites"];

/**
 * Natural-language search builder: describe the job → see how it was understood → adjust the
 * structured filters → run now or save. Filters can also be built by hand without the text box.
 * Remount with a different `key` to load another saved search for editing.
 */
export function SearchBuilder({
  editing,
  onCancelEdit,
  onStarted,
}: {
  editing: JobSearch | null;
  onCancelEdit: () => void;
  onStarted: (taskId: number, label: string) => void;
}) {
  const [text, setText] = React.useState(editing?.query_text ?? "");
  const [parsed, setParsed] = React.useState<ParsedQuery | null>(null);
  const [filters, setFilters] = React.useState<SearchFilters>(editing?.filters ?? EMPTY_FILTERS);
  const [sources, setSources] = React.useState<SourceKey[]>(editing?.sources?.length ? editing.sources : ALL_SOURCES);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const interpretRef = React.useRef<HTMLDivElement>(null);

  const parse = useParseQuery();
  const run = useRunSearch();
  const agent = useAgentStatus();

  const empty = isEmptyFilters(filters);
  const unconnected = (agent.data?.sources ?? []).filter(
    (s) => sources.includes(s.key as SourceKey) && (s.status === "not_connected" || s.status === "unavailable"),
  );

  const interpret = () => {
    if (text.trim().length < 3) return;
    parse.mutate(text.trim(), {
      onSuccess: (p) => {
        setParsed(p);
        setFilters(p.filters);
        requestAnimationFrame(() => interpretRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      },
    });
  };

  const start = () => {
    if (empty || !sources.length) return;
    run.mutate(
      { filters, sources, query_text: text.trim() || null, job_search_id: editing?.id ?? null },
      {
        onSuccess: (task) => {
          toast.success("Search started", { description: "Follow along below — results are scored as they arrive." });
          onStarted(task.id, parsed?.suggested_name || editing?.name || summarizeFilters(filters));
        },
        onError: (e) => toast.error("The search couldn't start", { description: errorMessage(e) }),
      },
    );
  };

  const reset = () => {
    setText("");
    setParsed(null);
    setFilters(EMPTY_FILTERS);
    setSources(ALL_SOURCES);
    parse.reset();
  };

  return (
    <div className="space-y-6">
      {editing && (
        <Callout
          tone="primary"
          icon={<WandSparkles />}
          title={`Editing “${editing.name}”`}
          action={
            <Button size="sm" variant="ghost" onClick={onCancelEdit}>
              <X /> Stop editing
            </Button>
          }
        >
          Change anything below, then save your changes or run it right away.
        </Callout>
      )}

      {/* Step 1 — describe */}
      <Card className="relative overflow-hidden">
        <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 h-40 opacity-80" aria-hidden />
        <div className="relative p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-brand text-white shadow-glow">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div>
              <Eyebrow>Step 1</Eyebrow>
              <h2 className="text-h3 font-semibold">Describe the job you want</h2>
            </div>
          </div>
          <label htmlFor="nl-query" className="sr-only">
            Describe your ideal job in plain language
          </label>
          <Textarea
            id="nl-query"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                interpret();
              }
            }}
            placeholder="e.g. Junior Python developer jobs in Thunder Bay or remote in Canada, at least $55,000, posted this week"
            className="mt-4 min-h-32 bg-surface/90 text-base"
            maxLength={1000}
          />
          <div className="mt-3">
            <p className="mb-2 text-caption text-subtle">Try an example</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setText(ex)}
                  className="max-w-full truncate rounded-full border border-border bg-surface px-3 py-1.5 text-left text-caption text-muted transition-colors hover:border-primary hover:text-text sm:max-w-sm"
                  title={ex}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button onClick={interpret} loading={parse.isPending} disabled={text.trim().length < 3}>
              {!parse.isPending && <Brain />}
              {parse.isPending ? "Interpreting…" : "Interpret"}
            </Button>
            <span className="hidden text-caption text-subtle sm:inline">or press Ctrl/⌘ + Enter · You can also fill in the filters yourself below.</span>
          </div>
          {parse.isError && (
            <Callout tone="warning" className="mt-4" title="We couldn't interpret that">
              {errorMessage(parse.error)} Try rephrasing, or fill in the filters below yourself.
            </Callout>
          )}
        </div>
      </Card>

      {/* Interpretation */}
      <div ref={interpretRef} aria-live="polite" className="scroll-mt-24">
        {parsed && (
          <Card className="border-primary/25 shadow-glow animate-rise">
            <CardHeader>
              <div>
                <CardTitle>Here&apos;s how I understood your search</CardTitle>
                <CardDescription>Adjust anything that isn&apos;t right in the filters below — they&apos;re what actually runs.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {parsed.interpretation.length ? (
                <ul className="flex flex-wrap gap-2">
                  {parsed.interpretation.map((it, i) => (
                    <li
                      key={`${it.field}-${i}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-subtle px-2.5 py-1.5 text-sm animate-rise"
                      style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                    >
                      <span className="text-subtle">{it.label}:</span>
                      <span className="font-medium">{it.value}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">I couldn&apos;t pick out specific filters. Add them below.</p>
              )}
              {parsed.warnings.length > 0 && (
                <Callout tone="warning" icon={<TriangleAlert />} title="Please double-check">
                  <ul className="space-y-0.5">
                    {parsed.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Callout>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Step 2 — filters */}
      <Card>
        <CardHeader>
          <div>
            <Eyebrow>Step 2</Eyebrow>
            <CardTitle className="mt-1">Search filters</CardTitle>
            <CardDescription>{parsed ? "Filled in from your description — edit freely." : "Interpret a description above, or build your search by hand."}</CardDescription>
          </div>
          {(!empty || parsed) && (
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw /> Start over
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <SearchFiltersForm value={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      {/* Step 3 — sources + actions */}
      <Card>
        <CardHeader>
          <div>
            <Eyebrow>Step 3</Eyebrow>
            <CardTitle className="mt-1">Where to search</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChipSelect<SourceKey> aria-label="Job sources" options={SOURCE_OPTIONS} value={sources} onChange={setSources} />
          {!sources.length && <p className="text-sm text-warning">Choose at least one source.</p>}
          {unconnected.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-muted">
              <PlugZap className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
              <span>
                {unconnected.map((s) => s.label).join(" and ")} {unconnected.length === 1 ? "isn't" : "aren't"} connected, so{" "}
                {unconnected.length === 1 ? "it" : "they"} may be skipped.{" "}
                <Link href="/settings?tab=integrations" className="font-medium text-primary hover:underline">
                  Connect sources
                </Link>
              </span>
            </p>
          )}

          <div className="rounded-xl bg-bg-subtle px-4 py-3 text-sm">
            <span className="text-subtle">Your search: </span>
            <span className="font-medium">{summarizeFilters(filters)}</span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="gradient" size="lg" onClick={start} loading={run.isPending} disabled={empty || !sources.length}>
              {!run.isPending && <Play />}
              Run search
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setSaveOpen(true)} disabled={empty || !sources.length}>
              <BookmarkPlus /> {editing ? "Save changes" : "Save search"}
            </Button>
            {empty && <p className="text-sm text-muted sm:ml-2">Add at least a role, keyword, location or company to search.</p>}
          </div>
          {editing && (
            <p className="text-caption text-subtle">
              <Badge tone="outline" size="xs">
                Tip
              </Badge>{" "}
              Running from here uses your edits without changing the saved version until you save.
            </p>
          )}
        </CardContent>
      </Card>

      <SaveSearchDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        editing={editing}
        defaultName={parsed?.suggested_name || filters.roles[0] || "My job search"}
        filters={filters}
        sources={sources}
        queryText={text.trim() || null}
        onSaved={() => {
          if (editing) onCancelEdit();
        }}
      />
    </div>
  );
}
