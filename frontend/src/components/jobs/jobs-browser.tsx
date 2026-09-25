"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bookmark,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  EyeOff,
  Inbox,
  Search,
  SearchX,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { SOURCE_LABELS, TIER_LABELS, WORK_ARRANGEMENT_LABELS } from "@/lib/constants";
import { useJobs, useUnhideJob } from "@/lib/queries/jobs";
import type { Job, JobCounts, JobListQuery, JobView, MatchTier, WorkArrangement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/layout";
import { ChipSelect } from "@/components/ui/tag-input";
import { JobCard } from "@/components/app/job-card";
import { AgentRunningBanner, RunAgentButton } from "@/components/agent/run-agent";
import { AddJobDialog } from "./add-job-dialog";

const PAGE_SIZE = 20;
type Sort = NonNullable<JobListQuery["sort"]>;

const VIEWS: { value: JobView; label: string; icon: typeof Compass; countKey: keyof JobCounts }[] = [
  { value: "all", label: "All", icon: Compass, countKey: "all" },
  { value: "recommended", label: "Recommended", icon: Sparkles, countKey: "recommended" },
  { value: "new", label: "New", icon: Inbox, countKey: "new" },
  { value: "saved", label: "Saved", icon: Bookmark, countKey: "saved" },
  { value: "closing_soon", label: "Closing soon", icon: CalendarClock, countKey: "closing_soon" },
  { value: "hidden", label: "Hidden", icon: EyeOff, countKey: "hidden" },
];

const HEADERS: Record<JobView, { title: string; description: string }> = {
  all: { title: "Discover jobs", description: "Every job your agent found — merged across sources and scored against your profile." },
  recommended: {
    title: "Recommended for you",
    description: "Strong and good matches for your profile, with the reasons behind every recommendation.",
  },
  new: { title: "New jobs", description: "Found in the last 72 hours and not opened yet." },
  saved: { title: "Saved jobs", description: "Positions you've bookmarked to review later." },
  closing_soon: { title: "Closing soon", description: "Deadlines are coming up — decide on these first." },
  hidden: {
    title: "Hidden jobs",
    description: "Jobs hidden by your quality filters or by you. Each one shows why, and you can bring it back.",
  },
};

const TIERS: MatchTier[] = ["strong", "good", "possible", "weak"];
const FILTER_KEYS = ["q", "tier", "source", "work_arrangement", "sort"] as const;

function isView(v: string | null): v is JobView {
  return !!v && VIEWS.some((x) => x.value === v);
}

function viewHref(view: JobView, params: URLSearchParams) {
  const keep = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  let base = "/jobs";
  if (view === "recommended") base = "/jobs/recommended";
  else if (view === "saved") base = "/jobs/saved";
  else if (view !== "all") keep.set("view", view);
  const qs = keep.toString();
  return qs ? `${base}?${qs}` : base;
}

// ------------------------------------------------------------------ search box (debounced → URL)

function SearchBox({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = React.useState(value);
  const [prev, setPrev] = React.useState(value);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = React.useRef(onCommit);
  React.useEffect(() => {
    onCommitRef.current = onCommit;
  });
  if (value !== prev) {
    setPrev(value);
    setDraft(value);
  }
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const commit = (v: string, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommitRef.current(v.trim()), delay);
  };
  return (
    <div className="relative min-w-0 flex-1">
      <Input
        type="search"
        icon={<Search />}
        value={draft}
        aria-label="Search jobs by title, company, skill or location"
        placeholder="Search title, company, skill…"
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value, 350);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft, 0);
        }}
        className="pr-9"
      />
      {draft && (
        <button
          type="button"
          className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:bg-bg-subtle hover:text-text"
          aria-label="Clear search"
          onClick={() => {
            setDraft("");
            commit("", 0);
          }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ card variants

function RecommendedJob({ job, index }: { job: Job; index: number }) {
  const m = job.match;
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <JobCard job={job} className={m ? "rounded-b-none hover:translate-y-0" : undefined} />
      {m && (m.top_matched.length > 0 || m.top_missing.length > 0) && (
        <div className="rounded-b-xl border border-t-0 border-border bg-bg-subtle/70 px-4 py-3 sm:px-5">
          <p className="text-caption font-semibold uppercase tracking-wider text-subtle">Recommended because</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.top_matched.slice(0, 5).map((s) => (
              <Badge key={`m-${s}`} tone="success" size="xs">
                <CheckCircle2 className="size-3" aria-hidden /> {s}
              </Badge>
            ))}
            {m.top_missing.slice(0, 3).map((s) => (
              <Badge key={`x-${s}`} tone="warning" size="xs">
                <span className="sr-only">Gap: </span>
                <span aria-hidden>Gap ·</span> {s}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

function HiddenJob({ job, index }: { job: Job; index: number }) {
  const unhide = useUnhideJob();
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <JobCard job={job} className="rounded-b-none opacity-80 hover:translate-y-0 hover:opacity-100" />
      <div className="flex flex-col gap-3 rounded-b-xl border border-t-0 border-border bg-bg-subtle/70 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider text-subtle">
            <EyeOff className="size-3.5" aria-hidden /> Hidden because
          </p>
          {job.hidden_reasons.length ? (
            <ul className="mt-1 space-y-0.5 text-sm text-muted">
              {job.hidden_reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">You hid this job.</p>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={unhide.isPending}
          onClick={() =>
            unhide.mutate(job.id, {
              onSuccess: () => toast.success("Job is visible again", { description: "It's back in your Discover list." }),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          <Undo2 /> Show anyway
        </Button>
      </div>
    </li>
  );
}

function JobListSkeleton() {
  return (
    <ul className="space-y-3" role="status" aria-label="Loading jobs">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex gap-4 rounded-xl border border-border bg-surface p-5" aria-hidden>
          <Skeleton className="hidden size-[54px] rounded-full sm:block" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-4/5" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ViewEmpty({ view, filtered, onClear }: { view: JobView; filtered: boolean; onClear: () => void }) {
  if (filtered) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="No jobs match these filters"
        description="Try removing a filter or searching for something broader."
        action={
          <Button variant="secondary" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    );
  }
  const discover = (
    <Button asChild variant="secondary">
      <Link href="/jobs">
        <Compass /> Discover jobs
      </Link>
    </Button>
  );
  switch (view) {
    case "saved":
      return <EmptyState icon={<Bookmark />} title="No Saved Jobs" description="Save interesting positions and review them later." action={discover} />;
    case "recommended":
      return (
        <EmptyState
          icon={<Sparkles />}
          title="No recommendations yet"
          description="When jobs score as a Strong or Good match for your profile, they'll appear here with the reasons why. Run a search, or add more skills to your profile."
          action={<RunAgentButton label="Run search" />}
          secondaryAction={discover}
        />
      );
    case "new":
      return <EmptyState icon={<Inbox />} title="You're all caught up" description="No new jobs since your last visit. Your agent will add fresh ones on its next run." action={discover} />;
    case "closing_soon":
      return <EmptyState icon={<CalendarClock />} title="Nothing closing soon" description="No deadlines coming up. We'll flag jobs here as their deadlines approach." action={discover} />;
    case "hidden":
      return (
        <EmptyState
          icon={<EyeOff />}
          title="Nothing hidden"
          description="Jobs hidden by your quality filters (like expired or suspicious postings) or by you will appear here, with the reason."
          action={discover}
        />
      );
    default:
      return (
        <EmptyState
          icon={<Compass />}
          title="No jobs yet"
          description="Run your first search and your agent will collect jobs from LinkedIn, Indeed and employer websites, then score each one for you."
          action={<RunAgentButton label="Run your first search" />}
          secondaryAction={
            <Button asChild variant="secondary">
              <Link href="/jobs/search">
                <Search /> Build a custom search
              </Link>
            </Button>
          }
        />
      );
  }
}

// ------------------------------------------------------------------ main

/**
 * Shared list for Discover / Recommended / Saved. Filters, view and page live in the URL so
 * results are linkable and survive reloads. `routeView` pins the view for dedicated routes.
 */
export function JobsBrowser({ routeView }: { routeView?: JobView }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const urlView = params.get("view");
  const view: JobView = routeView ?? (isView(urlView) ? urlView : "all");
  const q = params.get("q") ?? "";
  const tier = (params.get("tier") ?? "") as MatchTier | "";
  const source = params.get("source") ?? "";
  const arrangement = (params.get("work_arrangement") ?? "") as WorkArrangement | "";
  const sort = (params.get("sort") ?? (view === "closing_soon" ? "deadline" : "match")) as Sort;
  const page = Math.max(1, Number(params.get("page")) || 1);

  const query: JobListQuery = { view, q, tier, source, work_arrangement: arrangement, sort, page, page_size: PAGE_SIZE };
  const jobs = useJobs(query);

  const update = React.useCallback(
    (patch: Record<string, string | number | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || v === undefined) next.delete(k);
        else next.set(k, String(v));
      }
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const filtered = !!(q || tier || source || arrangement);
  const clearFilters = () => update({ q: null, tier: null, source: null, work_arrangement: null });

  const counts = jobs.data?.counts;
  const relevant = counts ? counts.strong + counts.good + counts.possible : 0;
  const total = jobs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const header = HEADERS[view];

  const setPage = (p: number) => {
    update({ page: p > 1 ? p : null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div>
      <PageHeader
        title={header.title}
        description={header.description}
        actions={
          <>
            <AddJobDialog />
            <RunAgentButton label="Run search" />
          </>
        }
      >
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          {counts ? (
            <>
              <span className="font-semibold text-text">{relevant} Relevant Jobs</span>
              <span className="text-subtle"> · </span>
              <span className="font-medium text-success">{counts.strong} Strong</span>
              <span className="text-subtle"> · </span>
              <span className="font-medium text-primary">{counts.good} Good</span>
              <span className="text-subtle"> · </span>
              <span className="font-medium text-warning">{counts.possible} Possible</span>
            </>
          ) : (
            <Skeleton className="inline-block h-4 w-72 max-w-full align-middle" />
          )}
        </p>
      </PageHeader>

      <AgentRunningBanner className="mb-5" />

      {/* View switch */}
      <nav aria-label="Job views" className="mb-4 max-w-full overflow-x-auto scrollbar-thin">
        <ul className="inline-flex items-center gap-1 rounded-xl border border-border bg-bg-subtle p-1">
          {VIEWS.map((v) => {
            const active = v.value === view;
            const count = counts?.[v.countKey];
            return (
              <li key={v.value}>
                <Link
                  href={viewHref(v.value, params)}
                  aria-current={active ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors",
                    active ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
                  )}
                >
                  <v.icon className="size-4" aria-hidden />
                  {v.label}
                  {count !== undefined && (
                    <span className={cn("tabular rounded-full px-1.5 text-caption", active ? "bg-primary-soft text-primary-soft-fg" : "bg-surface text-subtle")}>
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Filters */}
      <div className="mb-5 space-y-3 rounded-2xl border border-border bg-surface p-3 shadow-card sm:p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <SearchBox value={q} onCommit={(v) => update({ q: v || null })} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:flex">
            <Select aria-label="Source" value={source} onChange={(e) => update({ source: e.target.value || null })} className="md:w-40">
              <option value="">All sources</option>
              <option value="linkedin">LinkedIn</option>
              <option value="indeed">Indeed</option>
              <option value="company_site">Company websites</option>
              <option value="manual">{SOURCE_LABELS.manual}</option>
            </Select>
            <Select
              aria-label="Work arrangement"
              value={arrangement}
              onChange={(e) => update({ work_arrangement: e.target.value || null })}
              className="md:w-36"
            >
              <option value="">Any setup</option>
              {(Object.keys(WORK_ARRANGEMENT_LABELS) as WorkArrangement[]).map((k) => (
                <option key={k} value={k}>
                  {WORK_ARRANGEMENT_LABELS[k]}
                </option>
              ))}
            </Select>
            <Select aria-label="Sort by" value={sort} onChange={(e) => update({ sort: e.target.value })} className="col-span-2 sm:col-span-1 md:w-40">
              <option value="match">Best match</option>
              <option value="date">Newest</option>
              <option value="salary">Highest salary</option>
              <option value="deadline">Deadline</option>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption font-medium uppercase tracking-wider text-subtle">Match</span>
          <ChipSelect<MatchTier>
            aria-label="Filter by match strength"
            single
            options={TIERS.map((t) => ({
              value: t,
              label: counts && t !== "weak" ? `${TIER_LABELS[t].replace(" match", "")} · ${counts[t]}` : TIER_LABELS[t].replace(" match", ""),
            }))}
            value={tier ? [tier] : []}
            onChange={(next) => update({ tier: next.find((t) => t !== tier) ?? null })}
          />
          {filtered && (
            <Button size="sm" variant="ghost" onClick={clearFilters} className="ml-auto">
              <X /> Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {jobs.isLoading ? (
        <JobListSkeleton />
      ) : jobs.isError ? (
        <ErrorState error={jobs.error} title="We couldn't load jobs" onRetry={() => jobs.refetch()} onContinue={filtered ? clearFilters : undefined} continueLabel="Clear filters" />
      ) : !jobs.data?.items.length ? (
        <ViewEmpty view={view} filtered={filtered} onClear={clearFilters} />
      ) : (
        <div className={cn("transition-opacity", jobs.isPlaceholderData && "opacity-60")} aria-busy={jobs.isFetching}>
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} {total === 1 ? "job" : "jobs"}
          </p>
          <ul className="space-y-3">
            {jobs.data.items.map((job, i) =>
              view === "hidden" ? (
                <HiddenJob key={job.id} job={job} index={i} />
              ) : view === "recommended" ? (
                <RecommendedJob key={job.id} job={job} index={i} />
              ) : (
                <li key={job.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <JobCard job={job} />
                </li>
              ),
            )}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-3">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft /> Previous
              </Button>
              <span className="tabular text-sm text-muted">
                Page {page} of {pages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next <ChevronRight />
              </Button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

/** Suspense fallback for pages that render JobsBrowser (it reads search params). */
export function JobsBrowserFallback() {
  return (
    <div>
      <div className="mb-8 space-y-3" aria-hidden>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <JobListSkeleton />
    </div>
  );
}
