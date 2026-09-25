"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bell,
  Briefcase,
  CalendarClock,
  Check,
  ChevronDown,
  Kanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import { Dialog as D } from "radix-ui";
import { cn, initials, relativeTime } from "@/lib/utils";
import { useAgentStatus, useLogout, useMarkNotificationRead, useMe, useNotifications } from "@/lib/queries/core";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from "@/components/ui/primitives";
import { useHydrated } from "@/components/marketing/theme-toggle";
import { Logo } from "./logo";
import { NAV, isActive } from "./nav";

// ---------------------------------------------------------------- sidebar
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="space-y-0.5">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href) || (item.match ?? []).some((m) => isActive(pathname, m));
        const Icon = item.icon!;
        return (
          <div key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active && !item.children ? "page" : undefined}
              className={cn(
                "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active ? "bg-primary-soft text-primary-soft-fg" : "text-muted hover:bg-bg-subtle hover:text-text",
              )}
            >
              <Icon className={cn("size-[18px] shrink-0", active ? "" : "text-subtle group-hover:text-text")} />
              <span className="flex-1 truncate">{item.label}</span>
              {item.children && <ChevronDown className={cn("size-3.5 opacity-50 transition-transform", !active && "-rotate-90")} />}
            </Link>
            {item.children && active && (
              <div className="ml-[21px] mt-0.5 space-y-0.5 border-l border-border pl-3">
                {item.children.map((c) => {
                  const childActive = isActive(pathname, c.href, c.exact);
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      onClick={onNavigate}
                      aria-current={childActive ? "page" : undefined}
                      className={cn(
                        "flex h-8 items-center rounded-md px-2.5 text-sm transition-colors",
                        childActive ? "font-medium text-text" : "text-muted hover:text-text",
                      )}
                    >
                      {childActive && <span className="-ml-[17px] mr-2.5 h-4 w-0.5 rounded-full bg-primary" aria-hidden />}
                      {c.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function AgentPill({ compact }: { compact?: boolean }) {
  const { data } = useAgentStatus();
  const running = !!data?.running;
  const label = running
    ? data!.running!.steps.find((s) => s.status === "running")?.label ?? "Working…"
    : "Agent ready";
  return (
    <Link
      href="/agent"
      className={cn(
        "flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:border-border-strong",
        compact && "px-2.5",
      )}
      aria-label={`Career agent: ${label}`}
    >
      <span className="relative flex size-2">
        <span className={cn("absolute inline-flex size-full rounded-full", running ? "animate-ping bg-primary opacity-60" : "bg-success/40")} />
        <span className={cn("relative inline-flex size-2 rounded-full", running ? "bg-primary" : "bg-success")} />
      </span>
      {!compact && <span className="max-w-[14rem] truncate text-muted">{label}</span>}
    </Link>
  );
}

// ---------------------------------------------------------------- notifications
function NotificationsButton() {
  const { data } = useNotifications();
  const mark = useMarkNotificationRead();
  const router = useRouter();
  const unread = data?.unread_count ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={() => mark.mutate("all")}>
              <Check /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[26rem] overflow-y-auto scrollbar-thin">
          {!data?.items.length ? (
            <p className="px-4 py-10 text-center text-sm text-muted">You&apos;re all caught up.</p>
          ) : (
            data.items.slice(0, 12).map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read_at) mark.mutate(n.id);
                  if (n.link) router.push(n.link);
                }}
                className="flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-bg-subtle"
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : n.priority === "high" ? "bg-danger" : "bg-primary")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", !n.read_at && "font-medium")}>{n.title}</span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-subtle">{relativeTime(n.created_at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/notifications">View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------- theme + user
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useHydrated();
  const Icon = !mounted ? Monitor : theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <DropdownMenu>
      <Tooltip content="Theme">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Change theme">
            <Icon />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent className="min-w-36">
        {(
          [
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "System", Monitor],
          ] as const
        ).map(([v, l, I]) => (
          <DropdownMenuItem key={v} onSelect={() => setTheme(v)}>
            <I /> {l} {mounted && theme === v && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: { user: User }) {
  const logout = useLogout();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-bg-subtle"
          aria-label="Account menu"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-gradient-brand text-xs font-semibold text-white">
            {initials(user.full_name)}
          </span>
          <ChevronDown className="hidden size-3.5 text-subtle sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block text-sm font-medium text-text">{user.full_name}</span>
          <span className="block truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=privacy">
            <ShieldCheck /> Privacy & Security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout.mutate()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/jobs?q=${encodeURIComponent(q.trim())}`);
      }}
      className="relative hidden w-full max-w-md md:block"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search jobs, companies, skills…"
        aria-label="Search jobs"
        className="h-9 w-full rounded-lg border border-border bg-bg-subtle/70 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-subtle hover:border-border-strong focus:border-primary focus:bg-surface focus:ring-3 focus:ring-primary/20"
      />
    </form>
  );
}

// ---------------------------------------------------------------- mobile
const MOBILE_TABS = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Jobs", href: "/jobs", icon: Briefcase },
  { label: "Pipeline", href: "/applications", icon: Kanban },
  { label: "Interviews", href: "/interviews", icon: CalendarClock },
];

function MobileTabBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Quick navigation"
      className="glass fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {MOBILE_TABS.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active ? "text-primary" : "text-subtle")}
          >
            <t.icon className="size-5" />
            {t.label}
          </Link>
        );
      })}
      <button onClick={onMenu} className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-subtle">
        <Menu className="size-5" />
        More
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------- shell
export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface/70 lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo href="/dashboard" />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 scrollbar-thin">
          <SidebarNav />
        </div>
        <div className="border-t border-border p-3">
          <div className="rounded-xl bg-gradient-to-br from-primary-soft to-accent-soft p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-text">
              <ShieldCheck className="size-3.5 text-success" /> You&apos;re in control
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Nothing is ever submitted without your explicit approval.
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-black/40 lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-surface shadow-pop focus:outline-none lg:hidden">
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">Main navigation menu</D.Description>
            <div className="flex h-16 items-center px-5">
              <Logo href="/dashboard" />
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="lg:pl-64">
        <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>
          <div className="lg:hidden">
            <Logo href="/dashboard" className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
          </div>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <div className="hidden sm:block">
              <AgentPill />
            </div>
            <div className="sm:hidden">
              <AgentPill compact />
            </div>
            <NotificationsButton />
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>
      <MobileTabBar onMenu={() => setMobileOpen(true)} />
    </div>
  );
}

export function useCurrentUser(): User {
  const { data } = useMe();
  if (!data) throw new Error("useCurrentUser must be used inside the authenticated app layout");
  return data;
}
