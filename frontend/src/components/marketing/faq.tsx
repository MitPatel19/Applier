"use client";

import * as React from "react";
import { Accordion } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { MarketingSection, SectionHeading } from "./section";

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Will Applier apply to jobs without asking me?",
    a: "No. Automatic submission is permanently disabled. Applier prepares everything — resume, cover letter, answers — and then waits. An application only goes out after you review the final preview and confirm it yourself.",
  },
  {
    q: "Could the AI make up experience or skills on my resume?",
    a: "No. Suggestions are limited to reordering, emphasizing and rewording facts already in your profile. Every change is shown with a before/after and a reason, and you accept or reject each one individually.",
  },
  {
    q: "Which job sites does it search?",
    a: "LinkedIn, Indeed and employer career pages (including common applicant tracking systems). Duplicate postings across sources are merged into one record so you only review each job once.",
  },
  {
    q: "Do I have to give you my LinkedIn or email password?",
    a: "Never. Connections use OAuth, the standard “Sign in with…” flow, so we never see or store your passwords. You can disconnect any account at any time and its tokens are deleted.",
  },
  {
    q: "What does email access do, and is it required?",
    a: "It's optional. With read-only access, Applier can notice replies from employers — interview invitations or rejections — and update your pipeline. It never sends email on your behalf.",
  },
  {
    q: "How is the match score calculated?",
    a: "Each job is scored across technical skills, experience, education, location, salary and more. You see every category's score with the specific reasons behind it, and you can adjust how much each category counts.",
  },
  {
    q: "Can I export or delete my data?",
    a: "Yes. You can download everything we store about you as a single file, or permanently delete your account and all associated data — including uploaded resumes — from Settings.",
  },
];

export function Faq() {
  return (
    <MarketingSection id="faq" labelledBy="faq-title" className="border-t border-border bg-surface/50">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <SectionHeading
          id="faq-title"
          eyebrow="FAQ"
          title="Questions, answered honestly"
          description="Still curious? Our security overview goes deeper on how your data is handled."
        />
        <Accordion.Root type="single" collapsible className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
          {FAQS.map((f, i) => (
            <Accordion.Item key={f.q} value={`item-${i}`} className="group">
              <Accordion.Header asChild>
                <h3>
                  <Accordion.Trigger className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-text transition-colors hover:text-primary focus-visible:rounded-xl">
                    {f.q}
                    <ChevronDown
                      className="size-4 shrink-0 text-subtle transition-transform duration-200 group-data-[state=open]:rotate-180"
                      aria-hidden
                    />
                  </Accordion.Trigger>
                </h3>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=open]:animate-fade-in">
                <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{f.a}</p>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </MarketingSection>
  );
}
