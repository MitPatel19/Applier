"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/resumes", label: "Resumes", icon: FileText },
  { href: "/cover-letters", label: "Cover Letters", icon: Mail },
];

/** Resumes / Cover Letters switcher shown at the top of the Resume Center pages. */
export function ResumeCenterNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Resume Center" className={cn("inline-flex gap-1 rounded-xl border border-border bg-bg-subtle p-1", className)}>
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
            )}
          >
            <l.icon className="size-4" aria-hidden /> {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
