"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, FileQuestion, PencilLine, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/api";
import type { CoverLetter } from "@/lib/types";
import { useCoverLetter, useDeleteCoverLetter, useUpdateCoverLetter } from "@/lib/queries/cover-letters";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { CoverLetterEditor } from "@/components/cover-letters/cover-letter-editor";

function TitleEditor({ cl }: { cl: CoverLetter }) {
  const update = useUpdateCoverLetter();
  const [title, setTitle] = React.useState(cl.title);
  const commit = () => {
    const t = title.trim();
    if (!t) {
      setTitle(cl.title);
      return;
    }
    if (t === cl.title) return;
    update.mutate(
      { id: cl.id, title: t },
      {
        onSuccess: () => toast.success("Title updated"),
        onError: (e) => {
          setTitle(cl.title);
          toast.error(errorMessage(e));
        },
      },
    );
  };
  return (
    <div className="group relative">
      <label htmlFor="cl-title" className="sr-only">
        Cover letter title
      </label>
      <input
        id="cl-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setTitle(cl.title);
            e.currentTarget.blur();
          }
        }}
        className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 -ml-2 text-h1 font-semibold transition-colors hover:border-border focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20"
      />
      <PencilLine className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </div>
  );
}

function CoverLetterView({ cl }: { cl: CoverLetter }) {
  const router = useRouter();
  const update = useUpdateCoverLetter();
  const del = useDeleteCoverLetter();
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const setStatus = (status: CoverLetter["status"]) =>
    update.mutate(
      { id: cl.id, status },
      {
        onSuccess: () =>
          toast.success(status === "approved" ? "Cover letter approved" : "Back to draft", {
            description:
              status === "approved"
                ? "It's ready to attach to your application. You'll still confirm before anything is sent."
                : "You can keep editing. Approve it again when you're done.",
          }),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
        <Link href="/cover-letters">
          <ArrowLeft /> Cover letters
        </Link>
      </Button>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <TitleEditor key={cl.title} cl={cl} />
          <p className="mt-1 text-sm text-muted">
            {[cl.company_name, cl.job_title].filter(Boolean).join(" · ") || "Not linked to a job"} · Created {formatDate(cl.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {cl.job_id && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/jobs/${cl.job_id}`}>
                <Briefcase /> View job
              </Link>
            </Button>
          )}
          {cl.status === "approved" && (
            <Button variant="ghost" size="sm" onClick={() => setStatus("draft")} loading={update.isPending}>
              Mark as draft
            </Button>
          )}
          <Button variant="danger-ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="p-4 sm:p-6">
          <CoverLetterEditor
            coverLetter={cl}
            onApprove={() => setStatus("approved")}
            approving={update.isPending && update.variables?.status === "approved"}
          />
        </Card>
        <aside className="space-y-3 text-sm">
          <Card className="p-4">
            <p className="font-semibold">Tips</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted">
              <li>Open with why this company, not why you need a job.</li>
              <li>Mention one concrete result with a number.</li>
              <li>Keep it under one page — recruiters skim.</li>
            </ul>
          </Card>
          <p className="flex items-start gap-2 px-1 text-caption text-subtle">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
            Written only from facts in your profile. Edits save automatically as you type.
          </p>
        </aside>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="danger"
        title="Delete this cover letter?"
        description="It's permanently removed. Applications that already used it keep their copy."
        confirmLabel="Delete"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(cl.id, {
            onSuccess: () => {
              toast.success("Cover letter deleted");
              router.push("/cover-letters");
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </div>
  );
}

export default function CoverLetterPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data, isLoading, error, refetch } = useCoverLetter(Number.isInteger(id) && id > 0 ? id : null);

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading cover letter">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-8 w-1/2" />
        <Skeleton className="mt-8 h-10 w-96 max-w-full" />
        <Skeleton className="mt-4 h-[480px] w-full rounded-xl" />
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title="Cover letter not found"
        description="It may have been deleted."
        action={
          <Button asChild>
            <Link href="/cover-letters">Back to cover letters</Link>
          </Button>
        }
      />
    );
  }
  if (error || !data) return <ErrorState error={error} title="We couldn't load this cover letter" onRetry={() => refetch()} />;
  return <CoverLetterView cl={data} />;
}
