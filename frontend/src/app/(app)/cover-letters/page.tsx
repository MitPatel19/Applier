"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Mail, Search, Sparkles } from "lucide-react";
import { COVER_LETTER_VARIANTS, useCoverLetters, wordCount } from "@/lib/queries/cover-letters";
import { relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, SkeletonList } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/layout";
import { GeneratedByBadge } from "@/components/cover-letters/cover-letter-editor";
import { GenerateCoverLetterDialog } from "@/components/cover-letters/generate-dialog";
import { ResumeCenterNav } from "@/components/resume/resume-center-nav";

export default function CoverLettersPage() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useCoverLetters();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"all" | "draft" | "approved">("all");

  const needle = q.trim().toLowerCase();
  const items = (data ?? [])
    .filter((c) => status === "all" || c.status === status)
    .filter((c) => !needle || [c.title, c.company_name, c.job_title].some((s) => s?.toLowerCase().includes(needle)))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const generateBtn = (
    <Button onClick={() => setOpen(true)}>
      <Sparkles /> Generate cover letter
    </Button>
  );

  return (
    <div>
      <ResumeCenterNav className="mb-5" />
      <PageHeader
        title="Cover Letters"
        description="Letters written from your real experience for specific jobs. Edit freely — nothing is sent without your approval."
        actions={generateBtn}
      />

      {isLoading ? (
        <SkeletonList count={4} />
      ) : error ? (
        <ErrorState error={error} title="We couldn't load your cover letters" onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState
          icon={<Mail />}
          title="No cover letters yet"
          description="Pick a job and Applier drafts three versions — professional, short and personalized — from your profile. You edit and approve."
          action={generateBtn}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, company or job" aria-label="Search cover letters" className="sm:max-w-sm" />
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status" className="sm:w-44">
              <option value="all">All statuses</option>
              <option value="draft">Drafts</option>
              <option value="approved">Approved</option>
            </Select>
          </div>
          {items.length === 0 ? (
            <EmptyState compact title="No matches" description="Try a different search or status." />
          ) : (
            <ul className="space-y-2.5">
              {items.map((c) => (
                <li key={c.id} className="animate-rise">
                  <Link
                    href={`/cover-letters/${c.id}`}
                    className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop"
                  >
                    <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent sm:flex" aria-hidden>
                      <Mail className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.title}</p>
                      <p className="mt-0.5 truncate text-sm text-muted">
                        {[c.company_name, c.job_title].filter(Boolean).join(" · ") || "Not linked to a job"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone={c.status === "approved" ? "success" : "warning"} size="xs">
                          {c.status === "approved" ? "Approved" : "Draft"}
                        </Badge>
                        <Badge tone="outline" size="xs">
                          {COVER_LETTER_VARIANTS.find((v) => v.value === c.variant)?.label ?? c.variant}
                        </Badge>
                        <GeneratedByBadge by={c.generated_by} />
                        <span className="text-caption text-subtle">
                          {wordCount(c.content)} words · Updated {relativeTime(c.updated_at)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <GenerateCoverLetterDialog
        open={open}
        onOpenChange={setOpen}
        onGenerated={(cl) => {
          router.push(`/cover-letters/${cl.id}`);
        }}
      />
    </div>
  );
}
