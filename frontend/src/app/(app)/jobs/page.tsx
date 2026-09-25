"use client";

import * as React from "react";
import { JobsBrowser, JobsBrowserFallback } from "@/components/jobs/jobs-browser";

export default function JobsDiscoverPage() {
  return (
    <React.Suspense fallback={<JobsBrowserFallback />}>
      <JobsBrowser />
    </React.Suspense>
  );
}
