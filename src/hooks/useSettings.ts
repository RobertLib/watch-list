"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  getServerSettings,
  getSettings,
  readStoredSettings,
  refreshSettings,
  setRegion,
  setSelectedProviderIds,
  setWatchProviderFilter,
  subscribeSettings,
  type Settings,
} from "@/lib/settings";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";
import type { WatchProviderFilter } from "@/lib/watch-provider-settings";

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

/** Settings writes participate in the same complete snapshot as backup and restore. */
export function useSettingsActions() {
  return useMemo(() => ({
    setRegion: (region: string) =>
      withProfileRosterLock(() => setRegion(region), false),
    setWatchProviderFilter: (filter: WatchProviderFilter) =>
      withProfileRosterLock(() => setWatchProviderFilter(filter), false),
    setSelectedProviderIds: (ids: number[]) => {
      const selected = [...ids];
      return withProfileRosterLock(() => setSelectedProviderIds(selected), false);
    },
    updateSelectedProviderIds: (
      update: (current: number[]) => number[],
      expectedRegion?: string,
    ) => withProfileRosterLock(() => {
      const current = readStoredSettings({ strict: true });
      // An earlier region's catalogue or displayed choice must not change a
      // restored selection after waiting for that restore or a region change.
      if (expectedRegion !== undefined && current.region !== expectedRegion) {
        refreshSettings();
        return true;
      }
      const next = update(current.selectedProviderIds);
      if (next.length === current.selectedProviderIds.length &&
          next.every((id, index) => id === current.selectedProviderIds[index])) {
        refreshSettings();
        return true;
      }
      return setSelectedProviderIds(next);
    }, false),
  }), []);
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
