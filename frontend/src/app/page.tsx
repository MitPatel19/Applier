import type { Metadata } from "next";
import { Faq } from "@/components/marketing/faq";
import { FeatureSections } from "@/components/marketing/features";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { Journey } from "@/components/marketing/journey";
import { SecuritySection } from "@/components/marketing/security-section";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

export const metadata: Metadata = {
  title: { absolute: "Applier — Your Personal AI Career Agent" },
  description:
    "Discover better opportunities, prepare smarter applications, and manage your entire job search from one place. Nothing is submitted without your approval.",
};

export default function LandingPage() {
  return (
    <div className="relative isolate min-h-dvh bg-bg">
      <div className="bg-aurora pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem]" aria-hidden />
      <SiteHeader />
      <main id="main">
        <Hero />
        <Journey />
        <FeatureSections />
        <SecuritySection />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
