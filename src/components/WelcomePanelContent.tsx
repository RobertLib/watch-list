"use client";

import { WelcomePanel } from "@/components/WelcomePanel";
import { useHydrated } from "@/hooks/useHydrated";
import { useSettings } from "@/hooks/useSettings";
import { isCustomised } from "@/lib/settings";

/**
 * The first-run panel, which only a visitor who has configured nothing sees.
 *
 * Whether that is true is a fact about local storage, so it cannot be known
 * until the page is hydrated. Rendering nothing until then is the point: the
 * alternative shows the welcome panel to every returning visitor for a frame.
 */
export function WelcomePanelContent() {
  const settings = useSettings();
  const hydrated = useHydrated();

  if (!hydrated || isCustomised(settings)) return null;

  return <WelcomePanel hasUserSettings={false} />;
}
