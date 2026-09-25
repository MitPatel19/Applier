"use client";

import * as React from "react";
import { errorMessage } from "@/lib/api";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Debounced autosave. Call `schedule(value)` on every change; the latest value is saved after
 * `delay` ms of inactivity. `flush()` saves immediately (used before switching context) and any
 * pending value is flushed on unmount so edits are never lost.
 */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, delay = 800) {
  const [status, setStatus] = React.useState<AutosaveStatus>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const saveRef = React.useRef(save);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = React.useRef<{ value: T } | null>(null);
  const mounted = React.useRef(true);

  React.useEffect(() => {
    saveRef.current = save;
  });

  const flush = React.useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    if (mounted.current) setStatus("saving");
    try {
      await saveRef.current(next.value);
      if (mounted.current && !pending.current) {
        setStatus("saved");
        setError(null);
      }
    } catch (e) {
      if (mounted.current) {
        // Keep the value so "Retry" can resend it.
        pending.current = pending.current ?? next;
        setStatus("error");
        setError(errorMessage(e, "We couldn't save your change."));
      }
    }
  }, []);

  const schedule = React.useCallback(
    (value: T, immediate = false) => {
      pending.current = { value };
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      const next = pending.current;
      pending.current = null;
      if (next) void saveRef.current(next.value).catch(() => undefined);
    };
  }, []);

  return { status, error, schedule, flush, retry: flush };
}
