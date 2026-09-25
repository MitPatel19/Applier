import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DAY = 24 * 60 * 60 * 1000;

/** Parse a backend timestamp. Naive ISO strings from the API are UTC. */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(value);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(isDateOnly ? `${value}T00:00:00` : hasZone ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", ...opts });
}

export function formatDateTime(value: string | Date | null | undefined) {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatTime(value: string | Date | null | undefined) {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "just now", "3h ago", "in 2 days", "Sep 24" */
export function relativeTime(value: string | Date | null | undefined) {
  const d = parseDate(value);
  if (!d) return "—";
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60 * 1000) return "just now";
  if (abs < 60 * 60 * 1000) return rtf.format(Math.round(diff / 60000), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / 3600000), "hour");
  if (abs < 14 * DAY) return rtf.format(Math.round(diff / DAY), "day");
  return formatDate(d);
}

export function daysUntil(value: string | Date | null | undefined): number | null {
  const d = parseDate(value);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / DAY);
}

export function formatMoney(n: number, currency = "CAD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function formatSalary(
  min: number | null | undefined,
  max: number | null | undefined,
  period: string | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (!min && !max) return null;
  const c = currency || "CAD";
  const compact = (n: number) =>
    period === "hourly" ? formatMoney(n, c) : n >= 1000 ? `${formatMoney(Math.round(n / 1000), c)}k` : formatMoney(n, c);
  const suffix = period === "hourly" ? "/hr" : "/yr";
  if (min && max && min !== max) return `${compact(min)}–${compact(max)}${suffix}`;
  return `${compact((min || max) as number)}${suffix}`;
}

export function pct(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function titleCase(s: string | null | undefined) {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function hostFromUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}
