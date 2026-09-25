"use client";

/** Authentication hooks: sign in, create account, update the current user. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SessionOut, User } from "@/lib/types";
import { qk } from "./core";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  full_name: string;
}

export interface UserUpdateInput {
  full_name?: string;
  onboarding_completed?: boolean;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginInput) => api.post<SessionOut>("/auth/login", body),
    onSuccess: (session) => {
      qc.setQueryData<User>(qk.me, session.user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterInput) => api.post<SessionOut>("/auth/register", body),
    onSuccess: (session) => {
      qc.setQueryData<User>(qk.me, session.user);
    },
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserUpdateInput) => api.patch<User>("/users/me", body),
    onSuccess: (user) => {
      qc.setQueryData<User>(qk.me, user);
    },
  });
}

/**
 * Only allow same-origin, path-relative redirect targets (prevents open redirects such as
 * `?next=//evil.example` or `?next=https://evil.example`).
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/login") || next.startsWith("/register")) return null;
  return next;
}

/** Where to send a user after they sign in. */
export function postLoginPath(user: User, next?: string | null) {
  const safe = safeNextPath(next);
  if (safe) return safe;
  return user.onboarding_completed ? "/dashboard" : "/onboarding";
}
