"use client";

import * as React from "react";
import { JobsBrowser, JobsBrowserFallback } from "@/components/jobs/jobs-browser";

export default function RecommendedJobsPage() {
  return (
    <React.Suspense fallback={<JobsBrowserFallback />}>
      <JobsBrowser routeView="recommended" />
    </React.Suspense>
  );
}
