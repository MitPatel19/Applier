"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileUp, PencilLine } from "lucide-react";
import { ErrorState, SkeletonCard } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api";
import { useImportProfile, useParsedResume, useUploadResume } from "@/lib/queries/onboarding";
import { cn } from "@/lib/utils";
import { ManualProfile } from "./manual-profile";
import { ParsedReview } from "./parsed-review";
import { ResumeDropzone, validateResumeFile } from "./resume-dropzone";
import { StepFooter, StepHeader } from "./step-shell";
import { readSession, writeSession, type StepProps } from "./steps";

type Mode = "upload" | "manual";

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options: { value: Mode; label: string; description: string; icon: React.ReactNode }[] = [
    { value: "upload", label: "Upload resume", description: "Fastest — we extract the details", icon: <FileUp /> },
    { value: "manual", label: "Enter manually", description: "Type in the essentials yourself", icon: <PencilLine /> },
  ];
  return (
    <div role="radiogroup" aria-label="How would you like to build your profile?" className="mb-6 grid gap-3 sm:grid-cols-2">
      {options.map((o) => {
        const active = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                onChange(o.value === "upload" ? "manual" : "upload");
                const sibling = (e.currentTarget.parentElement?.querySelector(
                  `[data-mode="${o.value === "upload" ? "manual" : "upload"}"]`,
                ) ?? null) as HTMLButtonElement | null;
                sibling?.focus();
              }
            }}
            tabIndex={active ? 0 : -1}
            data-mode={o.value}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-4 text-left transition-all",
              active
                ? "border-primary bg-primary-soft/50 shadow-[0_0_0_3px_var(--primary-soft)]"
                : "border-border bg-surface hover:border-border-strong",
            )}
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5",
                active ? "bg-primary text-primary-fg" : "bg-bg-subtle text-muted",
              )}
            >
              {o.icon}
            </span>
            <span>
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="block text-sm text-muted">{o.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function StepProfile({ onBack, onNext, onComplete }: StepProps) {
  const [mode, setModeState] = React.useState<Mode>(() => (readSession("profile-mode") === "manual" ? "manual" : "upload"));
  const [resumeId, setResumeIdState] = React.useState<number | null>(() => {
    const v = Number(readSession("resume"));
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  const [fileError, setFileError] = React.useState<string | null>(null);

  const upload = useUploadResume();
  const parsed = useParsedResume(resumeId);
  const importProfile = useImportProfile();

  const setMode = (m: Mode) => {
    setModeState(m);
    writeSession("profile-mode", m);
  };
  const setResumeId = (id: number | null) => {
    setResumeIdState(id);
    writeSession("resume", id ? String(id) : null);
  };

  const onFile = (file: File) => {
    const problem = validateResumeFile(file);
    setFileError(problem);
    if (problem) return;
    upload.mutate(
      { file, name: file.name.replace(/\.(pdf|docx)$/i, "") || "My resume" },
      {
        onSuccess: (resume) => setResumeId(resume.id),
        onError: (err) => setFileError(errorMessage(err, "We couldn't upload that file. Please try again.")),
      },
    );
  };

  const reading = upload.isPending || (!!resumeId && parsed.isLoading);
  const busyLabel = upload.isPending ? "Uploading and reading your resume…" : "Extracting your skills and experience…";

  let body: React.ReactNode;
  if (mode === "manual") {
    body = <ManualProfile onDone={onComplete} onBack={onBack} />;
  } else if (resumeId && parsed.data) {
    body = (
      <ParsedReview
        key={resumeId}
        parsed={parsed.data}
        saving={importProfile.isPending}
        onBack={onBack}
        onReplace={() => {
          setResumeId(null);
          importProfile.reset();
        }}
        onSave={(reviewed) =>
          importProfile.mutate(reviewed, {
            onSuccess: () => {
              toast.success("Your profile is ready", { description: "You can refine it anytime from Profile." });
              onComplete();
            },
            onError: (err) => toast.error(errorMessage(err, "We couldn't save your profile. Please try again.")),
          })
        }
      />
    );
  } else if (resumeId && parsed.isError) {
    body = (
      <>
        <ErrorState
          title="We couldn't read the details from that resume"
          error={parsed.error}
          onRetry={() => parsed.refetch()}
          onContinue={() => setMode("manual")}
          continueLabel="Enter details manually"
        />
        <StepFooter onBack={onBack} onSkip={onNext} />
      </>
    );
  } else {
    body = (
      <>
        <ResumeDropzone onFile={onFile} busy={reading} busyLabel={busyLabel} error={fileError} />
        <div aria-live="polite" className="sr-only">
          {reading ? busyLabel : ""}
        </div>
        {reading && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2" aria-hidden>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
        )}
        <StepFooter onBack={onBack} onSkip={onNext} />
      </>
    );
  }

  return (
    <div>
      <StepHeader
        eyebrow="Step 2 · Build your profile"
        title="Let's build your profile."
        description="Your profile is the single source of truth for every match score, resume and answer. Applier only ever uses what's here."
      />
      {!(mode === "upload" && resumeId && parsed.data) && <ModeToggle mode={mode} onChange={setMode} />}
      {body}
    </div>
  );
}
