import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { BrandPanel } from "@/components/auth/brand-panel";
import { ThemeToggle } from "@/components/marketing/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="relative isolate flex min-w-0 flex-col px-4 sm:px-8">
        <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 opacity-70 lg:hidden" aria-hidden />
        <header className="flex h-16 items-center justify-between">
          <Logo />
          <ThemeToggle />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <footer className="flex flex-col items-center gap-2 pb-6 text-caption text-subtle sm:flex-row sm:justify-between">
          <p className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-success" aria-hidden />
            Encrypted · OAuth only · Nothing submitted without you
          </p>
          <nav aria-label="Legal" className="flex gap-4">
            <Link href="/security" className="hover:text-text">
              Privacy & Security
            </Link>
            <Link href="/" className="hover:text-text">
              Home
            </Link>
          </nav>
        </footer>
      </div>
      <BrandPanel className="hidden lg:flex" />
    </div>
  );
}
