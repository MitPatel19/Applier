"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  BellRing,
  Briefcase,
  CalendarCheck,
  Link2,
  Mail,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";
import { errorMessage } from "@/lib/api";
import type { Recruiter } from "@/lib/types";
import { useFollowUps } from "@/lib/queries/followups";
import { useDeleteRecruiter, useRecruiters, useUpdateRecruiter } from "@/lib/queries/networking";
import { cn, initials, parseDate, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/primitives";
import { ContactDialog, CONTACT_KIND_LABELS, type ContactKind } from "@/components/networking/contact-dialog";
import { ContactSheet } from "@/components/networking/contact-sheet";
import { dayLabel, useNow } from "@/components/interviews/time";

type KindFilter = "all" | ContactKind;

/** "today", "tomorrow" or "Thursday, October 1" — for use mid-sentence. */
function friendlyDay(d: Date, now: number) {
  const label = dayLabel(d, now);
  return label === "Today" || label === "Tomorrow" ? label.toLowerCase() : label;
}

const KIND_TONE: Record<ContactKind, "primary" | "accent" | "neutral"> = {
  recruiter: "primary",
  hiring_manager: "accent",
  contact: "neutral",
};

function ContactRow({
  contact,
  now,
  onOpen,
  onEdit,
  onDelete,
}: {
  contact: Recruiter;
  now: number;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const next = parseDate(contact.next_follow_up_at);
  const overdue = next ? next.getTime() < now : false;
  const soon = next ? next.getTime() - now < 3 * 86_400_000 : false;
  return (
    <li className="group relative flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-card transition-colors hover:border-border-strong sm:p-4">
      <span
        className="bg-gradient-brand flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        aria-hidden
      >
        {initials(contact.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={onOpen}
            className="truncate text-left text-sm font-semibold after:absolute after:inset-0 hover:text-primary focus-visible:outline-none"
          >
            {contact.name}
          </button>
          <Badge tone={KIND_TONE[contact.kind]} size="xs">
            {CONTACT_KIND_LABELS[contact.kind]}
          </Badge>
        </p>
        <p className="truncate text-caption text-muted">{[contact.title, contact.company].filter(Boolean).join(" · ") || "No details yet"}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-subtle">
          <span>{contact.last_contact_at ? `Contacted ${relativeTime(contact.last_contact_at)}` : "Not contacted yet"}</span>
          {next && (
            <span className={cn("inline-flex items-center gap-1 font-medium", overdue ? "text-danger" : soon ? "text-warning" : "text-muted")}>
              <BellRing className="size-3" aria-hidden />
              {overdue ? "Follow-up overdue" : `Follow up ${friendlyDay(next, now)}`}
            </span>
          )}
          {contact.applications_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Briefcase className="size-3" aria-hidden /> {contact.applications_count}
            </span>
          )}
        </p>
      </div>
      <div className="relative z-10 flex items-center gap-1">
        {contact.email && (
          <Button asChild variant="ghost" size="icon-sm" className="hidden sm:inline-flex">
            <a href={`mailto:${contact.email}`} aria-label={`Email ${contact.name}`}>
              <Mail />
            </a>
          </Button>
        )}
        {contact.linkedin_url && (
          <Button asChild variant="ghost" size="icon-sm" className="hidden sm:inline-flex">
            <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" aria-label={`${contact.name} on LinkedIn (opens in a new tab)`}>
              <Link2 />
            </a>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${contact.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onOpen}>
              <Mail /> Write a message
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit contact
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trash2 /> Delete contact
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

interface UpcomingItem {
  key: string;
  contact: Recruiter;
  due: Date;
  note: string | null;
}

function UpcomingFollowUps({ contacts, now, onOpen }: { contacts: Recruiter[]; now: number; onOpen: (c: Recruiter) => void }) {
  const followUps = useFollowUps({ status: "pending" });
  const update = useUpdateRecruiter();
  const items = React.useMemo(() => {
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const out: UpcomingItem[] = [];
    for (const c of contacts) {
      const d = parseDate(c.next_follow_up_at);
      if (d) out.push({ key: `c${c.id}`, contact: c, due: d, note: null });
    }
    for (const f of followUps.data ?? []) {
      const c = f.recruiter_id ? byId.get(f.recruiter_id) : undefined;
      const d = parseDate(f.due_at);
      if (c && d) out.push({ key: `f${f.id}`, contact: c, due: d, note: f.note ?? (f.company_name ? `Re: ${f.company_name}` : null) });
    }
    return out.sort((a, b) => a.due.getTime() - b.due.getTime()).slice(0, 8);
  }, [contacts, followUps.data]);

  return (
    <section aria-labelledby="upcoming-heading" className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <h2 id="upcoming-heading" className="flex items-center gap-2 text-h3 font-semibold">
        <BellRing className="size-4 text-primary" /> Upcoming follow-ups
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No follow-ups planned. Set a reminder from a contact to stay in touch.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((it) => {
            const overdue = it.due.getTime() < now;
            return (
              <li key={it.key} className="flex items-center gap-3 py-2.5">
                <span
                  className={cn("h-8 w-1 shrink-0 rounded-full", overdue ? "bg-danger" : it.due.getTime() - now < 3 * 86_400_000 ? "bg-warning" : "bg-border-strong")}
                  aria-hidden
                />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(it.contact)}>
                  <span className="block truncate text-sm font-medium hover:text-primary">{it.contact.name}</span>
                  <span className={cn("block truncate text-caption", overdue ? "font-medium text-danger" : "text-muted")}>
                    {overdue ? "Overdue · " : ""}
                    {dayLabel(it.due, now)}
                    {it.note ? ` · ${it.note}` : ""}
                  </span>
                </button>
                {it.key.startsWith("c") && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Mark follow-up with ${it.contact.name} as done`}
                    onClick={() =>
                      update.mutate(
                        { id: it.contact.id, body: { next_follow_up_at: null, last_contact_at: new Date(now).toISOString() } },
                        { onSuccess: () => toast.success(`Nice — logged contact with ${it.contact.name}`), onError: (err) => toast.error(errorMessage(err)) },
                      )
                    }
                  >
                    <CalendarCheck />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function NetworkingView() {
  const { data, isLoading, error, refetch } = useRecruiters();
  const del = useDeleteRecruiter();
  const now = useNow();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [kind, setKind] = React.useState<KindFilter>("all");
  const [query, setQuery] = React.useState("");
  const [dialog, setDialog] = React.useState<{ open: boolean; contact: Recruiter | null }>({ open: false, contact: null });
  const [deleting, setDeleting] = React.useState<Recruiter | null>(null);

  const contactParam = Number(search.get("contact"));
  const applicationParam = Number(search.get("application")) || null;
  const sheetContact = data?.find((c) => c.id === contactParam) ?? null;

  const openSheet = (c: Recruiter) => {
    const next = new URLSearchParams(search.toString());
    next.set("contact", String(c.id));
    next.delete("application");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const closeSheet = () => {
    const next = new URLSearchParams(search.toString());
    next.delete("contact");
    next.delete("application");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const counts = React.useMemo(() => {
    const c: Record<KindFilter, number> = { all: 0, recruiter: 0, hiring_manager: 0, contact: 0 };
    for (const r of data ?? []) {
      c.all += 1;
      c[r.kind] += 1;
    }
    return c;
  }, [data]);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => kind === "all" || r.kind === kind)
      .filter((r) => !q || [r.name, r.title, r.company, r.email, r.notes].filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, kind, query]);

  const filters: { key: KindFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "recruiter", label: "Recruiters" },
    { key: "hiring_manager", label: "Hiring managers" },
    { key: "contact", label: "Contacts" },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 text-caption font-semibold uppercase tracking-[0.12em] text-subtle">
            <Users className="size-3.5" /> Networking
          </span>
        }
        title="Networking Assistant"
        description="Keep track of recruiters and hiring managers, and draft thoughtful messages in seconds. You always review and send them yourself."
        actions={
          <Button onClick={() => setDialog({ open: true, contact: null })}>
            <UserRoundPlus /> Add contact
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" role="status" aria-label="Loading contacts">
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-60 rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState error={error} title="We couldn't load your contacts" onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState
          icon={<Users />}
          title="No Contacts Yet"
          description="Add the recruiters and hiring managers you meet. Applier will help you write introductions, follow-ups and thank-you notes — and remind you to stay in touch."
          action={
            <Button onClick={() => setDialog({ open: true, contact: null })}>
              <UserRoundPlus /> Add your first contact
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3">
              <div className="relative">
                <label htmlFor="contact-search" className="sr-only">
                  Search contacts
                </label>
                <Input
                  id="contact-search"
                  icon={<Search />}
                  placeholder="Search by name, company, title or notes"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pr-9"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:bg-bg-subtle hover:text-text"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by type">
                {filters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={kind === f.key}
                    onClick={() => setKind(f.key)}
                    className={cn(
                      "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                      kind === f.key ? "border-transparent bg-text text-bg" : "border-border bg-surface text-muted hover:text-text",
                    )}
                  >
                    {f.label}
                    <span className={cn("tabular text-xs", kind === f.key ? "text-bg/70" : "text-subtle")}>{counts[f.key]}</span>
                  </button>
                ))}
              </div>
            </div>
            {rows.length === 0 ? (
              <EmptyState compact icon={<Search />} title="No contacts match" description="Try another search or filter." />
            ) : (
              <ul className="space-y-2.5" aria-label="Contacts">
                {rows.map((c) => (
                  <ContactRow
                    key={c.id}
                    contact={c}
                    now={now}
                    onOpen={() => openSheet(c)}
                    onEdit={() => setDialog({ open: true, contact: c })}
                    onDelete={() => setDeleting(c)}
                  />
                ))}
              </ul>
            )}
          </div>
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <UpcomingFollowUps contacts={data} now={now} onOpen={openSheet} />
          </aside>
        </div>
      )}

      <ContactDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        contact={dialog.contact}
        onSaved={(r) => {
          if (!dialog.contact) openSheet(r);
        }}
      />
      <ContactSheet
        contact={sheetContact}
        open={!!sheetContact}
        onOpenChange={(o) => !o && closeSheet()}
        onEdit={(c) => setDialog({ open: true, contact: c })}
        defaultApplicationId={applicationParam}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "contact"}?`}
        description="They'll be unlinked from any applications. This can't be undone."
        confirmLabel="Delete contact"
        tone="danger"
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("Contact deleted");
              if (sheetContact?.id === deleting.id) closeSheet();
              setDeleting(null);
            },
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      />
    </div>
  );
}

export default function NetworkingPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-60 rounded-2xl" />}>
      <NetworkingView />
    </React.Suspense>
  );
}
