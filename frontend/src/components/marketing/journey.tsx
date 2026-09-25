import {
  BellRing,
  CalendarCheck,
  FilePenLine,
  Hand,
  Kanban,
  ListChecks,
  Radar,
  ScanSearch,
  Send,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";
import { MarketingSection, SectionHeading } from "./section";

const JOURNEY: { title: string; body: string; icon: LucideIcon; you?: boolean }[] = [
  { title: "Discover", body: "Searches LinkedIn, Indeed and employer career pages on your schedule.", icon: Radar },
  { title: "Analyze", body: "Reads each posting and scores it against your real profile — with reasons.", icon: ScanSearch },
  { title: "Customize", body: "Suggests resume tweaks and a cover letter tailored to the role.", icon: FilePenLine },
  { title: "Review", body: "You see every change, answer and document side by side.", icon: ListChecks },
  { title: "Confirm", body: "Nothing moves forward until you explicitly approve it.", icon: Hand, you: true },
  { title: "Apply", body: "Opens the application with everything prepared and ready to go.", icon: Send },
  { title: "Track", body: "Keeps your pipeline current from applied to offer.", icon: Kanban },
  { title: "Follow Up", body: "Reminds you when to follow up and drafts the message.", icon: BellRing },
  { title: "Interview", body: "Builds a prep plan with likely questions and your best stories.", icon: CalendarCheck },
];

export function Journey() {
  return (
    <MarketingSection id="how" labelledBy="how-title" className="border-y border-border bg-surface/50">
      <SectionHeading
        id="how-title"
        align="center"
        eyebrow="How it works"
        title="One agent for the entire journey — you hold the decision points"
        description="Applier handles the tedious parts of a job search end to end, and pauses at every step that matters so you can decide."
      />
      <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {JOURNEY.map((s, i) => (
          <Reveal as="li" key={s.title} delay={Math.min(i * 0.04, 0.3)}>
            <div
              className={cn(
                "group relative h-full rounded-2xl border bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop",
                s.you ? "border-primary/40 shadow-glow" : "border-border shadow-card",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl [&_svg]:size-5",
                    s.you ? "bg-gradient-brand text-white" : "bg-primary-soft text-primary-soft-fg",
                  )}
                >
                  <s.icon aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="tabular text-caption font-medium text-subtle">Step {i + 1}</p>
                  <h3 className="text-h3 font-semibold">{s.title}</h3>
                </div>
                {s.you && (
                  <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary-soft-fg">
                    You decide
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </MarketingSection>
  );
}
