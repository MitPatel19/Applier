"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronDown, Dices, History, Mic, RotateCcw, Send, Timer } from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { InterviewDetail, PracticeEntry } from "@/lib/types";
import { usePractice } from "@/lib/queries/interviews";
import { cn, formatDateTime } from "@/lib/utils";
import { scoreColor } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Field, Select, Textarea } from "@/components/ui/input";
import { ScoreRing } from "@/components/ui/score";

const CUSTOM = "__custom";

function formatElapsed(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function scoreHeadline(score: number) {
  if (score >= 80) return "Strong answer";
  if (score >= 65) return "Good foundation";
  if (score >= 50) return "Getting there";
  return "Needs more structure";
}

function FeedbackCard({ entry }: { entry: PracticeEntry }) {
  return (
    <div className="animate-rise rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-4">
        <ScoreRing score={entry.score} size={64} label="Practice score" />
        <div className="min-w-0">
          <p className="font-semibold" style={{ color: scoreColor(entry.score) }}>
            {scoreHeadline(entry.score)}
          </p>
          <p className="mt-0.5 text-sm text-muted">Feedback is based on answer structure (STAR), specificity and length — not a judgment of you.</p>
        </div>
      </div>
      {entry.feedback.length > 0 && (
        <ul className="mt-4 space-y-2">
          {entry.feedback.map((f) => (
            <li key={f} className="flex items-start gap-2.5 rounded-lg bg-surface-2 px-3 py-2 text-sm ring-1 ring-border">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PracticeHistory({ log }: { log: PracticeEntry[] }) {
  const items = [...log].reverse();
  if (!items.length) return null;
  const avg = Math.round(items.reduce((n, e) => n + e.score, 0) / items.length);
  return (
    <section aria-labelledby="practice-history" className="space-y-3">
      <h2 id="practice-history" className="flex flex-wrap items-center gap-2 text-h3 font-semibold">
        <History className="size-4 text-primary" /> Practice history
        <span className="text-sm font-normal text-muted">
          · {items.length} {items.length === 1 ? "answer" : "answers"} · average {avg}%
        </span>
      </h2>
      <ul className="space-y-2">
        {items.map((e, i) => (
          <li key={`${e.created_at}-${i}`}>
            <details className="group rounded-xl border border-border bg-surface">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="tabular w-11 shrink-0 text-sm font-semibold" style={{ color: scoreColor(e.score) }}>
                  {e.score}%
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-sm font-medium">{e.question}</span>
                  <span className="text-caption text-subtle">{formatDateTime(e.created_at)}</span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="space-y-3 border-t border-border px-4 py-3">
                <p className="whitespace-pre-line text-sm text-muted">{e.answer}</p>
                {e.feedback.length > 0 && (
                  <ul className="space-y-1.5">
                    {e.feedback.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MockInterview({
  interview,
  question,
  onQuestionChange,
}: {
  interview: InterviewDetail;
  question: string;
  onQuestionChange: (q: string) => void;
}) {
  const practice = usePractice(interview.id);
  const { prep } = interview;
  const bank = React.useMemo(
    () => ({
      behavioral: prep.behavioral_questions.map((q) => q.question),
      technical: prep.technical_questions.map((q) => q.question),
    }),
    [prep],
  );
  const allQuestions = React.useMemo(() => [...bank.behavioral, ...bank.technical], [bank]);
  const selectValue = question && allQuestions.includes(question) ? question : question || !allQuestions.length ? CUSTOM : "";
  const [answer, setAnswer] = React.useState("");
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [result, setResult] = React.useState<PracticeEntry | null>(null);

  React.useEffect(() => {
    if (startedAt === null) return;
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [startedAt]);

  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const reset = () => {
    setAnswer("");
    setStartedAt(null);
    setElapsed(0);
    setResult(null);
  };

  const pickRandom = () => {
    const pool = allQuestions.filter((q) => q !== question);
    if (!pool.length) return;
    onQuestionChange(pool[Math.floor(Math.random() * pool.length)]);
    reset();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 3 || !answer.trim()) return;
    practice.mutate(
      { question: question.trim(), answer: answer.trim() },
      {
        onSuccess: (entry) => {
          setResult(entry);
          setStartedAt(null);
        },
        onError: (err) => toast.error("Couldn't score your answer", { description: errorMessage(err) }),
      },
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-h3 font-semibold">
              <Mic className="size-4 text-primary" /> Mock interview
            </h2>
            <p className="mt-0.5 text-sm text-muted">Answer as you would out loud. Aim for 1–2 minutes (about 150–300 words).</p>
          </div>
          {allQuestions.length > 1 && (
            <Button type="button" size="sm" variant="ghost" onClick={pickRandom}>
              <Dices /> Surprise me
            </Button>
          )}
        </div>

        <Field label="Question">
          <Select
            value={selectValue}
            onChange={(e) => {
              onQuestionChange(e.target.value === CUSTOM ? "" : e.target.value);
              reset();
            }}
          >
            <option value="" disabled>
              Choose a question
            </option>
            {bank.behavioral.length > 0 && (
              <optgroup label="Behavioral">
                {bank.behavioral.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </optgroup>
            )}
            {bank.technical.length > 0 && (
              <optgroup label="Technical">
                {bank.technical.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={CUSTOM}>Write my own question…</option>
          </Select>
        </Field>
        {selectValue === CUSTOM && (
          <Field label="Your question">
            <Textarea rows={2} value={question} onChange={(e) => onQuestionChange(e.target.value)} placeholder="e.g. Tell me about a time you disagreed with a teammate." />
          </Field>
        )}
        {question && selectValue !== CUSTOM && (
          <blockquote className="rounded-xl border-l-4 border-primary bg-primary-soft/40 px-4 py-3 text-sm font-medium">{question}</blockquote>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="mock-answer" className="text-sm font-medium">
              Your answer
            </label>
            <span
              className={cn(
                "tabular inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption",
                startedAt !== null ? "bg-primary-soft text-primary-soft-fg" : "text-subtle",
                elapsed > 150 && "bg-warning-soft text-warning",
              )}
              aria-label={`Time spent ${formatElapsed(elapsed)}`}
              role="timer"
            >
              <Timer className="size-3" aria-hidden /> {formatElapsed(elapsed)}
            </span>
          </div>
          <Textarea
            id="mock-answer"
            rows={9}
            value={answer}
            disabled={!question.trim()}
            onChange={(e) => {
              setAnswer(e.target.value);
              if (startedAt === null && e.target.value) setStartedAt(Date.now() - elapsed * 1000);
            }}
            placeholder={question.trim() ? "Situation → Task → Action → Result. Be specific about what YOU did and what changed." : "Pick a question first."}
          />
          <p className="flex justify-between text-caption text-subtle">
            <span>{words} words</span>
            {words > 0 && words < 80 && <span>Try adding more detail on your actions and results.</span>}
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {(answer || result) && (
            <Button type="button" variant="ghost" onClick={reset}>
              <RotateCcw /> Start over
            </Button>
          )}
          <Button type="submit" loading={practice.isPending} disabled={question.trim().length < 3 || !answer.trim()}>
            <Send /> Get feedback
          </Button>
        </div>
      </form>

      <div className="space-y-6">
        {result ? (
          <FeedbackCard entry={result} />
        ) : (
          <EmptyState
            compact
            icon={<Mic />}
            title="Practice makes confident"
            description="Answer a question and Applier will score the structure and suggest improvements. Your answers stay private."
          />
        )}
        <PracticeHistory log={interview.practice_log} />
      </div>
    </div>
  );
}
