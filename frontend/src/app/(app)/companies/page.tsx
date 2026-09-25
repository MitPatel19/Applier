"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Search, SearchX } from "lucide-react";
import { useCompanies } from "@/lib/queries/companies";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/layout";
import { CompanyCard } from "@/components/companies/company-card";
import { FactLegend } from "@/components/companies/company-facts";

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function CompaniesPage() {
  const [q, setQ] = React.useState("");
  const debounced = useDebounced(q.trim());
  const companies = useCompanies(debounced);
  const count = companies.data?.length ?? 0;

  return (
    <div>
      <PageHeader
        title="Company research"
        description="Everything your agent has learned about the employers in your search — with every fact labelled by how reliable it is."
      >
        <FactLegend className="mt-4" />
      </PageHeader>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:max-w-md sm:flex-1">
          <Input
            type="search"
            icon={<Search />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search companies or industries…"
            aria-label="Search companies"
          />
        </div>
        {companies.data && (
          <p className="text-sm text-muted sm:ml-auto" aria-live="polite">
            {count} {count === 1 ? "company" : "companies"}
          </p>
        )}
      </div>

      {companies.isLoading ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading companies">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="rounded-xl border border-border bg-surface p-5" aria-hidden>
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="mt-4 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-4/5" />
            </li>
          ))}
        </ul>
      ) : companies.isError ? (
        <ErrorState error={companies.error} title="We couldn't load companies" onRetry={() => companies.refetch()} />
      ) : count === 0 ? (
        debounced ? (
          <EmptyState
            icon={<SearchX />}
            title={`No companies match “${debounced}”`}
            description="Try a different name or industry."
            action={
              <Button variant="secondary" onClick={() => setQ("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Building2 />}
            title="No companies yet"
            description="Companies appear here as your agent finds jobs. Run a search and each employer will get its own research profile."
            action={
              <Button asChild>
                <Link href="/jobs/search">Find jobs</Link>
              </Button>
            }
          />
        )
      ) : (
        <ul className={cn("grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3", companies.isPlaceholderData && "opacity-60")}>
          {(companies.data ?? []).map((c, i) => (
            <CompanyCard key={c.id} company={c} index={i} />
          ))}
        </ul>
      )}
    </div>
  );
}
