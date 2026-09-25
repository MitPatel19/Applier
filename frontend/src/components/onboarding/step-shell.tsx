"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Title block for a wizard step. The heading receives focus when the step changes. */
export const StepHeader = React.forwardRef<
  HTMLHeadingElement,
  { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; className?: string }
>(function StepHeader({ eyebrow, title, description, className }, ref) {
  return (
    <div className={cn("mb-8", className)}>
      {eyebrow && (
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
      )}
      <h1 ref={ref} tabIndex={-1} className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] outline-none sm:text-[2rem]">
        {title}
      </h1>
      {description && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
    </div>
  );
});

/** Back / Skip / Continue row at the bottom of each step. */
export function StepFooter({
  onBack,
  onSkip,
  skipLabel = "Skip for now",
  primary,
  className,
  note,
}: {
  onBack?: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  primary?: React.ReactNode;
  className?: string;
  note?: React.ReactNode;
}) {
  return (
    <div className={cn("mt-10 border-t border-border pt-6", className)}>
      {note && <div className="mb-4">{note}</div>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {onBack && (
            <Button variant="ghost" onClick={onBack} className="w-full sm:w-auto">
              <ArrowLeft /> Back
            </Button>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {onSkip && (
            <Button variant="ghost" onClick={onSkip} className="w-full text-muted sm:w-auto">
              {skipLabel}
            </Button>
          )}
          {primary}
        </div>
      </div>
    </div>
  );
}

export function ContinueButton({
  children = "Continue",
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button size="lg" className={cn("w-full sm:w-auto", className)} {...props}>
      {children}
      {!props.loading && <ArrowRight />}
    </Button>
  );
}

/** Section card used inside steps. */
export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6", className)} {...props}>
      {children}
    </div>
  );
}

export function PanelTitle({ icon, title, description, action }: { icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg [&_svg]:size-[18px]">
            {icon}
          </span>
        )}
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
