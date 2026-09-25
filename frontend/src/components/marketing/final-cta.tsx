import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="px-4 py-16 sm:px-6 sm:py-24">
      <Reveal className="mx-auto max-w-5xl">
        <div className="relative isolate overflow-hidden rounded-3xl border border-border bg-surface px-6 py-14 text-center shadow-pop sm:px-12 sm:py-16">
          <div className="bg-aurora pointer-events-none absolute inset-0 -z-10" aria-hidden />
          <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-70" aria-hidden />
          <h2 id="cta-title" className="mx-auto max-w-2xl text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] sm:text-[2.5rem]">
            Let your career agent do the legwork. <span className="text-gradient">You make the calls.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Set up your profile in a few minutes and wake up to a shortlist of jobs that actually fit.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">
                Start My Job Search <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href="/login">I already have an account</Link>
            </Button>
          </div>
          <p className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted">
            <ShieldCheck className="size-4 text-success" aria-hidden /> Nothing is ever submitted without your approval.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
