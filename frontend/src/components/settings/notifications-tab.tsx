"use client";

import * as React from "react";
import { toast } from "sonner";
import { BellRing, Inbox, Mail, MonitorSmartphone } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { usePreferences } from "@/lib/queries/core";
import { usePatchPreferences } from "@/lib/queries/settings";
import type { NotificationSettings } from "@/lib/types";
import { titleCase } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Callout, ErrorState } from "@/components/ui/feedback";
import { SwitchRow } from "@/components/ui/primitives";
import { PanelSkeleton, SettingsCard, SettingsPanel } from "./settings-shared";

type Permission = NotificationPermission | "unsupported";

const TYPES: { key: string; label: string; description: string }[] = [
  { key: "excellent_match", label: "Excellent new job match", description: "A new job scores above your strong-match threshold." },
  { key: "deadline", label: "Application deadline", description: "A saved or in-progress job is closing soon." },
  { key: "interview", label: "Interview", description: "Interview scheduled, changed or coming up." },
  { key: "recruiter_response", label: "Recruiter response", description: "A recruiter replied to you." },
  { key: "follow_up", label: "Follow-up date", description: "It's time to follow up on an application." },
  { key: "status_change", label: "Application status change", description: "An application moved to a new stage." },
  { key: "resume_issue", label: "Resume issue", description: "A resume problem could hurt your chances." },
  { key: "missing_info", label: "Missing application information", description: "An application needs details from you." },
  { key: "agent", label: "Agent activity", description: "Your Career Agent finished a run or needs attention." },
];

function readPermission(): Permission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function subscribePermission(onChange: () => void) {
  let status: PermissionStatus | null = null;
  let cancelled = false;
  navigator.permissions
    ?.query({ name: "notifications" as PermissionName })
    .then((s) => {
      if (cancelled) return;
      status = s;
      s.addEventListener("change", onChange);
    })
    .catch(() => {
      /* permissions API not available for notifications in this browser */
    });
  window.addEventListener("focus", onChange);
  return () => {
    cancelled = true;
    status?.removeEventListener("change", onChange);
    window.removeEventListener("focus", onChange);
  };
}

/** Live browser notification permission ("unsupported" during SSR or in browsers without the API). */
function useNotificationPermission() {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const permission = React.useSyncExternalStore(subscribePermission, readPermission, () => "unsupported" as Permission);
  return { permission, refresh: force };
}

const PERMISSION_BADGE: Record<Permission, { label: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  granted: { label: "Allowed in this browser", tone: "success" },
  default: { label: "Permission needed", tone: "warning" },
  denied: { label: "Blocked in this browser", tone: "danger" },
  unsupported: { label: "Not supported", tone: "neutral" },
};

export function NotificationsTab() {
  const { data, isLoading, error, refetch } = usePreferences();
  const patch = usePatchPreferences();
  const { permission, refresh } = useNotificationPermission();

  if (isLoading) return <PanelSkeleton cards={2} />;
  if (error || !data) return <ErrorState error={error} title="We couldn't load notification settings" onRetry={() => refetch()} />;

  const ns = data.notification_settings;
  const save = (next: NotificationSettings, message?: string) =>
    patch.mutate(
      { notification_settings: next },
      {
        onSuccess: () => message && toast.success(message),
        onError: (e) => toast.error(errorMessage(e, "We couldn't save that change.")),
      },
    );

  const onBrowserToggle = async (on: boolean) => {
    if (!on) return save({ ...ns, browser: false }, "Browser notifications turned off");
    if (permission === "unsupported") {
      toast.error("This browser doesn't support notifications.");
      return;
    }
    let result: NotificationPermission = Notification.permission;
    if (result === "default") {
      try {
        result = await Notification.requestPermission();
      } catch {
        result = Notification.permission;
      }
      refresh();
    }
    if (result === "granted") save({ ...ns, browser: true }, "Browser notifications turned on");
    else toast.error("Notifications are blocked", { description: "Allow notifications for this site in your browser settings, then try again." });
  };

  const typeKeys = [...TYPES.map((t) => t.key), ...Object.keys(ns.types).filter((k) => !TYPES.some((t) => t.key === k))];
  const badge = PERMISSION_BADGE[permission];

  return (
    <SettingsPanel title="Notifications" description="Choose how and when Applier gets your attention. Changes apply immediately.">
      <SettingsCard icon={<BellRing />} title="Channels">
        <div className="divide-y divide-border">
          <SwitchRow
            label={
              <span className="inline-flex items-center gap-2">
                <Inbox className="size-4 text-subtle" aria-hidden /> In-app
              </span>
            }
            description="The bell in the top bar and your dashboard."
            checked={ns.in_app}
            onCheckedChange={(v) => save({ ...ns, in_app: v }, `In-app notifications turned ${v ? "on" : "off"}`)}
          />
          <SwitchRow
            label={
              <span className="inline-flex items-center gap-2">
                <Mail className="size-4 text-subtle" aria-hidden /> Email
              </span>
            }
            description="A message to your account email for important updates."
            checked={ns.email}
            onCheckedChange={(v) => save({ ...ns, email: v }, `Email notifications turned ${v ? "on" : "off"}`)}
          />
          <SwitchRow
            label={
              <span className="inline-flex items-center gap-2">
                <MonitorSmartphone className="size-4 text-subtle" aria-hidden /> Browser
              </span>
            }
            badge={
              <Badge tone={badge.tone} size="xs">
                {badge.label}
              </Badge>
            }
            description="Desktop notifications while Applier is open in this browser."
            checked={ns.browser && permission === "granted"}
            disabled={permission === "unsupported"}
            onCheckedChange={(v) => void onBrowserToggle(v)}
          />
        </div>
        {permission === "denied" && (
          <Callout tone="warning" className="mt-3" title="Notifications are blocked for this site">
            To turn them on, open your browser&apos;s site settings for Applier, allow notifications, and then come back
            here.
          </Callout>
        )}
        {ns.browser && permission === "default" && (
          <Callout tone="info" className="mt-3" title="Permission needed on this device">
            Browser notifications are on for your account. Toggle the switch to allow them in this browser.
          </Callout>
        )}
      </SettingsCard>

      <SettingsCard title="What to notify me about" description="Applies to every channel you've turned on.">
        <div className="divide-y divide-border">
          {typeKeys.map((k) => {
            const meta = TYPES.find((t) => t.key === k);
            const label = meta?.label ?? titleCase(k);
            const checked = ns.types[k] ?? true;
            return (
              <SwitchRow
                key={k}
                label={label}
                description={meta?.description}
                checked={checked}
                onCheckedChange={(v) => save({ ...ns, types: { ...ns.types, [k]: v } }, `${label} notifications ${v ? "on" : "off"}`)}
              />
            );
          })}
        </div>
      </SettingsCard>
    </SettingsPanel>
  );
}
