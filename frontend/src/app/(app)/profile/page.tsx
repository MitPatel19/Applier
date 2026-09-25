"use client";

import * as React from "react";
import { FileInput, ShieldCheck } from "lucide-react";
import { useProfile } from "@/lib/queries/profile";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton, SkeletonCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/layout";
import { CompletenessCard } from "@/components/profile/completeness-card";
import { EducationSection, ExperienceSection, ProjectsSection } from "@/components/profile/collection-sections";
import { ImportFromResumeDialog } from "@/components/profile/import-dialog";
import { AuthorizationSection, PersonalSection, ProfessionalSection } from "@/components/profile/info-sections";
import { SkillsSection } from "@/components/profile/skills-section";
import { scrollToSection } from "@/components/apply/bits";

const SECTIONS = [
  { id: "personal", label: "Personal" },
  { id: "professional", label: "Professional" },
  { id: "authorization", label: "Work authorization" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "projects", label: "Projects" },
];

export default function ProfilePage() {
  const { data, isLoading, error, refetch } = useProfile();
  const [importOpen, setImportOpen] = React.useState(false);

  const header = (
    <PageHeader
      title="Your Profile"
      description="The single source of truth for every resume, cover letter and application answer. Applier never claims anything that isn't here."
      actions={
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          <FileInput /> Import from resume
        </Button>
      }
    />
  );

  if (isLoading) {
    return (
      <div>
        {header}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" role="status" aria-label="Loading profile">
          <div className="space-y-6">
            <SkeletonCard lines={6} />
            <SkeletonCard lines={5} />
            <SkeletonCard lines={4} />
          </div>
          <Skeleton className="hidden h-80 rounded-xl lg:block" />
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div>
        {header}
        <ErrorState error={error} title="We couldn't load your profile" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 min-w-0 space-y-6 lg:order-1">
          <PersonalSection full={data} />
          <ProfessionalSection profile={data.profile} />
          <AuthorizationSection profile={data.profile} />
          <ExperienceSection items={data.experiences} />
          <EducationSection items={data.educations} />
          <SkillsSection skills={data.skills} />
          <ProjectsSection items={data.projects} />
        </div>
        <aside className="order-1 lg:order-2" aria-label="Profile overview">
          <div className="space-y-4 lg:sticky lg:top-24">
            <CompletenessCard completeness={data.completeness} />
            <nav aria-label="Profile sections" className="hidden rounded-xl border border-border bg-surface p-2 shadow-card lg:block">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSection(s.id)}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-muted transition-colors hover:bg-bg-subtle hover:text-text"
                >
                  {s.label}
                </button>
              ))}
            </nav>
            <p className="flex items-start gap-2 px-1 text-caption text-subtle">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
              Private to you. Only shared in applications you explicitly approve.
            </p>
          </div>
        </aside>
      </div>
      <ImportFromResumeDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
