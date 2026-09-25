import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "@/components/auth/auth-common";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create your Applier account and meet your personal AI career agent.",
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthFormSkeleton fields={3} />}>
      <RegisterForm />
    </Suspense>
  );
}
