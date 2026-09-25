"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Download, Eye, FileDown, GitBranch, PencilLine, Save, Star, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/api";
import type { ResumeContent, ResumeDetail } from "@/lib/types";
import { resumeUrls, useResumeVersions, useSetDefaultResume, useUpdateResume } from "@/lib/queries/resumes";
import { formatDate, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, SkeletonList } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { ScoreRing } from "@/components/ui/score";
import { DownloadLink } from "@/components/apply/bits";
import { ResumeDocument } from "./resume-document";
import { ResumeEditor } from "./resume-editor";
import { EditResumeDetailsDialog } from "./resume-dialogs";

function VersionsList({ resumeId }: { resumeId: number }) {
  const { data, isLoading, error, refetch } = useResumeVersions(resumeId);
  if (isLoading) return <SkeletonList count={3} />;
  if (error) return <ErrorState compact error={error} title="We couldn't load tailored versions" onRetry={() => refetch()} />;
  if (!data?.length)
    return (
      <EmptyState
        compact
        icon={<GitBranch />}
        title="No tailored versions yet"
        description="When you prepare an application, Applier creates a version of this resume tailored to that job. You review every change."
        action={
          <Button asChild variant="secondary">
            <Link href="/jobs/recommended">Browse recommended jobs</Link>
          </Button>
        }
      />
    );
  return (
    <ul className="space-y-2.5">
      {data.map((v) => (
        <li key={v.id}>
          <Link
            href={`/resumes/versions/${v.id}`}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-pop"
          >
            <ScoreRing score={v.ats_score} size={44} stroke={4} label="ATS score" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{v.label}</p>
              <p className="mt-0.5 truncate text-caption text-subtle">
                {v.file_name} · {formatDate(v.created_at)}
              </p>
            </div>
            <Badge tone={v.status === "approved" ? "success" : "warning"} size="xs">
              {v.status === "approved" ? "Approved" : "Needs review"}
            </Badge>
            <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ResumeDetailView({ resume }: { resume: ResumeDetail }) {
  const router = useRouter();
  const update = useUpdateResume();
  const setDefault = useSetDefaultResume();
  const [draft, setDraft] = React.useState<ResumeContent>(resume.content);
  const [tab, setTab] = React.useState("preview");
  const [leaveTo, setLeaveTo] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const dirty = React.useMemo(() => JSON.stringify(draft) !== JSON.stringify(resume.content), [draft, resume.content]);

  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = () =>
    update.mutate(
      { id: resume.id, content: draft },
      {
        onSuccess: (r) => {
          setDraft(r.content);
          toast.success(`Saved as version ${r.version}`, {
            description: "Future tailored resumes will start from this content. Past applications keep what they sent.",
          });
        },
        onError: (e) => {
          const fe = e instanceof ApiError ? e.fieldErrors[0] : null;
          toast.error(fe ? `${fe.field}: ${fe.message}` : errorMessage(e, "We couldn't save your changes."));
        },
      },
    );

  const guardedNav = (href: string) => (e: React.MouseEvent) => {
    if (!dirty) return;
    e.preventDefault();
    setLeaveTo(href);
  };

  return (
    <div className={dirty ? "pb-24" : undefined}>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
        <Link href="/resumes" onClick={guardedNav("/resumes")}>
          <ArrowLeft /> Resume Center
        </Link>
      </Button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1 font-semibold">{resume.name}</h1>
            {resume.is_default && (
              <Badge tone="primary" size="xs">
                <Star className="size-3 fill-current" aria-hidden /> Default
              </Badge>
            )}
            <Badge tone="outline" size="xs">
              v{resume.version}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {resume.target_role ?? "No target role"} · Updated {relativeTime(resume.updated_at)}
            {resume.file_name && ` · Uploaded from ${resume.file_name}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)}>
            <PencilLine /> Details
          </Button>
          {!resume.is_default && resume.status !== "archived" && (
            <Button
              variant="ghost"
              size="sm"
              loading={setDefault.isPending}
              onClick={() =>
                setDefault.mutate(resume.id, {
                  onSuccess: () => toast.success("Set as your default resume"),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {!setDefault.isPending && <Star />} Make default
            </Button>
          )}
          <DownloadLink href={resumeUrls.render(resume.id, "pdf")}>
            <FileDown /> PDF
          </DownloadLink>
          <DownloadLink href={resumeUrls.render(resume.id, "docx")}>
            <FileDown /> DOCX
          </DownloadLink>
          {resume.has_file && (
            <DownloadLink href={resumeUrls.file(resume.id)} variant="ghost">
              <Download /> Original
            </DownloadLink>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="preview">
            <Eye /> Preview
          </TabsTrigger>
          <TabsTrigger value="edit">
            <PencilLine /> Edit{dirty && <span className="size-1.5 rounded-full bg-warning" aria-label="(unsaved)" />}
          </TabsTrigger>
          <TabsTrigger value="versions">
            <GitBranch /> Tailored versions
            <span className="tabular text-caption text-subtle">{resume.versions_count}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <div className="rounded-2xl bg-bg-subtle p-3 sm:p-8">
            <ResumeDocument content={draft} />
          </div>
          {resume.parsed_text && (
            <details className="mt-4 rounded-xl border border-border bg-surface p-4">
              <summary className="cursor-pointer text-sm font-medium">Text we extracted from your file</summary>
              <p className="mt-1 text-caption text-subtle">If something is missing above, it may not have been readable. Fix it in the Edit tab.</p>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-subtle p-3 font-mono text-xs text-muted scrollbar-thin">
                {resume.parsed_text}
              </pre>
            </details>
          )}
        </TabsContent>

        <TabsContent value="edit">
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ResumeEditor value={draft} onChange={setDraft} />
            <div className="hidden 2xl:block">
              <div className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-2xl bg-bg-subtle p-4 scrollbar-thin">
                <ResumeDocument content={draft} className="text-[12px]" />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="versions">
          <Card className="p-5">
            <p className="mb-4 text-sm text-muted">
              Each version is tailored to one job. Your base resume above is never changed by tailoring.
            </p>
            <VersionsList resumeId={resume.id} />
          </Card>
        </TabsContent>
      </Tabs>

      {dirty && (
        <div
          className="glass fixed inset-x-0 bottom-[calc(3.9rem+env(safe-area-inset-bottom))] z-30 border-t border-border px-4 py-3 shadow-pop animate-rise lg:bottom-0 lg:left-64"
          role="region"
          aria-label="Unsaved changes"
        >
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm font-medium" aria-live="polite">
              You have unsaved changes
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(resume.content)} disabled={update.isPending}>
                <Undo2 /> Discard
              </Button>
              <Button size="sm" onClick={save} loading={update.isPending}>
                {!update.isPending && <Save />} Save changes
              </Button>
            </div>
          </div>
        </div>
      )}

      <EditResumeDetailsDialog resume={resume} open={detailsOpen} onOpenChange={setDetailsOpen} />
      <ConfirmDialog
        open={leaveTo !== null}
        onOpenChange={(o) => !o && setLeaveTo(null)}
        title="Leave without saving?"
        description="Your edits to this resume haven't been saved and will be lost."
        confirmLabel="Leave without saving"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => {
          const to = leaveTo;
          setLeaveTo(null);
          setDraft(resume.content);
          if (to) router.push(to);
        }}
      />
    </div>
  );
}
