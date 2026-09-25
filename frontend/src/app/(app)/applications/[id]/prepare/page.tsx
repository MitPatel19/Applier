"use client";

import { useParams } from "next/navigation";
import { PrepareScreen } from "@/components/apply/prepare-screen";
import { EmptyState } from "@/components/ui/feedback";

export default function PrepareApplicationPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return <EmptyState title="Invalid application link" description="Check the address and try again." />;
  }
  return <PrepareScreen applicationId={id} />;
}
