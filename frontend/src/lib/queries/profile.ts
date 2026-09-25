"use client";

/** Professional profile queries. Key: ["profile"]. */

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Education,
  EducationIn,
  Experience,
  ExperienceIn,
  FullProfile,
  ParsedResume,
  Profile,
  ProfileIn,
  Project,
  ProjectIn,
  Skill,
  SkillIn,
  User,
} from "@/lib/types";

export const profileKeys = { all: ["profile"] as const };

function refreshDerived(qc: QueryClient) {
  // Profile changes affect matching, readiness and the dashboard completeness meter.
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["applications"] });
}

export function useProfile() {
  return useQuery({ queryKey: profileKeys.all, queryFn: () => api.get<FullProfile>("/profile") });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileIn) => api.patch<Profile>("/profile", body),
    onSuccess: (profile) => {
      qc.setQueryData<FullProfile>(profileKeys.all, (prev) => (prev ? { ...prev, profile } : prev));
      // Completeness is computed server-side — refetch to update the meter.
      qc.invalidateQueries({ queryKey: profileKeys.all });
      refreshDerived(qc);
    },
  });
}

export function useUpdateUserName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (full_name: string) => api.patch<User>("/users/me", { full_name }),
    onSuccess: (user) => {
      qc.setQueryData(["me"], user);
      qc.invalidateQueries({ queryKey: profileKeys.all });
    },
  });
}

type Collection = "educations" | "experiences" | "skills" | "projects";
interface CollectionTypes {
  educations: { in: EducationIn; out: Education };
  experiences: { in: ExperienceIn; out: Experience };
  skills: { in: SkillIn; out: Skill };
  projects: { in: ProjectIn; out: Project };
}

/** Create / update / delete for one profile collection (educations, experiences, skills, projects). */
export function useProfileCollection<C extends Collection>(collection: C) {
  const qc = useQueryClient();
  const onSuccess = () => {
    qc.invalidateQueries({ queryKey: profileKeys.all });
    refreshDerived(qc);
  };
  const create = useMutation({
    mutationFn: (body: CollectionTypes[C]["in"]) => api.post<CollectionTypes[C]["out"]>(`/profile/${collection}`, body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<CollectionTypes[C]["in"]> }) =>
      api.patch<CollectionTypes[C]["out"]>(`/profile/${collection}/${id}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/profile/${collection}/${id}`),
    onSuccess,
  });
  return { create, update, remove };
}

export function useBulkAddSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skills: SkillIn[]) => api.post<Skill[]>("/profile/skills/bulk", { skills }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profileKeys.all });
      refreshDerived(qc);
    },
  });
}

export function useImportProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { parsed: ParsedResume; overwrite_personal: boolean }) => api.post<FullProfile>("/profile/import", body),
    onSuccess: (full) => {
      qc.setQueryData(profileKeys.all, full);
      qc.invalidateQueries({ queryKey: ["me"] });
      refreshDerived(qc);
    },
  });
}
