"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { useMarkNotificationRead } from "@/lib/queries/core";
import { pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useNow } from "@/components/interviews/time";
import { BrowserNotificationsCard, NotificationGroups, useNotificationCenter } from "@/components/notifications/notification-center";

export default function NotificationsPage() {
  const [filter, setFilter] = React.useState<"all" | "unread">("all");
  const { data, isLoading, error, refetch } = useNotificationCenter(filter === "unread");
  const markAll = useMarkNotificationRead();
  const now = useNow();
  const unread = data?.unread_count ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.12em] text-subtle">
            <Bell className="size-3.5" /> Notifications
          </span>
        }
        title="Notification Center"
        description="Matches, deadlines, interviews and updates from your career agent — all in one place."
        actions={
          <Button variant="secondary" onClick={() => markAll.mutate("all")} disabled={!unread} loading={markAll.isPending && markAll.variables === "all"}>
            <CheckCheck /> Mark all read
          </Button>
        }
      />

      <div className="space-y-5">
        <BrowserNotificationsCard />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "unread")}>
            <TabsList aria-label="Filter notifications">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">
                Unread
                {unread > 0 && (
                  <span className="tabular rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-fg">{unread}</span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-sm text-muted" aria-live="polite">
            {unread ? `${pluralize(unread, "unread notification")}` : "You're all caught up"}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2" role="status" aria-label="Loading notifications">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
                <Skeleton className="size-9 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} title="We couldn't load your notifications" onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          filter === "unread" ? (
            <EmptyState
              icon={<CheckCheck />}
              title="You're all caught up"
              description="No unread notifications. We'll let you know when something needs your attention."
              action={
                <Button variant="secondary" onClick={() => setFilter("all")}>
                  View all notifications
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Inbox />}
              title="No Notifications Yet"
              description="When your agent finds a great match, a deadline approaches or an interview is coming up, you'll see it here."
              action={
                <Button asChild>
                  <Link href="/jobs">Find Jobs</Link>
                </Button>
              }
            />
          )
        ) : (
          <NotificationGroups items={items} now={now} />
        )}
      </div>
    </div>
  );
}
