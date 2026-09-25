"use client";

/** Read-only summary for applications that were already submitted. */

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileDown } from "lucide-react";
import type { ApplicationDetail } from "@/lib/types";
import { applicationDocumentUrl } from "@/lib/queries/prepare";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyValue } from "@/components/ui/layout";
import { AnswersSection } from "./answers-section";

export function AppliedSummary({ detail }: { detail: ApplicationDetail }) {
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 bg-success-soft/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
            <div>
              <p className="font-semibold">You&apos;ve already applied to this job</p>
              <p className="mt-0.5 text-sm text-muted">
                Submitted on {formatDate(detail.applied_at)}. Below is exactly what you sent — it can&apos;t be changed now.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0">
            <Link href={`/applications/${detail.id}`}>
              Open application <ArrowRight />
            </Link>
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <KeyValue label="Status">
            <StatusBadge status={detail.status} size="xs" />
          </KeyValue>
          <KeyValue label="Applied">{formatDate(detail.applied_at)}</KeyValue>
          <KeyValue label="Resume">{detail.resume_version?.file_name ?? detail.resume_name ?? "—"}</KeyValue>
          <KeyValue label="Follow-up">{detail.next_follow_up_at ? formatDate(detail.next_follow_up_at) : "None"}</KeyValue>
        </dl>
      </Card>

      {detail.documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Documents sent</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {detail.documents.map((d) => (
              <Button key={d.id} asChild variant="secondary" size="sm">
                <a href={applicationDocumentUrl(detail.id, d.id)} download>
                  <FileDown /> {d.file_name}
                </a>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {detail.answers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your answers</CardTitle>
          </CardHeader>
          <CardContent>
            <AnswersSection answers={detail.answers} applicationId={detail.id} readOnly />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
