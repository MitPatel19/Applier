"use client";

/** Document-style rendering of structured resume content — looks like a real resume page. */

import * as React from "react";
import type { ResumeContent } from "@/lib/types";
import { cn } from "@/lib/utils";

function dateRange(start: string | null, end: string | null) {
  if (!start && !end) return null;
  return `${start ?? ""}${start || end ? " – " : ""}${end ?? "Present"}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 border-b border-border pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-soft-fg">
      {children}
    </h3>
  );
}

const DEFAULT_ORDER = ["summary", "skills", "experience", "projects", "education", "certifications"];

export function ResumeDocument({ content, className }: { content: ResumeContent; className?: string }) {
  const order = content.section_order?.length ? content.section_order : DEFAULT_ORDER;
  const sections: Record<string, React.ReactNode> = {
    summary: content.summary ? (
      <section key="summary">
        <SectionTitle>Summary</SectionTitle>
        <p className="leading-relaxed text-muted">{content.summary}</p>
      </section>
    ) : null,
    skills:
      content.skills.length > 0 ? (
        <section key="skills">
          <SectionTitle>Skills</SectionTitle>
          <dl className="space-y-1">
            {content.skills.map((g) => (
              <div key={g.category} className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-text">{g.category}:</dt>
                <dd className="text-muted">{g.items.join(", ")}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null,
    experience:
      content.experience.length > 0 ? (
        <section key="experience">
          <SectionTitle>Experience</SectionTitle>
          <div className="space-y-3.5">
            {content.experience.map((e) => (
              <article key={e.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-semibold text-text">
                    {e.position}
                    <span className="font-normal text-muted"> · {e.company}</span>
                  </p>
                  <p className="text-[11px] text-subtle">
                    {[e.location, dateRange(e.start, e.end)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {e.bullets.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted marker:text-subtle">
                    {e.bullets.map((b) => (
                      <li key={b.id}>{b.text}</li>
                    ))}
                  </ul>
                )}
                {e.technologies.length > 0 && (
                  <p className="mt-1 text-[11px] text-subtle">Tech: {e.technologies.join(", ")}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null,
    projects:
      content.projects.length > 0 ? (
        <section key="projects">
          <SectionTitle>Projects</SectionTitle>
          <div className="space-y-3">
            {content.projects.map((p) => (
              <article key={p.id}>
                <p className="font-semibold text-text">
                  {p.name}
                  {p.technologies.length > 0 && <span className="font-normal text-subtle"> · {p.technologies.join(", ")}</span>}
                </p>
                {p.description && <p className="mt-0.5 text-muted">{p.description}</p>}
                {p.bullets.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted marker:text-subtle">
                    {p.bullets.map((b) => (
                      <li key={b.id}>{b.text}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null,
    education:
      content.education.length > 0 ? (
        <section key="education">
          <SectionTitle>Education</SectionTitle>
          <div className="space-y-2">
            {content.education.map((ed) => (
              <article key={ed.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-semibold text-text">
                    {[ed.degree, ed.program].filter(Boolean).join(", ") || ed.institution}
                  </p>
                  <p className="text-[11px] text-subtle">{dateRange(ed.start, ed.end)}</p>
                </div>
                <p className="text-muted">
                  {ed.institution}
                  {ed.location ? ` · ${ed.location}` : ""}
                  {ed.gpa ? ` · GPA ${ed.gpa}` : ""}
                </p>
                {ed.details.length > 0 && <p className="text-[11px] text-subtle">{ed.details.join(" · ")}</p>}
              </article>
            ))}
          </div>
        </section>
      ) : null,
    certifications:
      content.certifications.length > 0 ? (
        <section key="certifications">
          <SectionTitle>Certifications</SectionTitle>
          <ul className="list-disc space-y-0.5 pl-4 text-muted">
            {content.certifications.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null,
  };
  const ordered = [...order, ...DEFAULT_ORDER.filter((k) => !order.includes(k))];
  const contactBits = [content.contact.email, content.contact.phone, content.contact.location].filter(Boolean) as string[];

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[816px] rounded-lg border border-border bg-surface px-6 py-8 text-[13px] shadow-pop sm:px-12 sm:py-12",
        className,
      )}
      aria-label="Resume preview"
    >
      <header className="mb-5 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text">{content.contact.name || "Your name"}</h2>
        {content.headline && <p className="mt-1 text-sm font-medium text-primary-soft-fg">{content.headline}</p>}
        {(contactBits.length > 0 || content.contact.links.length > 0) && (
          <p className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-subtle">
            {contactBits.map((c) => (
              <span key={c}>{c}</span>
            ))}
            {content.contact.links.map((l) => (
              <span key={l.url}>{l.label || l.url}</span>
            ))}
          </p>
        )}
      </header>
      <div className="space-y-5">{ordered.map((k) => sections[k] ?? null)}</div>
    </div>
  );
}
