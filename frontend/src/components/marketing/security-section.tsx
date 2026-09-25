import Link from "next/link";
import { ArrowRight, Download, Hand, KeyRound, LockKeyhole, MailCheck, ScrollText, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";
import { MarketingSection, SectionHeading } from "./section";

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Hand,
    title: "Nothing is submitted without your approval",
    body: "Automatic submission is permanently off. Every application waits for your explicit confirmation.",
  },
  {
    icon: LockKeyhole,
    title: "Encrypted in transit and at rest",
    body: "TLS everywhere, and connected-account tokens are encrypted before they're stored.",
  },
  {
    icon: KeyRound,
    title: "OAuth only — no stored passwords",
    body: "We never ask for or store your LinkedIn, Indeed or email passwords. Disconnect anytime.",
  },
  {
    icon: MailCheck,
    title: "Minimal email permissions",
    body: "Email access is optional and read-only, used only to detect replies about your applications.",
  },
  {
    icon: ScrollText,
    title: "A complete audit log",
    body: "Every action the agent takes is recorded in plain language, so you can see exactly what happened.",
  },
  {
    icon: Download,
    title: "Export or delete, anytime",
    body: "Download everything we store about you in one file, or permanently delete your account.",
  },
];

export function SecuritySection() {
  return (
    <MarketingSection id="security" labelledBy="security-title" className="relative isolate overflow-hidden">
      <div className="bg-aurora pointer-events-none absolute inset-0 -z-10 opacity-80" aria-hidden />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeading
          id="security-title"
          eyebrow="Security & control"
          title="Built on trust. You're in control of every step."
          description="An agent that acts on your behalf has to earn it. These guarantees are built into the product, not buried in a policy."
        />
        <Button variant="secondary" asChild className="self-start lg:self-auto">
          <Link href="/security">
            Read our security overview <ArrowRight />
          </Link>
        </Button>
      </div>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((p, i) => (
          <Reveal as="li" key={p.title} delay={Math.min(i * 0.05, 0.25)}>
            <div className="h-full rounded-2xl border border-border bg-surface/90 p-5 shadow-card">
              <span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-success">
                <p.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          </Reveal>
        ))}
      </ul>
    </MarketingSection>
  );
}
