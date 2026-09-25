"use client";

import * as React from "react";
import { toast } from "sonner";
import { Briefcase, CalendarDays, CheckCircle2, Info, Link2, Link2Off, Mail, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { ApiError, errorMessage } from "@/lib/api";
import { useConnectIntegration, useDisconnectIntegration, useIntegrations, useSyncEmail } from "@/lib/queries/integrations";
import type { Integration } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState, ErrorState } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PanelSkeleton, SettingsPanel } from "./settings-shared";

const GROUPS: { category: Integration["category"]; title: string; description: string; icon: React.ReactNode }[] = [
  { category: "job_source", title: "Job sources", description: "Search and import postings from your accounts.", icon: <Briefcase /> },
  { category: "email", title: "Email", description: "Detect recruiter replies, interview invites and rejections.", icon: <Mail /> },
  { category: "calendar", title: "Calendar", description: "Add interviews and follow-ups to your calendar.", icon: <CalendarDays /> },
];

const STATUS: Record<Integration["status"], { label: string; tone: BadgeTone }> = {
  connected: { label: "Connected", tone: "success" },
  disconnected: { label: "Not connected", tone: "neutral" },
  error: { label: "Needs attention", tone: "danger" },
  pending: { label: "Connecting…", tone: "info" },
  unavailable: { label: "Not available", tone: "neutral" },
};

function IntegrationCard({
  integration: i,
  onConnect,
  onDisconnect,
  connecting,
}: {
  integration: Integration;
  onConnect: () => void;
  onDisconnect: () => void;
  connecting: boolean;
}) {
  const status = STATUS[i.status] ?? STATUS.disconnected;
  const connected = i.status === "connected" || i.status === "error";
  return (
    <Card className="flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bg-subtle text-sm font-semibold text-text"
            aria-hidden
          >
            {i.name.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <h4 className="truncate font-semibold text-text">{i.name}</h4>
            <p className="truncate text-caption text-subtle">{i.account_label ?? (connected ? "Connected account" : "No account connected")}</p>
          </div>
        </div>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </div>

      <p className="mt-3 text-sm text-muted">{i.description}</p>

      {i.scope_explanations.length > 0 && (
        <div className="mt-3">
          <p className="text-caption font-medium text-subtle">{connected ? "Applier can:" : "If you connect, Applier will be able to:"}</p>
          <ul className="mt-1.5 space-y-1">
            {i.scope_explanations.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm text-muted">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {i.last_error && (
        <Callout tone="danger" icon={<TriangleAlert />} className="mt-3">
          {i.last_error}
        </Callout>
      )}
      {!i.available && !connected && (
        <Callout tone="info" icon={<Info />} className="mt-3">
          {i.availability_note ?? "This connection isn't set up on this Applier server yet."}
        </Callout>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <p className="text-caption text-subtle">
          {connected ? (i.last_sync_at ? `Last synced ${relativeTime(i.last_sync_at)}` : "Not synced yet") : ""}
        </p>
        {connected ? (
          <Button size="sm" variant="secondary" onClick={onDisconnect}>
            <Link2Off /> Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={onConnect} loading={connecting} disabled={!i.available}>
            {!connecting && <Link2 />} Connect
          </Button>
        )}
      </div>
    </Card>
  );
}

export function IntegrationsTab() {
  const { data, isLoading, error, refetch } = useIntegrations();
  const connect = useConnectIntegration();
  const disconnect = useDisconnectIntegration();
  const sync = useSyncEmail();
  const [pending, setPending] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<Integration | null>(null);

  const onConnect = (i: Integration) => {
    setPending(i.provider);
    connect.mutate(i.provider, {
      onSuccess: ({ authorize_url }) => {
        window.location.href = authorize_url;
      },
      onError: (e) => {
        setPending(null);
        toast.error(`Couldn't connect ${i.name}`, {
          description: e instanceof ApiError ? e.message : errorMessage(e),
        });
      },
    });
  };

  const onDisconnect = () => {
    if (!confirm) return;
    const name = confirm.name;
    disconnect.mutate(confirm.provider, {
      onSuccess: () => {
        setConfirm(null);
        toast.success(`${name} disconnected`, { description: "Access tokens were deleted." });
      },
      onError: (e) => toast.error(errorMessage(e, `We couldn't disconnect ${name}.`)),
    });
  };

  const onSync = () =>
    sync.mutate(undefined, {
      onSuccess: () => toast.success("Checking your inbox for job emails", { description: "Status updates will appear in your pipeline." }),
      onError: (e) => toast.error(errorMessage(e, "We couldn't start the email sync.")),
    });

  if (isLoading) return <PanelSkeleton cards={3} />;
  if (error || !data) return <ErrorState error={error} title="We couldn't load your connections" onRetry={() => refetch()} />;

  const emailConnected = data.some((i) => i.category === "email" && i.status === "connected");

  return (
    <SettingsPanel
      title="Account connections"
      description="Connect job boards, email and calendar so your Career Agent can do more for you."
    >
      <Callout tone="success" icon={<ShieldCheck />} title="Your passwords stay with you">
        We never store your passwords — connections use secure OAuth and can be revoked anytime, here or from the
        provider&apos;s account settings.
      </Callout>

      {data.length === 0 ? (
        <EmptyState icon={<Link2 />} title="No connections available" description="This Applier server doesn't offer any account connections yet." />
      ) : (
        GROUPS.map((g) => {
          const items = data.filter((i) => i.category === g.category);
          if (!items.length) return null;
          return (
            <section key={g.category} aria-labelledby={`int-${g.category}`} className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-subtle [&_svg]:size-4" aria-hidden>
                    {g.icon}
                  </span>
                  <div>
                    <h3 id={`int-${g.category}`} className="text-h3 font-semibold">
                      {g.title}
                    </h3>
                    <p className="text-caption text-muted">{g.description}</p>
                  </div>
                </div>
                {g.category === "email" && (
                  <Button size="sm" variant="secondary" onClick={onSync} loading={sync.isPending} disabled={!emailConnected}>
                    {!sync.isPending && <RefreshCw />} Sync job emails now
                  </Button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((i) => (
                  <IntegrationCard
                    key={i.provider}
                    integration={i}
                    connecting={pending === i.provider}
                    onConnect={() => onConnect(i)}
                    onDisconnect={() => setConfirm(i)}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Disconnect ${confirm?.name ?? ""}?`}
        description={
          confirm?.category === "email"
            ? "Applier will delete its access tokens and stop reading job-related emails. Status updates already imported stay in your pipeline."
            : confirm?.category === "calendar"
              ? "Applier will delete its access tokens and stop adding interviews to this calendar. Existing events aren't removed."
              : "Applier will delete its access tokens and stop searching this source with your account. Jobs already found stay in your lists."
        }
        confirmLabel="Disconnect"
        tone="danger"
        loading={disconnect.isPending}
        onConfirm={onDisconnect}
      />
    </SettingsPanel>
  );
}
