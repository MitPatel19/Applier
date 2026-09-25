"use client";

import * as React from "react";
import { Check, Globe, Info, KeyRound, Link2, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, ErrorState, Skeleton } from "@/components/ui/feedback";
import { ApiError, errorMessage } from "@/lib/api";
import { useConnectIntegration, useIntegrations } from "@/lib/queries/onboarding";
import type { Integration } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ContinueButton, StepFooter, StepHeader } from "./step-shell";
import type { StepProps } from "./steps";

type Note = { tone: "info" | "danger"; text: string };

const FALLBACK_COPY: Record<string, { name: string; description: string }> = {
  linkedin: { name: "LinkedIn", description: "Search LinkedIn job postings that match your goals." },
  indeed: { name: "Indeed", description: "Include Indeed listings in every search." },
  gmail: { name: "Gmail", description: "Detect employer replies about your applications." },
  outlook: { name: "Outlook", description: "Detect employer replies about your applications." },
};

function Mark({ provider }: { provider: string }) {
  const map: Record<string, React.ReactNode> = {
    linkedin: <span className="text-[13px] font-bold tracking-tight">in</span>,
    indeed: <span className="text-[13px] font-bold tracking-tight">id</span>,
    email: <Mail className="size-5" />,
  };
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-subtle text-text">
      {map[provider] ?? <Link2 className="size-5" />}
    </span>
  );
}

function StatusBadgeFor({ integration }: { integration: Integration | undefined }) {
  if (integration?.status === "connected") {
    return (
      <Badge tone="success" dot>
        Connected
      </Badge>
    );
  }
  if (integration?.status === "error") return <Badge tone="warning">Needs attention</Badge>;
  if (integration && !integration.available) return <Badge tone="outline">Unavailable</Badge>;
  return <Badge tone="neutral">Not connected</Badge>;
}

function ConnectButton({
  provider,
  integration,
  label,
  pending,
  onConnect,
}: {
  provider: string;
  integration: Integration | undefined;
  label: string;
  pending: boolean;
  onConnect: (p: string) => void;
}) {
  if (integration?.status === "connected") {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-success">
        <Check className="size-4" aria-hidden /> {label} connected
      </span>
    );
  }
  const unavailable = integration ? !integration.available : false;
  return (
    <Button
      variant="secondary"
      size="sm"
      className="h-9"
      loading={pending}
      disabled={unavailable}
      onClick={() => onConnect(provider)}
    >
      {!pending && <KeyRound />}
      {integration?.status === "error" ? `Reconnect ${label}` : `Connect ${label}`}
    </Button>
  );
}

function SourceCard({
  mark,
  title,
  description,
  integrations,
  providers,
  pending,
  notes,
  onConnect,
}: {
  mark: string;
  title: string;
  description: string;
  integrations: (Integration | undefined)[];
  providers: { key: string; label: string }[];
  pending: string | null;
  notes: Record<string, Note | undefined>;
  onConnect: (p: string) => void;
}) {
  const connected = integrations.find((i) => i?.status === "connected");
  const primary = connected ?? integrations.find(Boolean);
  const scopes = Array.from(new Set(integrations.flatMap((i) => i?.scope_explanations ?? [])));
  const availabilityNotes = Array.from(
    new Set(integrations.map((i) => (i && !i.available ? i.availability_note : null)).filter((x): x is string => !!x)),
  );
  const cardNotes = providers.map((p) => notes[p.key]).filter((n): n is Note => !!n);
  return (
    <li className={cn("rounded-2xl border bg-surface p-5 shadow-card transition-colors", connected ? "border-success/35" : "border-border")}>
      <div className="flex items-start gap-3.5">
        <Mark provider={mark} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{title}</h3>
            <StatusBadgeFor integration={primary} />
          </div>
          <p className="mt-1 text-sm text-muted">{description}</p>
          {connected?.account_label && <p className="mt-1 text-caption text-subtle">Signed in as {connected.account_label}</p>}
        </div>
      </div>

      {scopes.length > 0 && (
        <div className="mt-4 rounded-xl bg-bg-subtle px-3.5 py-3">
          <p className="text-caption font-semibold uppercase tracking-[0.1em] text-subtle">What Applier can access</p>
          <ul className="mt-1.5 space-y-1">
            {scopes.map((s) => (
              <li key={s} className="flex gap-2 text-sm text-muted">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div aria-live="polite" className="space-y-2 empty:hidden">
        {[...availabilityNotes.map((text) => ({ tone: "info" as const, text })), ...cardNotes].map((n, i) => (
          <Callout key={i} tone={n.tone === "danger" ? "danger" : "info"} icon={<Info />} className="mt-3">
            {n.text}
          </Callout>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {providers.map((p) => (
          <ConnectButton
            key={p.key}
            provider={p.key}
            label={p.label}
            integration={integrations[providers.indexOf(p)]}
            pending={pending === p.key}
            onConnect={onConnect}
          />
        ))}
      </div>
    </li>
  );
}

export function StepSources({ onBack, onNext, onComplete }: StepProps) {
  const { data, isLoading, error, refetch } = useIntegrations();
  const connect = useConnectIntegration();
  const [pending, setPending] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, Note | undefined>>({});

  const byKey = React.useMemo(() => new Map((data ?? []).map((i) => [i.provider, i] as const)), [data]);
  const get = (k: string) => byKey.get(k);
  const anyConnected = (data ?? []).some((i) => i.status === "connected");

  const onConnect = (provider: string) => {
    setPending(provider);
    setNotes((n) => ({ ...n, [provider]: undefined }));
    connect.mutate(provider, {
      onSuccess: ({ authorize_url }) => {
        window.location.assign(authorize_url);
      },
      onError: (err) => {
        setPending(null);
        const text = errorMessage(err, "We couldn't start the connection. Please try again.");
        // A 400 means this server has no OAuth credentials for the provider — informational, not a failure.
        setNotes((n) => ({ ...n, [provider]: { tone: err instanceof ApiError && err.status === 400 ? "info" : "danger", text } }));
      },
    });
  };

  return (
    <div>
      <StepHeader
        eyebrow="Step 4 · Connect sources"
        title="Where should your agent look?"
        description="Connecting accounts is optional. Connections use OAuth — you sign in on the provider's own page and we never see your password."
      />

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2" role="status" aria-label="Loading connections">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex gap-3.5">
                <Skeleton className="size-11 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
              <Skeleton className="mt-5 h-9 w-36" />
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} title="We couldn't load your connections" onRetry={() => refetch()} onContinue={onNext} continueLabel="Skip this step" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          <SourceCard
            mark="linkedin"
            title={get("linkedin")?.name ?? FALLBACK_COPY.linkedin.name}
            description={get("linkedin")?.description ?? FALLBACK_COPY.linkedin.description}
            integrations={[get("linkedin")]}
            providers={[{ key: "linkedin", label: "LinkedIn" }]}
            pending={pending}
            notes={notes}
            onConnect={onConnect}
          />
          <SourceCard
            mark="indeed"
            title={get("indeed")?.name ?? FALLBACK_COPY.indeed.name}
            description={get("indeed")?.description ?? FALLBACK_COPY.indeed.description}
            integrations={[get("indeed")]}
            providers={[{ key: "indeed", label: "Indeed" }]}
            pending={pending}
            notes={notes}
            onConnect={onConnect}
          />
          <SourceCard
            mark="email"
            title="Email (Gmail or Outlook)"
            description="Optional, read-only. Lets Applier notice interview invitations and replies and update your pipeline. It never sends email for you."
            integrations={[get("gmail"), get("outlook")]}
            providers={[
              { key: "gmail", label: "Gmail" },
              { key: "outlook", label: "Outlook" },
            ]}
            pending={pending}
            notes={notes}
            onConnect={onConnect}
          />
          <li className="flex flex-col rounded-2xl border border-dashed border-border-strong bg-surface-2 p-5">
            <div className="flex items-start gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
                <Globe className="size-5" aria-hidden />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">Employer career pages</h3>
                  <Badge tone="success">Always on</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  No connection needed. Applier reads public career pages and applicant-tracking listings directly.
                </p>
              </div>
            </div>
          </li>
        </ul>
      )}

      <p className="mt-4 text-caption text-subtle">
        After you approve a connection you&apos;ll land in Settings. Your setup progress is saved, so you can return here to
        finish.
      </p>

      <StepFooter
        onBack={onBack}
        primary={
          <ContinueButton onClick={anyConnected ? onComplete : onNext}>
            {anyConnected ? "Continue" : "Skip — I'll connect later"}
          </ContinueButton>
        }
      />
    </div>
  );
}
