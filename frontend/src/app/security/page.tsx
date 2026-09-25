import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  Download,
  Eye,
  Hand,
  KeyRound,
  LockKeyhole,
  MailCheck,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Privacy & Security",
  description:
    "How Applier protects your data: encryption in transit and at rest, OAuth-only connections, minimal email permissions, a full audit log, and human approval for every application.",
};

const TOC = [
  { id: "control", label: "Human-in-the-loop" },
  { id: "never", label: "What the agent never does" },
  { id: "protection", label: "How data is protected" },
  { id: "accounts", label: "Connected accounts" },
  { id: "audit", label: "Audit log" },
  { id: "data", label: "Export & delete" },
];

const HIGHLIGHTS: { icon: LucideIcon; title: string; sub: string }[] = [
  { icon: Hand, title: "Human approval", sub: "for every application" },
  { icon: LockKeyhole, title: "Encrypted", sub: "in transit and at rest" },
  { icon: KeyRound, title: "OAuth only", sub: "no stored passwords" },
  { icon: Download, title: "Export or delete", sub: "at any time" },
];

const NEVER = [
  "Submit an application without your explicit confirmation",
  "Invent experience, skills, titles, dates, degrees or results",
  "Ask for, see or store your job-board or email passwords",
  "Send email or messages to employers on your behalf",
  "Sell your data or use it to advertise to you",
  "Hide why it recommended — or skipped — a job",
];

function Block({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-border py-10 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
          <Icon className="size-5" aria-hidden />
        </span>
        <h2 id={`${id}-title`} className="text-h2 font-semibold sm:text-[1.5rem]">
          {title}
        </h2>
      </div>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Point({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-surface p-4 shadow-card">
      <Icon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
      <div>
        <p className="font-medium text-text">{title}</p>
        <p className="mt-1 text-sm text-muted">{children}</p>
      </div>
    </li>
  );
}

export default function SecurityPage() {
  return (
    <div className="relative isolate min-h-dvh bg-bg">
      <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem]" aria-hidden />
      <SiteHeader />
      <main id="main">
        <header className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-medium text-muted shadow-card">
            <ShieldCheck className="size-3.5 text-success" aria-hidden /> Privacy & Security
          </p>
          <h1 className="mt-5 max-w-3xl text-[2.25rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[3rem]">
            Your career data, <span className="text-gradient">protected and in your hands</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            Applier acts on your behalf, so it has to earn your trust. Here is exactly how we protect your information — and
            the lines the agent will never cross.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, sub }) => (
              <li key={title} className="flex items-center gap-3 rounded-xl border border-border bg-surface/90 p-4 shadow-card">
                <Icon className="size-5 shrink-0 text-success" aria-hidden />
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-caption text-muted">{sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </header>

        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 sm:px-6 lg:grid-cols-[14rem_1fr] lg:gap-16">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-caption font-semibold uppercase tracking-[0.12em] text-subtle">On this page</p>
              <ul className="mt-3 space-y-1 border-l border-border">
                {TOC.map((t) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm text-muted transition-colors hover:border-primary hover:text-text"
                    >
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="min-w-0 max-w-3xl">
            <Block id="control" icon={Hand} title="Human-in-the-loop, by design">
              <p>
                Applier is an assistant, not an autopilot. It searches, analyzes and prepares — then stops and waits for you at
                every consequential step.
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                <Point icon={ShieldCheck} title="Automatic submission is permanently off">
                  The setting is shown locked, and the server always keeps it off — no matter what.
                </Point>
                <Point icon={Eye} title="You see the final preview">
                  Resume version, cover letter, answers and destination — reviewed by you before anything is sent.
                </Point>
                <Point icon={ScrollText} title="Every resume change is reviewable">
                  Each suggestion shows the before, the after and the reason. Accept or reject individually.
                </Point>
                <Point icon={Hand} title="Confirmations for destructive actions">
                  Deleting data, disconnecting accounts or withdrawing applications always asks first.
                </Point>
              </ul>
            </Block>

            <Block id="never" icon={Ban} title="What the agent will never do">
              <ul className="space-y-2.5">
                {NEVER.map((n) => (
                  <li key={n} className="flex gap-3">
                    <Ban className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    <span className="text-text">{n}</span>
                  </li>
                ))}
              </ul>
            </Block>

            <Block id="protection" icon={LockKeyhole} title="How your data is protected">
              <p>
                <strong className="font-semibold text-text">In transit:</strong> all traffic between your browser, Applier and
                connected services is encrypted with TLS.
              </p>
              <p>
                <strong className="font-semibold text-text">At rest:</strong> OAuth tokens for connected accounts and the resumes
                you upload are encrypted before they are stored, in private storage scoped to your account.
              </p>
              <p>
                <strong className="font-semibold text-text">Sessions:</strong> your sign-in lives in a secure, httpOnly cookie
                that page scripts can&apos;t read. Your Applier password is stored only as an Argon2 one-way hash, and repeated failed
                sign-ins are rate-limited. You can sign out of every device at once from Settings.
              </p>
              <p>
                <strong className="font-semibold text-text">Isolation:</strong> every record is scoped to its owner — one
                user&apos;s data is never visible to another.
              </p>
            </Block>

            <Block id="accounts" icon={KeyRound} title="Connected accounts & permissions">
              <p>
                Connecting LinkedIn, Indeed or your email is always optional. When you do, it happens through OAuth — you sign
                in on the provider&apos;s own page, and we receive a limited, revocable token. We never see your password.
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                <Point icon={MailCheck} title="Minimal email access">
                  Read-only, used only to recognize replies about your applications. Applier never sends email for you.
                </Point>
                <Point icon={ServerCog} title="Employer career pages need no account">
                  Public job postings are read directly — no connection or credentials required.
                </Point>
              </ul>
              <p>Disconnecting an account deletes its stored tokens immediately.</p>
            </Block>

            <Block id="audit" icon={ScrollText} title="A plain-language audit log">
              <p>
                Everything the agent does — each search, score, generated document and status change — is recorded with a
                human-readable description, a timestamp and whether it was you or the agent. You can review it anytime from the
                Career Agent page.
              </p>
            </Block>

            <Block id="data" icon={Download} title="Your data, your rights">
              <ul className="grid gap-3 sm:grid-cols-2">
                <Point icon={Download} title="Export everything">
                  Download all personal data we store — profile, resumes, jobs, applications and history — as a single file.
                </Point>
                <Point icon={Trash2} title="Delete permanently">
                  Delete your account and all associated records and uploaded files. This can&apos;t be undone.
                </Point>
              </ul>
              <p>Both options live under Settings → Privacy & Security once you&apos;re signed in.</p>
            </Block>

            <div className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-card sm:flex sm:items-center sm:justify-between sm:gap-6">
              <div>
                <p className="font-semibold">Ready to try a job search you stay in control of?</p>
                <p className="mt-1 text-sm text-muted">Set up takes a few minutes. Nothing goes out without you.</p>
              </div>
              <Button asChild className="mt-4 sm:mt-0">
                <Link href="/register">
                  Get started <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
