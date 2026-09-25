"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Briefcase, Building2, ExternalLink, Newspaper, RefreshCw, SearchX } from "lucide-react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/api";
import { useCompany, useResearchCompany } from "@/lib/queries/companies";
import type { Company } from "@/lib/types";
import { hostFromUrl, relativeTime } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton, SkeletonCard } from "@/components/ui/feedback";
import { KeyValue } from "@/components/ui/layout";
import { JobCard } from "@/components/app/job-card";
import { DemoBadge, StatusBadge } from "@/components/app/status";
import { CompanyAvatar } from "@/components/companies/company-card";
import { CompanyFactGroups, FactItem, FactLegend, isDevelopment } from "@/components/companies/company-facts";
import { CompanyNotes } from "@/components/companies/company-notes";

function ExternalA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      {children}
      <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function ChipSection({ title, items, tone = "neutral", empty }: { title: string; items: string[]; tone?: BadgeTone; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{title}</p>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((i) => (
            <Badge key={i} tone={tone}>
              {i}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-subtle">{empty}</p>
      )}
    </div>
  );
}

function ResearchButton({ company }: { company: Company }) {
  const research = useResearchCompany();
  return (
    <Button
      variant={company.researched_at ? "secondary" : "gradient"}
      loading={research.isPending}
      onClick={() =>
        research.mutate(company.id, {
          onSuccess: (c) =>
            toast.success("Research updated", {
              description: `${c.facts.length} facts collected. Each one is labelled as verified, third-party opinion, or inferred.`,
            }),
          onError: (e) => toast.error("Couldn't research this company", { description: `${errorMessage(e)} Existing research is unchanged.` }),
        })
      }
    >
      {!research.isPending && <RefreshCw />}
      {research.isPending ? "Researching…" : company.researched_at ? "Refresh research" : "Research this company"}
    </Button>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading company">
      <div className="flex items-center gap-4" aria-hidden>
        <Skeleton className="size-16 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={6} />
        </div>
        <div className="space-y-6">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    </div>
  );
}

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isFinite(id) && id > 0;
  const router = useRouter();
  const q = useCompany(valid ? id : null);

  if (!valid || (q.error instanceof ApiError && q.error.status === 404)) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="We couldn't find this company"
        description="It may have been removed, or the link is incorrect."
        action={
          <Button asChild>
            <Link href="/companies">All companies</Link>
          </Button>
        }
      />
    );
  }
  if (q.isLoading) return <DetailSkeleton />;
  if (q.isError || !q.data) {
    return (
      <ErrorState
        error={q.error}
        title="We couldn't load this company"
        onRetry={() => q.refetch()}
        onContinue={() => router.push("/companies")}
        continueLabel="All companies"
      />
    );
  }

  const { company: c, jobs, applications } = q.data;
  const developments = c.facts.filter(isDevelopment);
  const otherFacts = c.facts.filter((f) => !isDevelopment(f));

  return (
    <div>
      <Link href="/companies" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Companies
      </Link>

      <header className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-card animate-rise">
        <div className="bg-aurora pointer-events-none absolute inset-0 opacity-80" aria-hidden />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
          <CompanyAvatar name={c.name} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h1 font-semibold">{c.name}</h1>
              {c.is_demo && <DemoBadge />}
            </div>
            <p className="mt-1 text-sm text-muted">
              {[c.industry, c.headquarters, c.size].filter(Boolean).join(" · ") || "Details not researched yet"}
            </p>
            <p className="mt-1 text-caption text-subtle">
              {c.researched_at ? `Research updated ${relativeTime(c.researched_at)}` : "Not researched yet"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ResearchButton company={c} />
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>About {c.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {c.description ? (
                <p className="max-w-[70ch] text-[15px] leading-relaxed">{c.description}</p>
              ) : (
                <p className="text-sm text-muted">No description yet. Run research to collect a summary from public sources.</p>
              )}
              <ChipSection title="Products & services" items={c.products} />
              <ChipSection title="Tech stack" items={c.tech_stack} tone="primary" />
              <ChipSection title="Benefits" items={c.benefits} tone="accent" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>What we know</CardTitle>
                <CardDescription>Every fact shows where it came from, so you can judge how much to trust it.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <FactLegend />
              {otherFacts.length ? (
                <CompanyFactGroups facts={otherFacts} />
              ) : (
                <p className="text-sm text-muted">No facts collected yet. Choose “Research this company” to gather them.</p>
              )}
            </CardContent>
          </Card>

          {developments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Newspaper className="size-4 text-subtle" aria-hidden /> Recent developments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {developments.map((f, i) => (
                    <FactItem key={`${f.text}-${i}`} fact={f} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <section aria-labelledby="open-jobs" className="space-y-3">
            <div className="flex items-end justify-between gap-2">
              <h2 id="open-jobs" className="text-h2 font-semibold">
                Open jobs {jobs.length > 0 && <span className="text-muted">· {jobs.length}</span>}
              </h2>
            </div>
            {jobs.length === 0 ? (
              <EmptyState compact icon={<Briefcase />} title="No open jobs found" description="Your agent will add new postings from this company as it finds them." />
            ) : (
              <ul className="space-y-3">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <JobCard job={j} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Company overview">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-subtle" aria-hidden /> Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <KeyValue label="Industry">{c.industry ?? <span className="text-subtle">Unknown</span>}</KeyValue>
                <KeyValue label="Size">{c.size ?? <span className="text-subtle">Unknown</span>}</KeyValue>
                <KeyValue label="Headquarters" className="col-span-2">
                  {c.headquarters ?? <span className="text-subtle">Unknown</span>}
                </KeyValue>
                <KeyValue label="Website" className="col-span-2">
                  {c.website ? <ExternalA href={c.website}>{hostFromUrl(c.website) ?? c.website}</ExternalA> : <span className="text-subtle">Unknown</span>}
                </KeyValue>
                <KeyValue label="Careers page" className="col-span-2">
                  {c.careers_url ? <ExternalA href={c.careers_url}>{hostFromUrl(c.careers_url) ?? "Open"}</ExternalA> : <span className="text-subtle">Unknown</span>}
                </KeyValue>
                {c.locations.length > 0 && (
                  <KeyValue label="Locations" className="col-span-2">
                    <span className="whitespace-normal">{c.locations.join(" · ")}</span>
                  </KeyValue>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your applications</CardTitle>
            </CardHeader>
            <CardContent>
              {applications.length === 0 ? (
                <p className="text-sm text-muted">You haven&apos;t applied here yet.</p>
              ) : (
                <ul className="space-y-2">
                  {applications.map((a) => (
                    <li key={a.id}>
                      <Link href={`/applications/${a.id}`} className="group flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-bg-subtle">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium group-hover:text-primary">{a.job_title}</span>
                          <span className="mt-1 block">
                            <StatusBadge status={a.status} size="xs" />
                          </span>
                        </span>
                        <ArrowRight className="size-4 text-subtle" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <CompanyNotes key={c.id} companyId={c.id} initial={c.notes} />
        </aside>
      </div>
    </div>
  );
}
