import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/app/logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "Job discovery", href: "/#discovery" },
      { label: "Match analysis", href: "/#analysis" },
      { label: "Resume tailoring", href: "/#resume" },
      { label: "Interview prep", href: "/#interview" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Privacy & Security", href: "/security" },
      { label: "Human-in-the-loop", href: "/security#control" },
      { label: "Your data rights", href: "/security#data" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Create account", href: "/register" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Your personal AI career agent. It does the searching and preparing — you make every decision.
          </p>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
            <ShieldCheck className="size-3.5 text-success" aria-hidden />
            Nothing is submitted without your approval
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-caption font-semibold uppercase tracking-[0.12em] text-subtle">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted transition-colors hover:text-text">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-caption text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Applier. Built for job seekers, not for spam.</p>
          <p>Encrypted in transit and at rest · OAuth only · Export or delete anytime</p>
        </div>
      </div>
    </footer>
  );
}
