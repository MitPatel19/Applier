"use client";

/**
 * Cover letter editor: variant switcher (Professional / Short / More personalized), editable text
 * with debounced autosave, word count, and PDF/DOCX download. Used on the application
 * "Ready to Apply" screen (compact) and the cover letter page (full).
 */

import * as React from "react";
import { CheckCircle2, FileDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import type { CoverLetter, CoverLetterVariant } from "@/lib/types";
import {
  COVER_LETTER_VARIANTS,
  GENERATED_BY_LABELS,
  coverLetterRenderUrl,
  useUpdateCoverLetter,
  wordCount,
} from "@/lib/queries/cover-letters";
import { cn, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { CopyButton, DownloadLink, SaveIndicator } from "@/components/apply/bits";
import { useAutosave } from "@/components/apply/use-autosave";

const WORD_TARGETS: Record<CoverLetterVariant, [number, number]> = {
  professional: [250, 400],
  short: [120, 220],
  personalized: [250, 450],
};

export function GeneratedByBadge({ by }: { by: CoverLetter["generated_by"] }) {
  return (
    <Badge tone={by === "user" ? "neutral" : by === "ai" ? "primary" : "info"} size="xs">
      {by === "ai" && <Sparkles className="size-3" aria-hidden />}
      {GENERATED_BY_LABELS[by]}
    </Badge>
  );
}

/** Segmented control for the three variants (radio group semantics). */
export function VariantSwitcher({
  value,
  onChange,
  disabled,
  available,
}: {
  value: CoverLetterVariant;
  onChange: (v: CoverLetterVariant) => void;
  disabled?: boolean;
  available?: Partial<Record<CoverLetterVariant, string>>;
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const idx = COVER_LETTER_VARIANTS.findIndex((v) => v.value === value);
  return (
    <div
      role="radiogroup"
      aria-label="Cover letter version"
      className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-bg-subtle p-1 scrollbar-thin"
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const n = COVER_LETTER_VARIANTS.length;
        const step = e.key === "ArrowRight" ? 1 : -1;
        for (let k = 1; k < n; k++) {
          const next = (idx + step * k + n) % n;
          const v = COVER_LETTER_VARIANTS[next].value;
          if (available && !available[v]) continue;
          refs.current[next]?.focus();
          onChange(v);
          break;
        }
      }}
    >
      {COVER_LETTER_VARIANTS.map((v, i) => {
        const active = v.value === value;
        const missing = available && !available[v.value];
        return (
          <button
            key={v.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled || missing}
            title={missing ? "Not available for this letter — generate it again to get this version." : v.hint}
            onClick={() => !active && onChange(v.value)}
            className={cn(
              "h-8 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-60",
              active ? "bg-surface text-text shadow-card" : "text-muted hover:text-text",
            )}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

export function CoverLetterEditor({
  coverLetter,
  compact,
  onApprove,
  approving,
  className,
}: {
  coverLetter: CoverLetter;
  compact?: boolean;
  onApprove?: () => void;
  approving?: boolean;
  className?: string;
}) {
  // Local text is the source of truth while editing; re-keyed when the variant changes.
  return (
    <InnerEditor
      key={`${coverLetter.id}-${coverLetter.variant}`}
      coverLetter={coverLetter}
      compact={compact}
      onApprove={onApprove}
      approving={approving}
      className={className}
    />
  );
}

function InnerEditor({
  coverLetter: cl,
  compact,
  onApprove,
  approving,
  className,
}: {
  coverLetter: CoverLetter;
  compact?: boolean;
  onApprove?: () => void;
  approving?: boolean;
  className?: string;
}) {
  const update = useUpdateCoverLetter();
  const [text, setText] = React.useState(cl.content);
  const textareaId = React.useId();
  const hintId = React.useId();

  const autosave = useAutosave<string>((content) => update.mutateAsync({ id: cl.id, content }), 900);

  const words = wordCount(text);
  const [lo, hi] = WORD_TARGETS[cl.variant];
  const lengthHint = words < lo ? `A little short — aim for ${lo}–${hi} words.` : words > hi ? `A bit long — aim for ${lo}–${hi} words.` : "Good length.";
  const switchVariant = async (variant: CoverLetterVariant) => {
    await autosave.flush();
    update.mutate(
      { id: cl.id, variant },
      {
        onSuccess: () => toast.success(`Switched to the ${COVER_LETTER_VARIANTS.find((v) => v.value === variant)?.label} version`),
        onError: (e) => toast.error(errorMessage(e, "We couldn't switch versions. Your text is unchanged.")),
      },
    );
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VariantSwitcher value={cl.variant} onChange={(v) => void switchVariant(v)} disabled={update.isPending} available={cl.variants} />
        <div className="flex items-center gap-2">
          <GeneratedByBadge by={cl.generated_by} />
          {cl.status === "approved" && (
            <Badge tone="success" size="xs">
              <CheckCircle2 className="size-3" aria-hidden /> Approved
            </Badge>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={textareaId} className="sr-only">
          Cover letter text
        </label>
        <Textarea
          id={textareaId}
          aria-describedby={hintId}
          value={text}
          rows={compact ? 12 : 22}
          onChange={(e) => {
            setText(e.target.value);
            autosave.schedule(e.target.value);
          }}
          onBlur={() => void autosave.flush()}
          className={cn("font-[450] leading-7", compact ? "text-sm" : "text-[15px]")}
        />
        <div id={hintId} className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-caption text-subtle">
          <span>
            <span className="tabular font-medium text-muted">{words}</span> words · {lengthHint} Your edits to each version are kept.
          </span>
          <SaveIndicator status={autosave.status} error={autosave.error} onRetry={() => void autosave.retry()} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DownloadLink href={coverLetterRenderUrl(cl.id, "pdf")}>
          <FileDown /> PDF
        </DownloadLink>
        <DownloadLink href={coverLetterRenderUrl(cl.id, "docx")}>
          <FileDown /> DOCX
        </DownloadLink>
        <CopyButton text={text} label="Copy text" showLabel variant="ghost" size="sm" successMessage="Cover letter copied" />
        {!compact && <span className="text-caption text-subtle">Updated {relativeTime(cl.updated_at)}</span>}
        {onApprove && cl.status !== "approved" && (
          <Button
            size="sm"
            variant="success"
            className="ml-auto"
            loading={approving}
            onClick={async () => {
              await autosave.flush();
              onApprove();
            }}
          >
            <CheckCircle2 /> Approve letter
          </Button>
        )}
      </div>

    </div>
  );
}
