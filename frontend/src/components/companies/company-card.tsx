"use client";

import * as React from "react";
import Link from "next/link";
import { Briefcase, MapPin, Users } from "lucide-react";
import type { Company } from "@/lib/types";
import { cn, initials, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/app/status";

export function CompanyAvatar({ name, size = "md", className }: { name: string; size?: "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-gradient-brand font-semibold text-white shadow-glow",
        size === "lg" ? "size-16 text-xl" : "size-11 text-sm",
        className,
      )}
      aria-hidden
    >
      {initials(name) || "?"}
    </span>
  );
}

export function CompanyCard({ company, index = 0 }: { company: Company; index?: number }) {
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
      <article className="group relative flex h-full flex-col rounded-xl border border-border bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop">
        <div className="flex items-start gap-3">
          <CompanyAvatar name={company.name} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">
              <Link href={`/companies/${company.id}`} className="after:absolute after:inset-0 hover:text-primary focus-visible:outline-none">
                {company.name}
              </Link>
            </h3>
            <p className="truncate text-sm text-muted">{company.industry ?? "Industry unknown"}</p>
          </div>
          {company.open_jobs > 0 && (
            <Badge tone="primary" size="xs">
              <Briefcase className="size-3" aria-hidden /> {company.open_jobs} open
            </Badge>
          )}
        </div>
        {company.description && <p className="mt-3 line-clamp-2 text-sm text-muted">{company.description}</p>}
        <div className="mt-auto pt-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
            {company.headquarters && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden /> {company.headquarters}
              </span>
            )}
            {company.size && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" aria-hidden /> {company.size}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-caption">
            <span className={company.researched_at ? "text-subtle" : "text-warning"}>
              {company.researched_at ? `Researched ${relativeTime(company.researched_at)}` : "Not researched yet"}
            </span>
            {company.is_demo && <DemoBadge />}
          </div>
        </div>
      </article>
    </li>
  );
}
