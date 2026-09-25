"use client";

/** Date/time helpers shared by pipeline, interviews, follow-ups and notifications. */

import * as React from "react";
import { parseDate } from "@/lib/utils";

const DAY = 24 * 60 * 60 * 1000;

function subscribeInterval(ms: number) {
  return (cb: () => void) => {
    const t = window.setInterval(cb, ms);
    return () => window.clearInterval(t);
  };
}

/**
 * Current time (ms), re-rendering every `intervalMs`. The value is quantized to the interval so
 * the snapshot is stable between renders (safe for useSyncExternalStore).
 */
export function useNow(intervalMs = 60_000) {
  const subscribe = React.useMemo(() => subscribeInterval(intervalMs), [intervalMs]);
  const snap = React.useCallback(() => Math.floor(Date.now() / intervalMs) * intervalMs, [intervalMs]);
  return React.useSyncExternalStore(subscribe, snap, snap);
}

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" in local time. */
export function toDateInputValue(value: string | Date | null | undefined) {
  const d = parseDate(value);
  if (!d) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DDTHH:mm" in local time for <input type="datetime-local">. */
export function toLocalInputValue(value: string | Date | null | undefined) {
  const d = parseDate(value);
  if (!d) return "";
  return `${toDateInputValue(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local datetime-local value → ISO (UTC) string for the API. */
export function localInputToIso(value: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Local date input ("YYYY-MM-DD") at `hour` local time → ISO string. */
export function dateInputToIso(value: string, hour = 9) {
  if (!value) return null;
  const d = new Date(`${value}T${pad(hour)}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type DayBucket = "past" | "today" | "tomorrow" | "week" | "later" | "unscheduled";

export function dayBucket(value: string | Date | null | undefined, now: number): DayBucket {
  const d = parseDate(value);
  if (!d) return "unscheduled";
  const today = startOfDay(new Date(now)).getTime();
  const t = startOfDay(d).getTime();
  const diffDays = Math.round((t - today) / DAY);
  if (diffDays < 0) return "past";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 7) return "week";
  return "later";
}

/** Relative day label: "Today", "Yesterday", "Thursday, September 24". */
export function dayLabel(value: string | Date | null | undefined, now: number) {
  const d = parseDate(value);
  if (!d) return "Unscheduled";
  const today = startOfDay(new Date(now)).getTime();
  const diffDays = Math.round((startOfDay(d).getTime() - today) / DAY);
  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "September 24 — 8:45 PM" */
export function timelineStamp(value: string | Date | null | undefined) {
  const d = parseDate(value);
  if (!d) return "—";
  const date = d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} — ${time}`;
}

/** "Sept 24" style short date. */
export function shortDate(value: string | Date | null | undefined) {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Whole days elapsed since `value` (0 = today). */
export function daysSince(value: string | Date | null | undefined, now: number) {
  const d = parseDate(value);
  if (!d) return null;
  return Math.max(0, Math.floor((startOfDay(new Date(now)).getTime() - startOfDay(d).getTime()) / DAY));
}

/** Human countdown: "in 2d 4h", "in 35 min", "Happening now", "Ended 3h ago". */
export function countdown(value: string | Date | null | undefined, now: number, durationMinutes = 60) {
  const d = parseDate(value);
  if (!d) return null;
  const diff = d.getTime() - now;
  const end = d.getTime() + durationMinutes * 60_000;
  if (diff <= 0 && now <= end) return { label: "Happening now", live: true, past: false };
  if (diff < 0) {
    const ago = now - end;
    const h = Math.round(ago / 3_600_000);
    return { label: h < 24 ? `Ended ${Math.max(1, h)}h ago` : `Ended ${Math.round(h / 24)}d ago`, live: false, past: true };
  }
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return { label: `in ${mins} min`, live: false, past: false };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { label: `in ${hours}h ${mins % 60}m`, live: false, past: false };
  const days = Math.floor(hours / 24);
  return { label: `in ${days}d ${hours % 24}h`, live: false, past: false };
}

/** "smooth" unless the user prefers reduced motion (OS setting or the in-app `.reduce-motion` class). */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined") return "auto";
  const reduce =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-motion");
  return reduce ? "auto" : "smooth";
}
