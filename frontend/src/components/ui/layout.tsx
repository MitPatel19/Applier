import * as React from "react";
import { cn } from "@/lib/utils";

/** Page title block used at the top of every app page. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-h1 font-semibold text-text">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  trend?: { value: number; positiveIsGood?: boolean } | null;
  className?: string;
}) {
  const good = trend ? (trend.positiveIsGood ?? true) === trend.value >= 0 : false;
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        {icon && <span className="text-subtle [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
      {(hint || trend) && (
        <p className="mt-1 flex items-center gap-2 text-caption text-subtle">
          {trend && trend.value !== 0 && (
            <span className={cn("font-medium", good ? "text-success" : "text-danger")}>
              {trend.value > 0 ? "▲" : "▼"} {Math.abs(trend.value)}
            </span>
          )}
          {hint}
        </p>
      )}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-h2 font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />;
}

export function KeyValue({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-caption font-medium uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="mt-1 truncate text-sm text-text">{children}</dd>
    </div>
  );
}
