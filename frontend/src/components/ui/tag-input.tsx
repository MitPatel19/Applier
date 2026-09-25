"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Chip-style list input: type and press Enter/comma to add; Backspace removes the last chip. */
export function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
  suggestions = [],
  id,
  className,
  "aria-label": ariaLabel,
  maxItems,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  id?: string;
  className?: string;
  "aria-label"?: string;
  maxItems?: number;
}) {
  const [draft, setDraft] = React.useState("");
  const listId = React.useId();

  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "");
    if (!v) return;
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) return setDraft("");
    if (maxItems && value.length >= maxItems) return;
    onChange([...value, v]);
    setDraft("");
  };

  const filtered = draft
    ? suggestions.filter((s) => s.toLowerCase().includes(draft.toLowerCase()) && !value.includes(s)).slice(0, 6)
    : [];

  return (
    <div className={cn("relative", className)}>
      <div
        className="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/20 hover:border-border-strong"
        onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-fg">
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="rounded-sm opacity-70 hover:opacity-100"
              aria-label={`Remove ${tag}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          aria-label={ariaLabel}
          list={suggestions.length ? listId : undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-subtle"
        />
      </div>
      {filtered.length > 0 && (
        <datalist id={listId}>
          {filtered.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/** Multi-select as toggleable chips (for small fixed option sets). */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  className,
  single,
  "aria-label": ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  className?: string;
  single?: boolean;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(single ? [o.value] : active ? value.filter((v) => v !== o.value) : [...value, o.value])
            }
            className={cn(
              "h-8 rounded-full border px-3.5 text-sm font-medium transition-all",
              active
                ? "border-primary bg-primary-soft text-primary-soft-fg shadow-[0_0_0_3px_var(--primary-soft)]"
                : "border-border bg-surface text-muted hover:border-border-strong hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
