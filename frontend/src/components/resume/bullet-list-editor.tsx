"use client";

/**
 * Editable bullet list: add, edit, reorder (up/down) and delete. Generic over the item type so it
 * works for plain strings (profile) and `{id, text}` bullets (resume content).
 */

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function BulletListEditor<T>({
  items,
  onChange,
  getText,
  withText,
  create,
  label,
  placeholder = "Describe what you did and the result…",
  addLabel = "Add bullet",
  getKey,
}: {
  items: T[];
  onChange: (next: T[]) => void;
  getText: (item: T) => string;
  withText: (item: T, text: string) => T;
  create: (text: string) => T;
  /** Accessible name for the list, e.g. "Responsibilities". */
  label: string;
  placeholder?: string;
  addLabel?: string;
  getKey?: (item: T, index: number) => string | number;
}) {
  const listRef = React.useRef<HTMLOListElement>(null);
  const focusIndex = (i: number) => {
    requestAnimationFrame(() => {
      const areas = listRef.current?.querySelectorAll("textarea");
      areas?.[i]?.focus();
    });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    focusIndex(j);
  };

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ol ref={listRef} className="space-y-2" aria-label={label}>
          {items.map((item, i) => (
            <li key={getKey ? getKey(item, i) : i} className="group flex items-start gap-2">
              <span className="mt-3 size-1.5 shrink-0 rounded-full bg-subtle" aria-hidden />
              <Textarea
                value={getText(item)}
                rows={2}
                aria-label={`${label} ${i + 1}`}
                placeholder={placeholder}
                onChange={(e) => onChange(items.map((it, k) => (k === i ? withText(it, e.target.value) : it)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    const next = [...items];
                    next.splice(i + 1, 0, create(""));
                    onChange(next);
                    focusIndex(i + 1);
                  }
                }}
                className="min-h-0 flex-1 py-2 text-sm"
              />
              <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${label.toLowerCase()} ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${label.toLowerCase()} ${i + 1} down`}
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="danger-ghost"
                  size="icon-sm"
                  aria-label={`Delete ${label.toLowerCase()} ${i + 1}`}
                  onClick={() => {
                    onChange(items.filter((_, k) => k !== i));
                    focusIndex(Math.max(0, i - 1));
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => {
          onChange([...items, create("")]);
          focusIndex(items.length);
        }}
      >
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}

/** Convenience wrapper for plain string lists. */
export function StringListEditor(props: {
  items: string[];
  onChange: (next: string[]) => void;
  label: string;
  placeholder?: string;
  addLabel?: string;
}) {
  return <BulletListEditor<string> {...props} getText={(s) => s} withText={(_, t) => t} create={(t) => t} />;
}
