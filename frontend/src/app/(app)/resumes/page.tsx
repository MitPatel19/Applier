"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, ShieldCheck, Upload, UserRound } from "lucide-react";
import { useResumes } from "@/lib/queries/resumes";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { Switch } from "@/components/ui/primitives";
import { ResumeCard } from "@/components/resume/resume-card";
import { ResumeCenterNav } from "@/components/resume/resume-center-nav";
import { CreateFromProfileDialog, UploadResumeDialog } from "@/components/resume/resume-dialogs";

export default function ResumesPage() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useResumes();
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);

  const all = data ?? [];
  const archivedCount = all.filter((r) => r.status === "archived").length;
  const visible = all
    .filter((r) => showArchived || r.status !== "archived")
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || b.updated_at.localeCompare(a.updated_at));

  const actions = (
    <>
      <Button variant="secondary" onClick={() => setCreateOpen(true)}>
        <UserRound /> Create from profile
      </Button>
      <Button onClick={() => setUploadOpen(true)}>
        <Upload /> Upload resume
      </Button>
    </>
  );

  return (
    <div>
      <ResumeCenterNav className="mb-5" />
      <PageHeader
        title="Resume Center"
        description="Your base resumes. For every job, Applier creates a tailored version you review — your originals are never changed."
        actions={actions}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading resumes">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} lines={4} />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} title="We couldn't load your resumes" onRetry={() => refetch()} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Add your first resume"
          description="Upload a PDF or Word file, or build one from your profile. Applier tailors it for each job — you approve every change."
          action={
            <Button onClick={() => setUploadOpen(true)}>
              <Upload /> Upload resume
            </Button>
          }
          secondaryAction={
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>
              <UserRound /> Create from profile
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" aria-live="polite">
              {visible.length} {visible.length === 1 ? "resume" : "resumes"}
              {!showArchived && archivedCount > 0 && ` · ${archivedCount} archived hidden`}
            </p>
            {archivedCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted">
                <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived resumes" /> Show archived
              </label>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((r) => (
              <div key={r.id} className="animate-rise">
                <ResumeCard resume={r} />
              </div>
            ))}
          </div>
          <p className="mt-8 flex items-center gap-2 text-caption text-subtle">
            <ShieldCheck className="size-3.5 text-success" aria-hidden /> Applier never adds skills or experience you don&apos;t have —
            tailoring only reorders, emphasizes and rewords.
          </p>
        </>
      )}

      <UploadResumeDialog
        key={isLoading ? "loading" : String(all.length === 0)}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        isFirst={all.length === 0}
        onUploaded={(r) => router.push(`/resumes/${r.id}`)}
      />
      <CreateFromProfileDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(r) => router.push(`/resumes/${r.id}`)} />
    </div>
  );
}
