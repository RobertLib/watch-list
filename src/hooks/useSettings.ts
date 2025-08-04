"use client";

import { useSyncExternalStore } from "react";
import {
  getServerSettings,
  getSettings,
  subscribeSettings,
  type Settings,
} from "@/lib/settings";

/**
 * The visitor's region and streaming platforms, as React state.
 *
 * `useSyncExternalStore` rather than a context because the store has to be
 * readable from module scope too – `tmdbApi` builds a URL with the region in it
 * long before any component asks. The third argument is what the prerendered
 * HTML contains, so the first client render matches it and the settings arrive
 * on the pass after hydration.
 */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, getServerSettings);
}

/**
 * The settings, flattened into a string.
 *
 * Every listing in the app is a function of these three values, so this is what
 * a data-loading effect depends on: change the region or the platform filter and
 * the key changes, which is what makes every carousel and grid reload itself.
 */
export function useSettingsKey(): string {
  const { region, watchProviderFilter, selectedProviderIds } = useSettings();
  return `${region}|${watchProviderFilter}|${selectedProviderIds.join(",")}`;
}
