"use client";

import * as React from "react";
import Link from "next/link";
import { Compass, Search } from "lucide-react";
import type { JobSearch } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/layout";
import { SearchBuilder } from "@/components/jobs/search-builder";
import { SavedSearches, SearchRunPanel } from "@/components/jobs/saved-searches";

export default function JobSearchPage() {
  const [editing, setEditing] = React.useState<JobSearch | null>(null);
  const [runTask, setRunTask] = React.useState<{ id: number; label: string } | null>(null);
  const runRef = React.useRef<HTMLDivElement>(null);
  const topRef = React.useRef<HTMLDivElement>(null);

  const startRun = (id: number, label: string) => {
    setRunTask({ id, label });
    requestAnimationFrame(() => runRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  return (
    <div ref={topRef} className="scroll-mt-24">
      <PageHeader
        eyebrow={
          <Badge tone="primary" size="xs">
            <Search className="size-3" aria-hidden /> Search builder
          </Badge>
        }
        title="Find jobs in your own words"
        description="Describe what you're looking for. Your agent turns it into precise filters you can check and adjust, then searches LinkedIn, Indeed and employer websites."
        actions={
          <Button asChild variant="secondary">
            <Link href="/jobs">
              <Compass /> Browse jobs
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0">
          <SearchBuilder
            key={editing?.id ?? "new"}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onStarted={startRun}
          />
        </div>
        <div className="min-w-0 space-y-6">
          <div ref={runRef} className="scroll-mt-24 empty:hidden">
            {runTask && <SearchRunPanel key={runTask.id} taskId={runTask.id} label={runTask.label} onClose={() => setRunTask(null)} />}
          </div>
          <SavedSearches
            editingId={editing?.id ?? null}
            onEdit={(s) => {
              setEditing(s);
              requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
            }}
            onRun={startRun}
          />
        </div>
      </div>
    </div>
  );
}
