"use client";

import * as React from "react";
import { toast } from "sonner";
import { CalendarClock, Hand, Lock, MousePointerClick, Repeat, Workflow } from "lucide-react";
import { ErrorState, SkeletonCard } from "@/components/ui/feedback";
import { Switch, SwitchRow } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/api";
import { useOnboardingAgentSettings, useSaveAgentSettings } from "@/lib/queries/onboarding";
import type { AgentSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ContinueButton, Panel, PanelTitle, StepFooter, StepHeader } from "./step-shell";
import type { StepProps } from "./steps";

type Frequency = AgentSettings["search_frequency"];

const FREQUENCIES: { value: Frequency; label: string; description: string; icon: React.ReactNode }[] = [
  { value: "manual", label: "Manual", description: "Only when you press Search", icon: <MousePointerClick /> },
  { value: "daily", label: "Daily", description: "One fresh search every morning", icon: <CalendarClock /> },
  { value: "several_daily", label: "Several times a day", description: "Catch new postings early", icon: <Repeat /> },
];

type Toggle = Exclude<keyof AgentSettings, "search_frequency" | "auto_submit" | "sources" | "strong_match_threshold" | "notify_on_strong_match">;

const TOGGLES: { key: Toggle; label: string; description: string }[] = [
  { key: "auto_search", label: "Search for jobs", description: "Run searches on the schedule above." },
  { key: "auto_dedupe", label: "Remove duplicates", description: "Merge the same job posted on several sites." },
  { key: "auto_analyze", label: "Analyze jobs", description: "Extract requirements, skills and red flags from each posting." },
  { key: "auto_score", label: "Score jobs", description: "Rate each job against your profile, with reasons." },
  { key: "auto_customize_resume", label: "Customize resume", description: "Draft tailored resume suggestions for strong matches — for your review." },
  { key: "auto_cover_letter", label: "Generate cover letter", description: "Draft a cover letter for strong matches — for your review." },
  { key: "auto_company_research", label: "Company research", description: "Gather public facts about employers you're interested in." },
];

function FrequencyPicker({ value, onChange }: { value: Frequency; onChange: (v: Frequency) => void }) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => {
    const next = (i + FREQUENCIES.length) % FREQUENCIES.length;
    onChange(FREQUENCIES[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Search frequency" className="grid gap-2.5 sm:grid-cols-3">
      {FREQUENCIES.map((f, i) => {
        const active = f.value === value;
        return (
          <button
            key={f.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(f.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i + 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i - 1);
              }
            }}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-all",
              active ? "border-primary bg-primary-soft/50 shadow-[0_0_0_3px_var(--primary-soft)]" : "border-border hover:border-border-strong",
            )}
          >
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-lg [&_svg]:size-4",
                active ? "bg-primary text-primary-fg" : "bg-bg-subtle text-muted",
              )}
            >
              {f.icon}
            </span>
            <span className="text-sm font-semibold">{f.label}</span>
            <span className="text-caption text-muted">{f.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function AgentEditor({ initial, onBack, onNext, onComplete }: StepProps & { initial: AgentSettings }) {
  const save = useSaveAgentSettings();
  const [settings, setSettings] = React.useState<AgentSettings>(() => ({ ...initial, auto_submit: false }));
  const lockId = React.useId();

  const submit = () =>
    save.mutate(settings, {
      onSuccess: () => {
        toast.success("Agent preferences saved");
        onComplete();
      },
      onError: (err) => toast.error(errorMessage(err, "We couldn't save these settings. Please try again.")),
    });

  return (
    <div className="space-y-4">
      <Panel>
        <PanelTitle icon={<CalendarClock />} title="How often should it search?" />
        <FrequencyPicker value={settings.search_frequency} onChange={(v) => setSettings((s) => ({ ...s, search_frequency: v }))} />
      </Panel>

      <Panel>
        <PanelTitle icon={<Workflow />} title="What can it do on its own?" description="All of these only prepare work for you. You can change them anytime." />
        <div className="divide-y divide-border">
          {TOGGLES.map((t) => (
            <SwitchRow
              key={t.key}
              label={t.label}
              description={t.description}
              checked={settings[t.key]}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, [t.key]: v }))}
            />
          ))}
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <label htmlFor={lockId} className="flex items-center gap-2 text-sm font-medium text-text">
                <Lock className="size-3.5 text-muted" aria-hidden />
                Submit applications automatically
              </label>
              <p className="mt-0.5 text-sm text-muted">Applier always asks you to confirm each application.</p>
            </div>
            <Switch id={lockId} checked={false} disabled aria-describedby={`${lockId}-why`} />
          </div>
        </div>
        <div id={`${lockId}-why`} className="mt-2 flex items-start gap-2.5 rounded-xl bg-success-soft/50 px-3.5 py-3 text-sm text-muted">
          <Hand className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>
            <span className="font-medium text-text">Permanently off.</span> Every application waits for your review and explicit
            confirmation — this can&apos;t be changed.
          </span>
        </div>
      </Panel>

      <StepFooter
        onBack={onBack}
        onSkip={onNext}
        skipLabel="Use defaults"
        primary={
          <ContinueButton onClick={submit} loading={save.isPending}>
            {save.isPending ? "Saving…" : "Save & continue"}
          </ContinueButton>
        }
      />
    </div>
  );
}

export function StepAgent(props: StepProps) {
  const { data, isLoading, error, refetch } = useOnboardingAgentSettings();
  return (
    <div>
      <StepHeader
        eyebrow="Step 5 · Agent behavior"
        title="Decide how your agent works."
        description="Your agent can take care of the busywork automatically. The decisions that matter always stay with you."
      />
      {isLoading ? (
        <div className="space-y-4" role="status" aria-label="Loading agent settings">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={5} />
        </div>
      ) : error || !data ? (
        <>
          <ErrorState error={error} title="We couldn't load agent settings" onRetry={() => refetch()} onContinue={props.onNext} continueLabel="Use defaults" />
          <StepFooter onBack={props.onBack} />
        </>
      ) : (
        <AgentEditor {...props} initial={data} />
      )}
    </div>
  );
}
