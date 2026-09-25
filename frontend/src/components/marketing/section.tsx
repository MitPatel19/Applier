import * as React from "react";
import { cn } from "@/lib/utils";

/** Consistent marketing section wrapper with anchor offset for the sticky header. */
export function MarketingSection({
  id,
  className,
  children,
  labelledBy,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("scroll-mt-20 py-16 sm:py-24", className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  id: string;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      <p className="inline-flex items-center gap-2 text-caption font-semibold uppercase tracking-[0.14em] text-primary">
        {eyebrow}
      </p>
      <h2 id={id} className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-text sm:text-[2.25rem]">
        {title}
      </h2>
      {description && <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{description}</p>}
    </div>
  );
}

/** Checklist bullets used in feature copy. */
export function FeaturePoints({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul className={cn("mt-6 space-y-3", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted sm:text-[15px]">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gradient-brand" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Framed "product window" used for the illustrative UI mocks. */
export function MockWindow({
  title,
  children,
  className,
  badge,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-surface shadow-pop", className)}>
      <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
          <span className="size-2.5 rounded-full bg-border-strong" />
        </span>
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted">{title}</p>
        {badge}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** Two-column feature block: copy + product visual. `reverse` puts the visual first on desktop. */
export function FeatureSplit({
  id,
  eyebrow,
  title,
  description,
  points,
  visual,
  reverse,
  footer,
  className,
}: {
  id: string;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  points?: React.ReactNode[];
  visual: React.ReactNode;
  reverse?: boolean;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <MarketingSection id={id} labelledBy={`${id}-title`} className={className}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={cn(reverse && "lg:order-2")}>
          <SectionHeading id={`${id}-title`} eyebrow={eyebrow} title={title} description={description} />
          {points && <FeaturePoints items={points} />}
          {footer && <div className="mt-6">{footer}</div>}
        </div>
        <div className={cn("min-w-0", reverse && "lg:order-1")}>{visual}</div>
      </div>
    </MarketingSection>
  );
}
