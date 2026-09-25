import { Badge } from "@/components/ui/badge";
import { SOURCE_LABELS, STATUS_LABELS, STATUS_TONE, TIER_LABELS, TIER_TONE } from "@/lib/constants";
import type { ApplicationStatus, JobSource, MatchTier } from "@/lib/types";

export function StatusBadge({ status, size }: { status: ApplicationStatus; size?: "xs" | "sm" }) {
  return (
    <Badge tone={STATUS_TONE[status]} size={size} dot>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function TierBadge({ tier, size }: { tier: MatchTier; size?: "xs" | "sm" }) {
  return (
    <Badge tone={TIER_TONE[tier]} size={size}>
      {TIER_LABELS[tier]}
    </Badge>
  );
}

/** "Found on LinkedIn + Indeed + Company Website" — one unified record for duplicate postings. */
export function SourceList({ sources, className }: { sources: Pick<JobSource, "source" | "source_label">[]; className?: string }) {
  const labels = Array.from(new Set(sources.map((s) => s.source_label || SOURCE_LABELS[s.source] || s.source)));
  if (!labels.length) return null;
  return (
    <span className={className}>
      <span className="text-subtle">Found on </span>
      {labels.map((l, i) => (
        <span key={l}>
          {i > 0 && <span className="text-subtle"> + </span>}
          <span className="font-medium text-text">{l}</span>
        </span>
      ))}
    </span>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="outline" size="xs" title="Sample data for demonstration — not a real posting">
      Demo data
    </Badge>
  );
}
