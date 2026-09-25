"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FileQuestion } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useResume } from "@/lib/queries/resumes";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { ResumeDetailView } from "@/components/resume/resume-detail";

export default function ResumeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data, isLoading, error, refetch } = useResume(Number.isInteger(id) && id > 0 ? id : null);

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading resume">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-8 w-1/2" />
        <Skeleton className="mt-2 h-4 w-1/3" />
        <Skeleton className="mt-8 h-10 w-80" />
        <Skeleton className="mx-auto mt-6 h-[640px] w-full max-w-[816px] rounded-2xl" />
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title="Resume not found"
        description="It may have been deleted. Your other resumes are safe."
        action={
          <Button asChild>
            <Link href="/resumes">Back to Resume Center</Link>
          </Button>
        }
      />
    );
  }
  if (error || !data) return <ErrorState error={error} title="We couldn't load this resume" onRetry={() => refetch()} />;
  return <ResumeDetailView key={data.id} resume={data} />;
}
