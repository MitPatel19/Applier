"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CircleHelp,
  ExternalLink,
  RefreshCw,
  ThumbsUp,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { useResearchCompany } from "@/lib/queries/companies";
import { useRescoreJob } from "@/lib/queries/jobs";
import type { Company, JobDetail, JobMatch, JobSource } from "@/lib/types";
import { cn, formatDate, hostFromUrl, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Eyebrow } from "@/components/ui/card";
import { KeyValue } from "@/components/ui/layout";
import { ScoreRing } from "@/components/ui/score";
import { CompanyFactGroups, FactLegend } from "@/components/companies/company-facts";

// ------------------------------------------------------------------ verdict

const VERDICT: Record<JobMatch["should_apply"], { title: string; tone: string; icon: typeof ThumbsUp; label: string }> = {
  apply: { title: "Yes — this is worth applying to", tone: "border-success/30 bg-success-soft/40", icon: ThumbsUp, label: "Recommended" },
  consider: { title: "Worth considering", tone: "border-warning/30 bg-warning-soft/40", icon: CircleHelp, label: "Consider" },
  skip: { title: "Probably not the best use of your time", tone: "border-border bg-bg-subtle", icon: TriangleAlert, label: "Likely skip" },
};

export function VerdictCard({ job }: { job: JobDetail }) {
  const rescore = useRescoreJob();
  const m = job.full_match;
  if (!m) {
    return (
      <Card className="p-5">
        <Eyebrow>Should you apply?</Eyebrow>
        <p className="mt-2 font-semibold">This job hasn&apos;t been scored yet</p>
        <p className="mt-1 text-sm text-muted">Score it against your profile to see how well it fits and what might be missing.</p>
        <Button
          className="mt-4"
          variant="secondary"
          loading={rescore.isPending}
          onClick={() =>
            rescore.mutate(job.id, {
              onSuccess: (r) => toast.success(`Scored: ${r.overall}% match`),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          <RefreshCw /> Score this job
        </Button>
      </Card>
    );
  }
  const v = VERDICT[m.should_apply];
  return (
    <section aria-labelledby="verdict-title" className={cn("rounded-2xl border p-5 sm:p-6", v.tone)}>
      <div className="flex items-start gap-4">
        <ScoreRing score={m.overall} size={64} stroke={5} />
        <div className="min-w-0 flex-1">
          <Eyebrow>Should you apply?</Eyebrow>
          <h2 id="verdict-title" className="mt-1 flex flex-wrap items-center gap-2 text-h2 font-semibold">
            <v.icon className="size-5 shrink-0" aria-hidden /> {v.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{m.recommendation}</p>
        </div>
      </div>
      {(m.concerns.length > 0 || m.missing_required.length > 0) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {m.missing_required.length > 0 && (
            <div className="rounded-xl bg-surface/80 p-3">
              <p className="text-sm font-medium">You may be missing</p>
              <p className="mt-1 text-sm text-muted">{m.missing_required.join(", ")}</p>
            </div>
          )}
          {m.concerns.length > 0 && (
            <div className="rounded-xl bg-surface/80 p-3">
              <p className="text-sm font-medium">Things to consider</p>
              <ul className="mt-1 space-y-0.5 text-sm text-muted">
                {m.concerns.slice(0, 3).map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ requirements

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]/g, "");

type SkillState = "have" | "missing" | "unknown";

function useSkillLookup(match: JobMatch | null) {
  return React.useMemo(() => {
    const have = new Set<string>();
    const missing = new Set<string>();
    if (match) {
      for (const c of match.breakdown) {
        c.matched.forEach((s) => have.add(norm(s)));
        c.missing.forEach((s) => missing.add(norm(s)));
      }
      match.missing_required.forEach((s) => missing.add(norm(s)));
      match.missing_preferred.forEach((s) => missing.add(norm(s)));
    }
    return (skill: string): SkillState => (have.has(norm(skill)) ? "have" : missing.has(norm(skill)) ? "missing" : "unknown");
  }, [match]);
}

function SkillChip({ skill, state }: { skill: string; state: SkillState }) {
  const Icon = state === "have" ? CheckCircle2 : state === "missing" ? XCircle : CircleDashed;
  const sr = state === "have" ? "You have this" : state === "missing" ? "Missing" : "Not assessed";
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm",
        state === "have" && "border-success/25 bg-success-soft/50 text-text",
        state === "missing" && "border-danger/25 bg-danger-soft/50 text-text",
        state === "unknown" && "border-border bg-surface text-muted",
      )}
    >
      <Icon
        className={cn("size-3.5 shrink-0", state === "have" ? "text-success" : state === "missing" ? "text-danger" : "text-subtle")}
        aria-hidden
      />
      <span className="sr-only">{sr}: </span>
      {skill}
    </li>
  );
}

function SkillGroup({ title, skills, lookup }: { title: string; skills: string[]; lookup: (s: string) => SkillState }) {
  if (!skills.length) return null;
  const haveCount = skills.filter((s) => lookup(s) === "have").length;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-caption text-subtle">
          You have {haveCount} of {skills.length}
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <SkillChip key={s} skill={s} state={lookup(s)} />
        ))}
      </ul>
    </div>
  );
}

function experienceText(min: number | null, max: number | null) {
  if (min === null && max === null) return null;
  if (min !== null && max !== null && max !== min) return `${min}–${max} years`;
  return `${min ?? max}+ years`;
}

export function RequirementsCard({ job }: { job: JobDetail }) {
  const r = job.requirements;
  const lookup = useSkillLookup(job.full_match);
  const [allResp, setAllResp] = React.useState(false);
  const exp = experienceText(r.min_years_experience, r.max_years_experience);
  const education = [r.education_level, ...r.education].filter(Boolean) as string[];
  const resp = allResp ? r.responsibilities : r.responsibilities.slice(0, 6);
  const extraTech = r.technologies.filter(
    (t) => !r.required_skills.some((s) => norm(s) === norm(t)) && !r.preferred_skills.some((s) => norm(s) === norm(t)),
  );
  const hasAny =
    r.required_skills.length || r.preferred_skills.length || exp || education.length || r.responsibilities.length || r.certifications.length;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Requirements</CardTitle>
          <CardDescription>Extracted from the posting and compared with your profile.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasAny ? (
          <p className="text-sm text-muted">The posting doesn&apos;t list clear requirements. Read the full description below.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-subtle" aria-hidden>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="size-3.5 text-success" /> You have
              </span>
              <span className="inline-flex items-center gap-1">
                <XCircle className="size-3.5 text-danger" /> Missing
              </span>
              <span className="inline-flex items-center gap-1">
                <CircleDashed className="size-3.5" /> Not assessed
              </span>
            </div>
            <SkillGroup title="Required skills" skills={r.required_skills} lookup={lookup} />
            <SkillGroup title="Nice to have" skills={r.preferred_skills} lookup={lookup} />
            {r.certifications.length > 0 && <SkillGroup title="Certifications" skills={r.certifications} lookup={lookup} />}

            {(exp || education.length > 0 || r.work_authorization) && (
              <dl className="grid gap-4 rounded-xl bg-bg-subtle p-4 sm:grid-cols-3">
                <KeyValue label="Experience">{exp ?? <span className="text-subtle">Not specified</span>}</KeyValue>
                <KeyValue label="Education">
                  <span className="whitespace-normal">{education.length ? education.join(" · ") : <span className="text-subtle">Not specified</span>}</span>
                </KeyValue>
                <KeyValue label="Work authorization">
                  <span className="whitespace-normal">{r.work_authorization ?? <span className="text-subtle">Not specified</span>}</span>
                </KeyValue>
              </dl>
            )}

            {r.responsibilities.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">What you&apos;d do</p>
                <ul className="space-y-1.5 text-sm text-muted">
                  {resp.map((x) => (
                    <li key={x} className="flex gap-2">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-subtle" aria-hidden />
                      {x}
                    </li>
                  ))}
                </ul>
                {r.responsibilities.length > 6 && (
                  <button type="button" onClick={() => setAllResp((v) => !v)} className="mt-2 text-sm font-medium text-primary hover:underline" aria-expanded={allResp}>
                    {allResp ? "Show fewer" : `Show all ${r.responsibilities.length}`}
                  </button>
                )}
              </div>
            )}

            {extraTech.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">Also mentioned</p>
                <div className="flex flex-wrap gap-1.5">
                  {extraTech.map((t) => (
                    <Badge key={t} tone="neutral">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {r.benefits.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">Benefits</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.benefits.map((b) => (
                    <Badge key={b} tone="accent">
                      {b}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ description

type Block = { type: "p"; text: string } | { type: "h"; text: string } | { type: "ul"; items: string[] };

const BULLET = /^\s*(?:[-*•·▪◦–]|\d+[.)])\s+/;

function htmlToText(s: string) {
  if (!/<\/?(p|br|li|ul|ol|div|h\d|strong|b)\b/i.test(s)) return s;
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h\d|ul|ol)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"');
}

export function parseDescription(raw: string): Block[] {
  const text = htmlToText(raw).replace(/\r\n/g, "\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: "ul", items: list });
    list = [];
  };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if (BULLET.test(line)) {
      flushPara();
      list.push(line.replace(BULLET, ""));
      continue;
    }
    const isHeading = line.length <= 60 && (/:$/.test(line) || (/^[A-Z0-9 &/,'-]+$/.test(line) && /[A-Z]/.test(line) && line.split(" ").length <= 6));
    if (isHeading) {
      flushPara();
      flushList();
      blocks.push({ type: "h", text: line.replace(/:$/, "") });
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

export function JobDescription({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseDescription(text), [text]);
  const long = text.length > 1800;
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Full job description</CardTitle>
      </CardHeader>
      <CardContent>
        {!text.trim() ? (
          <p className="text-sm text-muted">The posting didn&apos;t include a description. Open the original posting to read more.</p>
        ) : (
          <>
            <div id={id} className={cn("relative max-w-[70ch] space-y-3 text-[15px] leading-relaxed text-text", long && !open && "max-h-[28rem] overflow-hidden")}>
              {blocks.map((b, i) =>
                b.type === "h" ? (
                  <h3 key={i} className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted">
                    {b.text}
                  </h3>
                ) : b.type === "ul" ? (
                  <ul key={i} className="list-disc space-y-1 pl-5 marker:text-subtle">
                    {b.items.map((it, j) => (
                      <li key={j}>{it}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i}>{b.text}</p>
                ),
              )}
              {long && !open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-surface to-transparent" aria-hidden />}
            </div>
            {long && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={id}>
                {open ? "Show less" : "Read the full description"}
                <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ company intel

export function CompanyIntelPanel({ company, companyId, companyName }: { company: Company | null; companyId: number | null; companyName: string }) {
  const research = useResearchCompany();
  const run = () =>
    companyId &&
    research.mutate(companyId, {
      onSuccess: (c) =>
        toast.success("Company research updated", {
          description: `${c.facts.length} facts collected, each labelled by how reliable it is.`,
        }),
      onError: (e) => toast.error("Couldn't research this company", { description: errorMessage(e) }),
    });
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <Eyebrow>Company intelligence</Eyebrow>
          <CardTitle className="mt-1 truncate">
            {companyId ? (
              <Link href={`/companies/${companyId}`} className="hover:text-primary">
                {companyName}
              </Link>
            ) : (
              companyName
            )}
          </CardTitle>
          {company?.researched_at && <p className="mt-0.5 text-caption text-subtle">Researched {relativeTime(company.researched_at)}</p>}
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-subtle text-muted">
          <Building2 className="size-4" aria-hidden />
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {company && (company.industry || company.size || company.headquarters) && (
          <dl className="grid grid-cols-2 gap-3">
            {company.industry && <KeyValue label="Industry">{company.industry}</KeyValue>}
            {company.size && <KeyValue label="Size">{company.size}</KeyValue>}
            {company.headquarters && <KeyValue label="Headquarters">{company.headquarters}</KeyValue>}
            {company.website && (
              <KeyValue label="Website">
                <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {hostFromUrl(company.website) ?? company.website}
                </a>
              </KeyValue>
            )}
          </dl>
        )}
        {company?.description && <p className="line-clamp-4 text-sm text-muted">{company.description}</p>}
        {company && company.facts.length > 0 ? (
          <>
            <FactLegend />
            <CompanyFactGroups facts={company.facts} limit={5} />
          </>
        ) : (
          <p className="text-sm text-muted">
            No research yet. Your agent can gather public facts — clearly labelled as verified, third-party opinion, or inferred.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {companyId && (
            <Button variant="secondary" size="sm" loading={research.isPending} onClick={run}>
              {!research.isPending && <RefreshCw />}
              {company?.researched_at ? "Refresh research" : "Research company"}
            </Button>
          )}
          {companyId && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/companies/${companyId}`}>
                Company profile <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------ sources

const APPLY_METHOD: Record<JobSource["apply_method"], string> = {
  easy_apply: "Quick apply on the site",
  ats_form: "Company application form",
  external_link: "Apply on the employer's site",
};

export function SourcePostings({ sources, merged }: { sources: JobSource[]; merged: number }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Where this job is posted</CardTitle>
          <CardDescription>
            {merged > 0
              ? `${merged} duplicate ${merged === 1 ? "posting was" : "postings were"} merged into this one record.`
              : "The original postings for this job."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {sources.length === 0 ? (
          <p className="text-sm text-muted">Added manually — no external posting linked.</p>
        ) : (
          <ul className="space-y-2">
            {sources.map((s) => {
              const href = s.url ?? s.apply_url;
              return (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.source_label}</p>
                    <p className="truncate text-caption text-subtle">
                      {APPLY_METHOD[s.apply_method]} · fetched {formatDate(s.fetched_at, { year: undefined })}
                    </p>
                  </div>
                  {href && (
                    <Button asChild size="xs" variant="ghost">
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        View posting <ExternalLink />
                        <span className="sr-only">on {s.source_label} (opens in a new tab)</span>
                      </a>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
