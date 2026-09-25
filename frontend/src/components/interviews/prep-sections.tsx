"use client";

import * as React from "react";
import {
  AlertTriangle,
  BookOpen,
  Building2,
  Code2,
  FolderGit2,
  Lightbulb,
  MessageCircleQuestion,
  Mic,
  Quote,
  Target,
} from "lucide-react";
import type { InterviewPrep, PrepQuestion, StarStory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { CopyButton } from "@/components/networking/message-editor";
import { scrollBehavior } from "./time";

const TODO_RE = /(\[[^\]\n]{2,200}\])/g;

/** Renders text with "[Add the outcome …]" style placeholders highlighted as TODOs for the user. */
export function HighlightTodos({ text }: { text: string }) {
  const parts = text.split(TODO_RE);
  return (
    <>
      {parts.map((p, i) =>
        // split() with a capture group puts the matched placeholders at odd indexes
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded-md border border-dashed border-warning/60 bg-warning-soft px-1 py-px font-medium text-warning"
            title="Fill this in with your own details"
          >
            <span className="sr-only">To do: </span>
            {p}
          </mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}

export function countTodos(text: string | null | undefined) {
  return text ? (text.match(TODO_RE) ?? []).length : 0;
}

function SectionTitle({ icon, children, action }: { icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-h3 font-semibold [&_svg]:size-4 [&_svg]:text-primary">
        {icon}
        {children}
      </h2>
      {action}
    </div>
  );
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5", className)}>{children}</section>;
}

// ---------------------------------------------------------------- overview
export function OverviewSection({ prep }: { prep: InterviewPrep }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Panel>
          <SectionTitle icon={<Building2 />}>Company overview</SectionTitle>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{prep.company_overview || "No company research yet."}</p>
        </Panel>
        <Panel>
          <SectionTitle icon={<Target />}>The role</SectionTitle>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{prep.role_summary || "No role summary yet."}</p>
        </Panel>
      </div>
      <div className="space-y-4">
        <Panel>
          <SectionTitle icon={<Code2 />}>Skills they&apos;re looking for</SectionTitle>
          {prep.required_skills.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Required skills">
              {prep.required_skills.map((s) => (
                <li key={s}>
                  <Badge tone="primary">{s}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">No specific skills listed.</p>
          )}
        </Panel>
        <Panel className="border-warning/30">
          <SectionTitle icon={<AlertTriangle />}>Gaps to prepare for</SectionTitle>
          {prep.gaps_to_prepare.length ? (
            <>
              <ul className="space-y-2">
                {prep.gaps_to_prepare.map((g) => (
                  <li key={g} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
                    <span className="text-text">{g}</span>
                  </li>
                ))}
              </ul>
              <Callout tone="info" className="mt-4" icon={<Lightbulb />} title="Be honest — then bridge">
                Don&apos;t claim experience you don&apos;t have. Acknowledge the gap, connect it to something related you&apos;ve done, and share
                how you&apos;re closing it (a course, a side project, docs you&apos;ve read).
              </Callout>
            </>
          ) : (
            <p className="text-sm text-muted">No major gaps found against the posting. Still, review the technical topics.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- questions
export function QuestionCard({
  q,
  index,
  onPractice,
  onShowStory,
}: {
  q: PrepQuestion;
  index: number;
  onPractice?: (question: string) => void;
  onShowStory?: (title: string) => void;
}) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-text">
        <span className="tabular mr-2 text-subtle">{index + 1}.</span>
        {q.question}
      </p>
      {q.why && (
        <p className="mt-2 text-sm text-muted">
          <span className="font-medium text-text">Why they ask: </span>
          {q.why}
        </p>
      )}
      {q.tips.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {q.tips.map((t) => (
            <li key={t} className="flex items-start gap-2 text-sm text-muted">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {q.suggested_story && (
          <Button size="xs" variant="ghost" onClick={() => onShowStory?.(q.suggested_story ?? "")}>
            <BookOpen /> Use story: {q.suggested_story}
          </Button>
        )}
        {onPractice && (
          <Button size="xs" variant="soft" onClick={() => onPractice(q.question)} className="ml-auto">
            <Mic /> Practice this
          </Button>
        )}
      </div>
    </li>
  );
}

export function TechnicalSection({ prep, onPractice }: { prep: InterviewPrep; onPractice: (q: string) => void }) {
  if (!prep.technical_topics.length && !prep.technical_questions.length) {
    return <EmptyState compact icon={<Code2 />} title="No technical topics" description="This interview looks conversational. Focus on behavioral questions and your talking points." />;
  }
  return (
    <div className="space-y-6">
      {prep.technical_topics.length > 0 && (
        <div>
          <SectionTitle icon={<Code2 />}>Topics to review</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {prep.technical_topics.map((t) => (
              <Panel key={t.topic} className="p-4 sm:p-4">
                <p className="font-semibold">{t.topic}</p>
                {t.why && <p className="mt-1 text-sm text-muted">{t.why}</p>}
                {t.subtopics && t.subtopics.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {t.subtopics.map((s) => (
                      <li key={s}>
                        <Badge tone="neutral" size="xs">
                          {s}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ))}
          </div>
        </div>
      )}
      {prep.technical_questions.length > 0 && (
        <div>
          <SectionTitle icon={<MessageCircleQuestion />}>Likely technical questions</SectionTitle>
          <ol className="space-y-2.5">
            {prep.technical_questions.map((q, i) => (
              <QuestionCard key={q.question} q={q} index={i} onPractice={onPractice} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- STAR stories
const STAR_PARTS: { key: keyof Pick<StarStory, "situation" | "task" | "action" | "result">; letter: string; label: string }[] = [
  { key: "situation", letter: "S", label: "Situation" },
  { key: "task", letter: "T", label: "Task" },
  { key: "action", letter: "A", label: "Action" },
  { key: "result", letter: "R", label: "Result" },
];

export function storyAnchor(title: string) {
  return `story-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

export function StarStoryCard({ story, highlighted }: { story: StarStory; highlighted?: boolean }) {
  const todos = STAR_PARTS.reduce((n, p) => n + countTodos(story[p.key]), 0);
  const text = `${story.title}\n\n${STAR_PARTS.map((p) => `${p.label}: ${story[p.key]}`).join("\n\n")}`;
  return (
    <article
      id={storyAnchor(story.title)}
      tabIndex={-1}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-surface p-4 shadow-card outline-none transition-shadow sm:p-5",
        highlighted ? "border-primary/50 ring-4 ring-primary/15" : "border-border",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{story.title}</h3>
          <p className="mt-0.5 text-caption text-subtle">
            Based on: <span className="font-medium text-muted">{story.source}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {todos > 0 && (
            <Badge tone="warning" size="xs">
              {todos} {todos === 1 ? "detail" : "details"} to add
            </Badge>
          )}
          <CopyButton text={text} iconOnly variant="ghost" label="Copy story" />
        </div>
      </header>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {STAR_PARTS.map((p) => (
          <div key={p.key} className="rounded-xl bg-surface-2 p-3 ring-1 ring-border">
            <dt className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wider text-subtle">
              <span className="bg-gradient-brand flex size-5 items-center justify-center rounded-md text-[11px] text-white" aria-hidden>
                {p.letter}
              </span>
              {p.label}
            </dt>
            <dd className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-text">
              <HighlightTodos text={story[p.key]} />
            </dd>
          </div>
        ))}
      </dl>
      {story.fits_questions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-subtle">Works for:</span>
          {story.fits_questions.map((q) => (
            <Badge key={q} tone="outline" size="xs" className="max-w-full truncate">
              {q}
            </Badge>
          ))}
        </div>
      )}
    </article>
  );
}

export function BehavioralSection({ prep, onPractice }: { prep: InterviewPrep; onPractice: (q: string) => void }) {
  const [highlight, setHighlight] = React.useState<string | null>(null);
  const showStory = (title: string) => {
    const match = prep.star_stories.find((s) => s.title.toLowerCase() === title.toLowerCase()) ?? prep.star_stories.find((s) => s.title.toLowerCase().includes(title.toLowerCase()));
    if (!match) return;
    setHighlight(match.title);
    const el = document.getElementById(storyAnchor(match.title));
    el?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    el?.focus({ preventScroll: true });
  };
  const totalTodos = prep.star_stories.reduce(
    (n, s) => n + STAR_PARTS.reduce((m, p) => m + countTodos(s[p.key]), 0),
    0,
  );
  return (
    <div className="space-y-6">
      {prep.behavioral_questions.length > 0 && (
        <div>
          <SectionTitle icon={<MessageCircleQuestion />}>Likely behavioral questions</SectionTitle>
          <ol className="space-y-2.5">
            {prep.behavioral_questions.map((q, i) => (
              <QuestionCard key={q.question} q={q} index={i} onPractice={onPractice} onShowStory={showStory} />
            ))}
          </ol>
        </div>
      )}
      <div>
        <SectionTitle icon={<BookOpen />}>Your STAR stories</SectionTitle>
        {totalTodos > 0 && (
          <Callout tone="warning" className="mb-3" icon={<AlertTriangle />} title="Make these stories yours">
            Highlighted <mark className="rounded bg-warning-soft px-1 font-medium text-warning">[placeholders]</mark> mark details only you know —
            real numbers, names and outcomes. Applier never invents results.
          </Callout>
        )}
        {prep.star_stories.length ? (
          <div className="space-y-3">
            {prep.star_stories.map((s) => (
              <StarStoryCard key={s.title} story={s} highlighted={highlight === s.title} />
            ))}
          </div>
        ) : (
          <EmptyState compact icon={<BookOpen />} title="No stories yet" description="Add experience and projects to your profile so Applier can draft STAR stories from them." />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- talking points
export function TalkingPointsSection({ prep }: { prep: InterviewPrep }) {
  if (!prep.relevant_projects.length && !prep.talking_points.length) {
    return <EmptyState compact icon={<Quote />} title="No talking points yet" description="Regenerate the prep after adding projects and achievements to your profile." />;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {prep.talking_points.length > 0 && (
        <Panel>
          <SectionTitle icon={<Quote />} action={<CopyButton text={prep.talking_points.map((t) => `• ${t}`).join("\n")} size="xs" variant="ghost" label="Copy all" />}>
            From your resume
          </SectionTitle>
          <ul className="space-y-2.5">
            {prep.talking_points.map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm leading-relaxed">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>
                  <HighlightTodos text={t} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {prep.relevant_projects.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-h3 font-semibold">
            <FolderGit2 className="size-4 text-primary" /> Projects worth mentioning
          </h2>
          {prep.relevant_projects.map((p) => (
            <Panel key={p.name} className="p-4 sm:p-4">
              <p className="font-semibold">{p.name}</p>
              {p.why && <p className="mt-1 text-sm text-muted">{p.why}</p>}
              {p.talking_points && p.talking_points.length > 0 && (
                <ul className="mt-2.5 space-y-1.5">
                  {p.talking_points.map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-subtle" aria-hidden />
                      <span>
                        <HighlightTodos text={t} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- questions to ask
export function QuestionsToAskSection({ prep }: { prep: InterviewPrep }) {
  if (!prep.questions_to_ask.length) {
    return <EmptyState compact icon={<MessageCircleQuestion />} title="No questions yet" description="Regenerate the prep to get thoughtful questions for your interviewer." />;
  }
  return (
    <Panel>
      <SectionTitle
        icon={<MessageCircleQuestion />}
        action={<CopyButton text={prep.questions_to_ask.map((q, i) => `${i + 1}. ${q}`).join("\n")} size="sm" label="Copy all" />}
      >
        Questions to ask them
      </SectionTitle>
      <p className="mb-3 text-sm text-muted">Pick two or three that you genuinely care about — interviewers remember curious candidates.</p>
      <ol className="divide-y divide-border">
        {prep.questions_to_ask.map((q, i) => (
          <li key={q} className="flex items-start gap-3 py-3">
            <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-fg">
              {i + 1}
            </span>
            <p className="min-w-0 flex-1 text-sm leading-relaxed">{q}</p>
            <CopyButton text={q} iconOnly variant="ghost" label={`Copy question ${i + 1}`} />
          </li>
        ))}
      </ol>
    </Panel>
  );
}
