"use client";

/** Tailored resume version: change review + live document preview + approve. */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Briefcase, CheckCircle2, ListChecks, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import type { ResumeVersionDetail } from "@/lib/types";
import { useApproveVersion } from "@/lib/queries/resumes";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/feedback";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { ScoreRing } from "@/components/ui/score";
import { ChangeReview } from "./change-review";
import { ResumeDocument } from "./resume-document";

export function VersionReview({ version }: { version: ResumeVersionDetail }) {
  const approve = useApproveVersion(version.id);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [showOriginal, setShowOriginal] = React.useState(false);
  const pending = version.changes.filter((c) => c.accepted === null).length;
  const approved = version.status === "approved";

  const doApprove = () =>
    approve.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false);
        toast.success("Tailored resume approved", {
          description: "It's locked and ready to use in your application. You can still download it anytime.",
        });
      },
      onError: (e) => toast.error(errorMessage(e, "We couldn't approve this version.")),
    });

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
        <Link href={`/resumes/${version.resume_id}`}>
          <ArrowLeft /> Base resume
        </Link>
      </Button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <ScoreRing score={version.ats_score} size={64} label="ATS score" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h1 font-semibold">{version.label}</h1>
              <Badge tone={approved ? "success" : "warning"} size="xs">
                {approved ? "Approved" : "Needs review"}
              </Badge>
            </div>
            <p className="mt-1 break-all text-sm text-muted">
              {version.file_name} · Created {formatDate(version.created_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {version.job_id && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/jobs/${version.job_id}`}>
                <Briefcase /> View job
              </Link>
            </Button>
          )}
          {!approved && (
            <Button variant="success" onClick={() => (pending > 0 ? setConfirmOpen(true) : doApprove())} loading={approve.isPending && !confirmOpen}>
              <CheckCircle2 /> Approve version
            </Button>
          )}
        </div>
      </div>

      {approved ? (
        <Callout tone="success" icon={<CheckCircle2 />} title="Approved" className="mb-6">
          Your decisions are locked. This is the exact document that will be used for the application.
        </Callout>
      ) : (
        <Callout tone="info" icon={<ListChecks />} title={pending > 0 ? `${pending} changes need your decision` : "All changes reviewed"} className="mb-6">
          Accept the changes you agree with and reject the rest. When you approve, the document is locked for this application.
        </Callout>
      )}

      <Tabs defaultValue="changes">
        <TabsList>
          <TabsTrigger value="changes">
            <ListChecks /> Changes
          </TabsTrigger>
          <TabsTrigger value="preview">
            <ScrollText /> Preview
          </TabsTrigger>
        </TabsList>
        <TabsContent value="changes">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
            <Card className="p-5 sm:p-6">
              <ChangeReview version={version} />
            </Card>
            <div className="hidden xl:block">
              <div className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-2xl bg-bg-subtle p-3 scrollbar-thin">
                <ResumeDocument content={version.content} className="px-6 py-8 text-[11px] sm:px-8 sm:py-8" />
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="preview">
          <label className="mb-4 flex items-center gap-2.5 text-sm">
            <Switch checked={showOriginal} onCheckedChange={setShowOriginal} aria-label="Show original resume" />
            Show the original (before tailoring)
          </label>
          <div className="rounded-2xl bg-bg-subtle p-3 sm:p-8">
            <ResumeDocument content={showOriginal ? version.base_content : version.content} />
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Approve with undecided changes?"
        description={`${pending} ${pending === 1 ? "change hasn't" : "changes haven't"} been reviewed. Approving treats them as rejected, so they won't appear in the final document.`}
        confirmLabel="Approve anyway"
        cancelLabel="Keep reviewing"
        loading={approve.isPending}
        onConfirm={doApprove}
      />
    </div>
  );
}
