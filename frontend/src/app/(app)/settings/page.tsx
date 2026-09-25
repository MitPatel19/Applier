"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/layout";
import { PanelSkeleton } from "@/components/settings/settings-shared";
import { SettingsNav, SETTINGS_TABS, isSettingsTab, tabHref, type SettingsTabId } from "@/components/settings/settings-nav";
import { SearchProfileTab } from "@/components/settings/search-tab";
import { ScoringTab } from "@/components/settings/scoring-tab";
import { FiltersTab } from "@/components/settings/filters-tab";
import { AgentTab } from "@/components/settings/agent-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { NotificationsTab } from "@/components/settings/notifications-tab";
import { TemplatesTab } from "@/components/settings/templates-tab";
import { AppearanceTab } from "@/components/settings/appearance-tab";
import { PrivacyTab } from "@/components/settings/privacy-tab";
import { AuditTab } from "@/components/settings/audit-tab";
import { DemoTab } from "@/components/settings/demo-tab";

const PANELS: Record<SettingsTabId, React.ComponentType> = {
  search: SearchProfileTab,
  scoring: ScoringTab,
  filters: FiltersTab,
  agent: AgentTab,
  integrations: IntegrationsTab,
  notifications: NotificationsTab,
  templates: TemplatesTab,
  appearance: AppearanceTab,
  privacy: PrivacyTab,
  audit: AuditTab,
  demo: DemoTab,
};

const PROVIDER_NAMES: Record<string, string> = {
  linkedin: "LinkedIn",
  indeed: "Indeed",
  gmail: "Gmail",
  outlook: "Outlook",
  google_calendar: "Google Calendar",
  microsoft_calendar: "Microsoft Calendar",
};

const OAUTH_ERRORS: Record<string, string> = {
  access_denied: "The connection was cancelled, so nothing was changed.",
  invalid_state: "The connection link expired. Please try connecting again.",
  state_mismatch: "The connection link expired. Please try connecting again.",
};

/** Shows a toast for `?connected=` / `?error=` after an OAuth redirect, then cleans the URL. */
function useOAuthResult() {
  const params = useSearchParams();
  const router = useRouter();
  const handled = React.useRef<string | null>(null);
  const connected = params.get("connected");
  const error = params.get("error");

  React.useEffect(() => {
    if (!connected && !error) return;
    const sig = `${connected}|${error}`;
    if (handled.current === sig) return;
    handled.current = sig;
    const provider = params.get("provider") ?? connected ?? "";
    const name = PROVIDER_NAMES[provider] ?? "Your account";
    if (connected && !error) {
      toast.success(`${PROVIDER_NAMES[connected] ?? "Account"} connected`, {
        description: "You can disconnect it here anytime.",
      });
    } else if (error) {
      const friendly = OAUTH_ERRORS[error] ?? (/\s/.test(error) ? error : "We couldn't complete the connection. Please try again.");
      toast.error(`${name} wasn't connected`, { description: friendly });
    }
    router.replace(tabHref("integrations"), { scroll: false });
  }, [connected, error, params, router]);
}

function SettingsContent() {
  const params = useSearchParams();
  const raw = params.get("tab");
  const active: SettingsTabId = isSettingsTab(raw) ? raw : "search";
  const label = SETTINGS_TABS.find((t) => t.id === active)?.label ?? "Settings";
  const Panel = PANELS[active];
  useOAuthResult();

  return (
    <div className="grid gap-5 lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-8">
      <SettingsNav active={active} />
      <section aria-label={label} className="min-w-0 pb-4">
        <Panel key={active} />
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Tune your job search, control what your Career Agent does, and manage your account and privacy."
      />
      <React.Suspense fallback={<PanelSkeleton cards={3} />}>
        <SettingsContent />
      </React.Suspense>
    </div>
  );
}
