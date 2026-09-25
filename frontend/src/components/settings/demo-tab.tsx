"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Database, FlaskConical, Sparkles, Trash2 } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useAgentStatus } from "@/lib/queries/core";
import { useClearDemo, useSeedDemo } from "@/lib/queries/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/feedback";
import { SettingsCard, SettingsPanel } from "./settings-shared";

const INCLUDED = [
  "A realistic sample profile and resumes",
  "Jobs from several sources with match scores",
  "Applications across every pipeline stage",
  "Interviews with prep, follow-ups and notifications",
  "Audit history and analytics you can explore",
];

export function DemoTab() {
  const { data: status } = useAgentStatus();
  const seed = useSeedDemo();
  const clear = useClearDemo();
  const [confirm, setConfirm] = React.useState<"seed" | "clear" | null>(null);
  const demoAvailable = status?.demo_mode ?? true;

  const run = () => {
    if (confirm === "seed") {
      seed.mutate(undefined, {
        onSuccess: (res) => {
          setConfirm(null);
          toast.success("Sample data loaded", { description: res?.message || "Explore your dashboard, jobs and pipeline." });
        },
        onError: (e) => {
          setConfirm(null);
          toast.error(errorMessage(e, "We couldn't load sample data."));
        },
      });
    } else if (confirm === "clear") {
      clear.mutate(undefined, {
        onSuccess: () => {
          setConfirm(null);
          toast.success("Sample data removed", { description: "Only your own data remains." });
        },
        onError: (e) => {
          setConfirm(null);
          toast.error(errorMessage(e, "We couldn't remove sample data."));
        },
      });
    }
  };

  return (
    <SettingsPanel
      title="Sample data"
      description="Try every part of Applier with realistic example data before connecting your own accounts."
    >
      {!demoAvailable && (
        <Callout tone="info" icon={<FlaskConical />} title="Demo mode is turned off on this server">
          Sample data isn&apos;t available right now. Your administrator can enable demo mode.
        </Callout>
      )}

      <SettingsCard
        icon={<Sparkles />}
        title="What's included"
        description="Sample items are clearly labeled “Demo” everywhere they appear, and are kept separate from your own data."
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {INCLUDED.map((i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {i}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-caption text-subtle">
          Sample data is only visible to you and is never sent anywhere.
        </p>
      </SettingsCard>

      <div className="grid gap-4 md:grid-cols-2">
        <SettingsCard icon={<Database />} title="Load sample data" description="Fills your account with demo items to explore.">
          <Button onClick={() => setConfirm("seed")} disabled={!demoAvailable}>
            <Sparkles /> Load sample data
          </Button>
        </SettingsCard>
        <SettingsCard icon={<Trash2 />} title="Remove sample data" description="Deletes only items marked Demo. Your own data is untouched.">
          <Button variant="secondary" onClick={() => setConfirm("clear")}>
            <Trash2 /> Remove sample data
          </Button>
          <Badge tone="neutral" size="xs" className="ml-2 align-middle">
            Safe
          </Badge>
        </SettingsCard>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "clear" ? "Remove all sample data?" : "Load sample data?"}
        description={
          confirm === "clear"
            ? "Every item marked Demo — jobs, applications, interviews, resumes and notifications — will be deleted. Your own data won't be affected."
            : "Applier will add a sample profile, jobs, applications, interviews and activity to your account. Everything is labeled Demo and can be removed anytime."
        }
        confirmLabel={confirm === "clear" ? "Remove sample data" : "Load sample data"}
        tone={confirm === "clear" ? "danger" : "primary"}
        loading={seed.isPending || clear.isPending}
        onConfirm={run}
      />
    </SettingsPanel>
  );
}
