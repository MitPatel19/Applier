"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FileQuestion } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useResumeVersion } from "@/lib/queries/resumes";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton, SkeletonList } from "@/components/ui/feedback";
import { VersionReview } from "@/components/resume/version-review";

export default function ResumeVersionPage() {
  const params = useParams<{ versionId: string }>();
  const id = Number(params.versionId);
  const { data, isLoading, error, refetch } = useResumeVersion(Number.isInteger(id) && id > 0 ? id : null);

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading tailored resume">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-8 w-2/3" />
        <SkeletonList count={4} className="mt-8" />
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title="Tailored resume not found"
        description="It may have been removed along with its resume."
        action={
          <Button asChild>
            <Link href="/resumes">Back to Resume Center</Link>
          </Button>
        }
      />
    );
  }
  if (error || !data) return <ErrorState error={error} title="We couldn't load this tailored resume" onRetry={() => refetch()} />;
  return <VersionReview version={data} />;
}
