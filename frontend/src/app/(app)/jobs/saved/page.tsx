"use client";

import * as React from "react";
import { JobsBrowser, JobsBrowserFallback } from "@/components/jobs/jobs-browser";

export default function SavedJobsPage() {
  return (
    <React.Suspense fallback={<JobsBrowserFallback />}>
      <JobsBrowser routeView="saved" />
    </React.Suspense>
  );
}
