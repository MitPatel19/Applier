import Link from "next/link";
import { ArrowRight, CircleCheck, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroVisual } from "./hero-visual";

const TRUST = ["Nothing is submitted without your approval", "Never invents experience", "You stay in control"];

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] opacity-70" aria-hidden />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-32 lg:pt-24">
        <div className="animate-rise">
          <Link
            href="#how"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pl-1 pr-3 text-xs font-medium text-muted shadow-card transition-colors hover:border-border-strong hover:text-text"
          >
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-primary-soft-fg">New</span>
            Human-in-the-loop job applications
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <h1
            id="hero-title"
            className="mt-6 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] text-text sm:text-[3.25rem] lg:text-[3.75rem]"
          >
            Your Personal <span className="text-gradient">AI Career Agent</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Discover better opportunities, prepare smarter applications, and manage your entire job search from one place.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">
                Start My Job Search <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href="#how">
                <Play /> See How It Works
              </Link>
            </Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-1.5 text-sm text-muted">
                <CircleCheck className="size-4 text-success" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="animate-fade-in [animation-delay:150ms]">
          <HeroVisual />
          <p className="sr-only">
            Illustration: the Career Agent searching LinkedIn, Indeed and employer career pages, a job marked Ready to Apply
            with an 87% match waiting for your approval, and a transparent match breakdown.
          </p>
        </div>
      </div>
    </section>
  );
}
