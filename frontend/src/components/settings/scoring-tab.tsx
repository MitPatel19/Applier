"use client";

import * as React from "react";
import { toast } from "sonner";
import { Calculator, Eye, RotateCcw, SlidersHorizontal } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useScoringWeights, useUpdateScoringWeights, type ScoringWeightsSaveResult } from "@/lib/queries/settings";
import { scoreColor } from "@/lib/constants";
import { pluralize, titleCase } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Callout, ErrorState } from "@/components/ui/feedback";
import { Slider } from "@/components/ui/primitives";
import { ProgressBar, ScoreRing } from "@/components/ui/score";
import { PanelSkeleton, SaveBar, SettingsCard, SettingsPanel, sameJson, useDraft } from "./settings-shared";

const MAX_WEIGHT = 50;
/** Fixed example category scores for the explanation preview (deterministic, not real data). */
const EXAMPLE_SCORES = [95, 88, 80, 100, 72, 90, 65, 85, 78, 92, 70, 84];

function rescoredCount(r: ScoringWeightsSaveResult): number | null {
  const n = r.recalculated ?? r.rescored ?? r.jobs_rescored;
  return typeof n === "number" ? n : null;
}

export function ScoringTab() {
  const { data, isLoading, error, refetch } = useScoringWeights();
  const { draft, setDraft, dirty, reset, commit } = useDraft(data?.weights);
  const save = useUpdateScoringWeights();

  const keys = React.useMemo(() => Object.keys(data?.labels ?? data?.weights ?? {}), [data]);
  const total = React.useMemo(() => keys.reduce((s, k) => s + (draft?.[k] ?? 0), 0), [keys, draft]);

  const example = React.useMemo(() => {
    const rows = keys.map((k, i) => {
      const weight = draft?.[k] ?? 0;
      const score = EXAMPLE_SCORES[i % EXAMPLE_SCORES.length];
      const share = total ? weight / total : 0;
      return { key: k, score, share, points: score * share };
    });
    const overall = Math.round(rows.reduce((s, r) => s + r.points, 0));
    return { rows, overall };
  }, [keys, draft, total]);

  if (isLoading) return <PanelSkeleton cards={2} />;
  if (error || !data || !draft) return <ErrorState error={error} title="We couldn't load your scoring weights" onRetry={() => refetch()} />;

  const label = (k: string) => data.labels[k] ?? titleCase(k);
  const atDefaults = sameJson(
    keys.map((k) => draft[k] ?? 0),
    keys.map((k) => data.defaults[k] ?? 0),
  );

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: (res) => {
        commit(res.weights);
        const n = rescoredCount(res);
        toast.success(n !== null ? `Scores recalculated for ${pluralize(n, "job")}` : "Scores recalculated for your jobs", {
          description: "Match scores now use your new weights.",
        });
      },
      onError: (e) => toast.error(errorMessage(e, "We couldn't save your weights.")),
    });
  };

  return (
    <SettingsPanel
      title="Scoring weights"
      description="Decide what matters most when Applier scores a job. Every match score is a weighted average of these categories."
      actions={
        <Button variant="secondary" size="sm" onClick={() => setDraft({ ...data.defaults })} disabled={atDefaults}>
          <RotateCcw /> Reset to defaults
        </Button>
      }
    >
      <Callout tone="primary" icon={<Eye />} title="Your score is never a black box">
        Every job shows its full breakdown — each category&apos;s score, its weight, and the reasons behind it — so you can
        always see exactly why a job scored the way it did.
      </Callout>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <SettingsCard icon={<SlidersHorizontal />} title="Category weights" description={`Each category from 0 (ignore) to ${MAX_WEIGHT}.`}>
          <ul className="divide-y divide-border">
            {keys.map((k) => {
              const w = draft[k] ?? 0;
              const share = total ? (w / total) * 100 : 0;
              return (
                <li key={k} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-text">
                      {label(k)}
                    </span>
                    <span className="text-sm">
                      <span className="tabular font-semibold">{w}</span>
                      <span className="tabular ml-2 inline-block w-12 text-right text-caption text-subtle">{share.toFixed(0)}% share</span>
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-[1fr] gap-2">
                    <Slider
                      aria-label={`${label(k)} weight`}
                      min={0}
                      max={MAX_WEIGHT}
                      step={1}
                      value={[w]}
                      onValueChange={([v]) => setDraft({ ...draft, [k]: v })}
                    />
                    <ProgressBar value={share} size="sm" label={`${label(k)} share of total score: ${share.toFixed(0)}%`} />
                  </div>
                </li>
              );
            })}
          </ul>
          {total === 0 && (
            <Callout tone="warning" className="mt-4" title="At least one category needs a weight">
              With every weight at zero, jobs can&apos;t be scored.
            </Callout>
          )}
        </SettingsCard>

        <SettingsCard icon={<Calculator />} title="Example breakdown" description="How a sample job would score with these weights.">
          <div className="flex items-center gap-4">
            <ScoreRing score={total ? example.overall : null} size={72} />
            <div>
              <p className={total ? "text-2xl font-semibold" : "text-2xl font-semibold text-subtle"}>
                {total ? `${example.overall}% Match` : "—"}
              </p>
              <p className="text-caption text-subtle">Sample category scores, your weights</p>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm" aria-label="Example score calculation">
            {example.rows
              .filter((r) => r.share > 0)
              .sort((a, b) => b.points - a.points)
              .map((r) => (
                <li key={r.key} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-muted">
                    <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: scoreColor(r.score) }} aria-hidden />
                    {label(r.key)} <span className="tabular text-subtle">{r.score}%</span>
                  </span>
                  <span className="tabular shrink-0 text-muted">
                    × {(r.share * 100).toFixed(0)}% = <span className="font-semibold text-text">{r.points.toFixed(1)}</span>
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-4 border-t border-border pt-3 text-caption text-subtle">
            Categories that don&apos;t apply to a job (for example, salary when it isn&apos;t listed) are left out and the
            remaining weights are rebalanced.
          </p>
        </SettingsCard>
      </div>

      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        onSave={onSave}
        onReset={reset}
        disabled={total === 0}
        saveLabel="Save & recalculate"
      />
    </SettingsPanel>
  );
}
