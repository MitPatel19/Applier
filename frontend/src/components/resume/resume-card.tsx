"use client";

import * as React from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  Download,
  FileText,
  GitBranch,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import type { Resume } from "@/lib/types";
import { formatFileSize, resumeUrls, useDeleteResume, useSetDefaultResume, useUpdateResume } from "@/lib/queries/resumes";
import { cn, formatDate, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui/primitives";
import { EditResumeDetailsDialog } from "./resume-dialogs";

const STATUS_TONE = { active: "success", draft: "warning", archived: "neutral" } as const;

export function ResumeCard({ resume }: { resume: Resume }) {
  const setDefault = useSetDefaultResume();
  const update = useUpdateResume();
  const del = useDeleteResume();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const archived = resume.status === "archived";

  const makeDefault = () =>
    setDefault.mutate(resume.id, {
      onSuccess: () => toast.success(`“${resume.name}” is now your default resume`, { description: "Used when no other resume fits a job better." }),
      onError: (e) => toast.error(errorMessage(e)),
    });

  const toggleArchive = () =>
    update.mutate(
      { id: resume.id, status: archived ? "active" : "archived" },
      {
        onSuccess: () =>
          toast.success(archived ? "Resume restored" : "Resume archived", {
            description: archived ? "It can be used for new applications again." : "It won't be used for new applications. Past applications are unaffected.",
          }),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-xl border bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop",
        resume.is_default ? "border-primary/40 shadow-glow" : "border-border hover:border-border-strong",
        archived && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg" aria-hidden>
          <FileText className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">
            <Link href={`/resumes/${resume.id}`} className="after:absolute after:inset-0 hover:text-primary focus-visible:outline-none">
              {resume.name}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-sm text-muted">{resume.target_role ?? "No target role"}</p>
        </div>
        <div className="relative z-10 flex items-center">
          <Tooltip content={resume.is_default ? "Default resume" : "Make default"}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={resume.is_default ? "Default resume" : `Make ${resume.name} the default resume`}
              aria-pressed={resume.is_default}
              onClick={() => !resume.is_default && makeDefault()}
              disabled={setDefault.isPending || archived}
            >
              <Star className={cn(resume.is_default ? "fill-warning text-warning" : "text-subtle")} />
            </Button>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${resume.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil /> Rename &amp; details
              </DropdownMenuItem>
              {!resume.is_default && !archived && (
                <DropdownMenuItem onSelect={makeDefault}>
                  <Star /> Set as default
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <a href={resumeUrls.render(resume.id, "pdf")} download>
                  <Download /> Download PDF
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={resumeUrls.render(resume.id, "docx")} download>
                  <Download /> Download DOCX
                </a>
              </DropdownMenuItem>
              {resume.has_file && (
                <DropdownMenuItem asChild>
                  <a href={resumeUrls.file(resume.id)} download>
                    <Download /> Original file
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={toggleArchive}>
                {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Restore" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {resume.is_default && (
          <Badge tone="primary" size="xs">
            <Star className="size-3 fill-current" aria-hidden /> Default
          </Badge>
        )}
        <Badge tone={STATUS_TONE[resume.status]} size="xs">
          {resume.status === "active" ? "Active" : resume.status === "draft" ? "Draft" : "Archived"}
        </Badge>
        <Badge tone="outline" size="xs">
          v{resume.version}
        </Badge>
        <Badge tone="outline" size="xs">
          <GitBranch className="size-3" aria-hidden /> {resume.versions_count} tailored
        </Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
        <div className="min-w-0">
          <dt className="text-caption text-subtle">File</dt>
          <dd className="truncate text-muted" title={resume.file_name ?? undefined}>
            {resume.file_name ? `${resume.file_name}${resume.file_size ? ` · ${formatFileSize(resume.file_size)}` : ""}` : "Built from profile"}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-subtle">Skills</dt>
          <dd className="text-muted">{resume.skills_count}</dd>
        </div>
        <div>
          <dt className="text-caption text-subtle">Created</dt>
          <dd className="text-muted">{formatDate(resume.created_at)}</dd>
        </div>
        <div>
          <dt className="text-caption text-subtle">Updated</dt>
          <dd className="text-muted">{relativeTime(resume.updated_at)}</dd>
        </div>
      </dl>

      <EditResumeDetailsDialog resume={resume} open={editOpen} onOpenChange={setEditOpen} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="danger"
        title={`Delete “${resume.name}”?`}
        description="The resume, its uploaded file and its tailored versions are permanently deleted. Applications you already sent keep their copies."
        confirmLabel="Delete resume"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(resume.id, {
            onSuccess: () => {
              setDeleteOpen(false);
              toast.success("Resume deleted");
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </article>
  );
}
