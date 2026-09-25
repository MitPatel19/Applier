"use client";

import * as React from "react";
import { FileText, Loader2, Lock, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function validateResumeFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
    return "Please upload a PDF or Word (.docx) file.";
  }
  if (file.size > MAX_BYTES) return "That file is larger than 10 MB. Please upload a smaller version.";
  if (file.size === 0) return "That file appears to be empty.";
  return null;
}

/** Drag-and-drop (or click / keyboard) resume picker. */
export function ResumeDropzone({
  onFile,
  busy,
  busyLabel,
  error,
}: {
  onFile: (file: File) => void;
  busy?: boolean;
  busyLabel?: string;
  error?: string | null;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const errorId = React.useId();
  const hintId = React.useId();

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) pick(e.dataTransfer.files);
        }}
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 border-dashed transition-all",
          dragging ? "border-primary bg-primary-soft/60" : "border-border-strong bg-surface-2 hover:border-primary/60",
          error && !dragging && "border-danger/50",
        )}
      >
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(" ")}
          className="relative flex w-full flex-col items-center justify-center gap-3 px-6 py-12 text-center focus-visible:rounded-2xl disabled:cursor-progress"
        >
          <span
            className={cn(
              "flex size-14 items-center justify-center rounded-2xl shadow-glow transition-transform",
              busy ? "bg-primary-soft text-primary" : "bg-gradient-brand text-white",
              dragging && "scale-110",
            )}
          >
            {busy ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <UploadCloud className="size-6" aria-hidden />}
          </span>
          <span className="text-base font-semibold">
            {busy ? busyLabel ?? "Uploading…" : dragging ? "Drop your resume here" : "Drag & drop your resume, or browse"}
          </span>
          <span id={hintId} className="flex items-center gap-1.5 text-sm text-muted">
            <FileText className="size-4" aria-hidden /> PDF or DOCX, up to 10 MB
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-caption text-subtle">
        <Lock className="size-3.5" aria-hidden /> Your file is encrypted before it&apos;s stored. Only you can access it.
      </p>
    </div>
  );
}
