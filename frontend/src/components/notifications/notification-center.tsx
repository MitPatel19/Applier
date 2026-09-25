"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlarmClock,
  ArrowRightLeft,
  BellOff,
  BellRing,
  Bot,
  CalendarClock,
  Check,
  CircleAlert,
  FileWarning,
  Info,
  MessageSquareReply,
  Settings,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Notification, NotificationList } from "@/lib/types";
import { qk, useMarkNotificationRead } from "@/lib/queries/core";
import { cn, formatTime, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/primitives";
import { dayLabel } from "@/components/interviews/time";

// ---------------------------------------------------------------- data
export function useNotificationCenter(unreadOnly: boolean) {
  return useQuery({
    queryKey: [...qk.notifications, "center", { unreadOnly }],
    queryFn: () => api.get<NotificationList>("/notifications", { unread: unreadOnly || undefined, limit: 100 }),
    refetchInterval: 60_000,
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/notifications/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.notifications });
      const prev = qc.getQueriesData<NotificationList>({ queryKey: qk.notifications });
      qc.setQueriesData<NotificationList>({ queryKey: qk.notifications }, (old) => {
        if (!old?.items) return old;
        const target = old.items.find((n) => n.id === id);
        return {
          items: old.items.filter((n) => n.id !== id),
          unread_count: Math.max(0, old.unread_count - (target && !target.read_at ? 1 : 0)),
        };
      });
      return { prev };
    },
    onError: (err, _id, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error("Couldn't delete the notification", { description: errorMessage(err) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

// ---------------------------------------------------------------- type meta
interface TypeMeta {
  icon: LucideIcon;
  label: string;
  color: string;
}

export const NOTIFICATION_TYPES: Record<string, TypeMeta> = {
  excellent_match: { icon: Sparkles, label: "Excellent match", color: "var(--success)" },
  deadline: { icon: AlarmClock, label: "Deadline", color: "var(--warning)" },
  interview: { icon: CalendarClock, label: "Interview", color: "var(--primary)" },
  recruiter_response: { icon: MessageSquareReply, label: "Recruiter response", color: "var(--info)" },
  follow_up: { icon: BellRing, label: "Follow-up", color: "var(--warning)" },
  status_change: { icon: ArrowRightLeft, label: "Status change", color: "var(--accent)" },
  resume_issue: { icon: FileWarning, label: "Resume issue", color: "var(--danger)" },
  missing_info: { icon: CircleAlert, label: "Missing info", color: "var(--warning)" },
  agent: { icon: Bot, label: "Career agent", color: "var(--primary)" },
  system: { icon: Info, label: "System", color: "var(--text-subtle)" },
};

export function typeMeta(type: string): TypeMeta {
  return NOTIFICATION_TYPES[type] ?? NOTIFICATION_TYPES.system;
}

function isInternal(link: string) {
  return link.startsWith("/");
}

// ---------------------------------------------------------------- item
export function NotificationItem({ n, onOpen }: { n: Notification; onOpen: (n: Notification) => void }) {
  const mark = useMarkNotificationRead();
  const del = useDeleteNotification();
  const meta = typeMeta(n.type);
  const Icon = meta.icon;
  const unread = !n.read_at;
  return (
    <li
      className={cn(
        "group relative flex gap-3 rounded-xl border p-3.5 transition-colors sm:p-4",
        unread ? "border-primary/20 bg-surface shadow-card" : "border-transparent bg-transparent hover:bg-surface/70",
      )}
    >
      <span
        className="relative flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4"
        style={{ background: `color-mix(in oklab, ${meta.color} 14%, transparent)`, color: meta.color }}
        aria-hidden
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {n.link ? (
            <button
              type="button"
              onClick={() => onOpen(n)}
              className={cn(
                "text-left text-sm after:absolute after:inset-0 after:rounded-xl hover:text-primary focus-visible:outline-none",
                unread ? "font-semibold text-text" : "font-medium text-muted",
              )}
            >
              {n.title}
            </button>
          ) : (
            <p className={cn("text-sm", unread ? "font-semibold text-text" : "font-medium text-muted")}>{n.title}</p>
          )}
          {n.priority === "high" && (
            <Badge tone="danger" size="xs">
              Important
            </Badge>
          )}
        </div>
        {n.body && <p className={cn("mt-0.5 text-sm", unread ? "text-muted" : "text-subtle")}>{n.body}</p>}
        <p className="mt-1 text-caption text-subtle">
          <span className="sr-only">{unread ? "Unread. " : ""}</span>
          {meta.label} · <time title={formatTime(n.created_at)}>{relativeTime(n.created_at)}</time>
        </p>
      </div>
      <div className="relative z-10 flex shrink-0 items-start gap-0.5">
        {unread && <span className="mr-1 mt-2.5 size-2 rounded-full bg-primary sm:hidden" aria-hidden />}
        {unread && (
          <Tooltip content="Mark as read">
            <Button variant="ghost" size="icon-sm" aria-label={`Mark "${n.title}" as read`} onClick={() => mark.mutate(n.id)} className="hidden sm:inline-flex">
              <Check />
            </Button>
          </Tooltip>
        )}
        <Tooltip content="Delete">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete "${n.title}"`}
            onClick={() => del.mutate(n.id)}
            className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          >
            <Trash2 />
          </Button>
        </Tooltip>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- list grouped by day
export function NotificationGroups({ items, now }: { items: Notification[]; now: number }) {
  const router = useRouter();
  const mark = useMarkNotificationRead();
  const groups = React.useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of items) {
      const label = dayLabel(n.created_at, now);
      map.set(label, [...(map.get(label) ?? []), n]);
    }
    return Array.from(map.entries());
  }, [items, now]);

  const open = (n: Notification) => {
    if (!n.read_at) mark.mutate(n.id);
    if (!n.link) return;
    if (isInternal(n.link)) router.push(n.link);
    else window.open(n.link, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-6">
      {groups.map(([label, list]) => (
        <section key={label} aria-label={label}>
          <h2 className="mb-2 flex items-center gap-2 px-1 text-caption font-semibold uppercase tracking-[0.12em] text-subtle">
            {label}
            <span className="h-px flex-1 bg-border" aria-hidden />
          </h2>
          <ul className="space-y-1.5">
            {list.map((n) => (
              <NotificationItem key={n.id} n={n} onOpen={open} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- browser notifications
type PermissionState = NotificationPermission | "unsupported";

function subscribePermission(cb: () => void) {
  // Permission changes aren't observable everywhere; re-check when the tab regains focus.
  window.addEventListener("focus", cb);
  return () => window.removeEventListener("focus", cb);
}
function getPermission(): PermissionState {
  return typeof window !== "undefined" && "Notification" in window ? window.Notification.permission : "unsupported";
}
function getServerPermission(): PermissionState {
  return "unsupported";
}

export function BrowserNotificationsCard() {
  const external = React.useSyncExternalStore(subscribePermission, getPermission, getServerPermission);
  const [override, setOverride] = React.useState<PermissionState | null>(null);
  const permission = override ?? external;
  const [busy, setBusy] = React.useState(false);

  if (permission === "unsupported") return null;

  const request = async () => {
    setBusy(true);
    try {
      const result = await window.Notification.requestPermission();
      setOverride(result);
      if (result === "granted") toast.success("Browser notifications enabled");
    } catch {
      toast.error("Your browser didn't allow the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-center">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          permission === "granted" ? "bg-success-soft text-success" : permission === "denied" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-soft-fg",
        )}
        aria-hidden
      >
        {permission === "denied" ? <BellOff className="size-5" /> : <BellRing className="size-5" />}
      </span>
      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="text-sm font-semibold">
          {permission === "granted"
            ? "Browser notifications are on"
            : permission === "denied"
              ? "Browser notifications are blocked"
              : "Get notified about interviews and strong matches"}
        </p>
        <p className="text-sm text-muted">
          {permission === "granted"
            ? "Choose which alerts you receive in notification settings."
            : permission === "denied"
              ? "Allow notifications for this site in your browser's settings to turn them on."
              : "We'll only notify you about things that need your attention."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {permission === "default" && (
          <Button size="sm" onClick={request} loading={busy}>
            Enable browser notifications
          </Button>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link href="/settings?tab=notifications">
            <Settings /> Settings
          </Link>
        </Button>
      </div>
    </div>
  );
}
