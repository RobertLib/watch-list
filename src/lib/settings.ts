/**
 * Profile settings, in the browser.
 *
 * These three values – region, whether to show only subscribed platforms, and
 * which platforms those are – used to live in httpOnly cookies so the server
 * could read them while rendering. Nothing renders on a server any more: the
 * app is a static export that talks to TMDB directly from the page, so the
 * settings live in `localStorage` and every reader is a Client Component.
 *
 * The store is deliberately tiny and framework-free. `tmdbApi` needs the region
 * synchronously, from module scope, in the middle of building a URL – a React
 * context could not serve that. Components that need to *re-render* when a
 * setting changes subscribe through `useSettings()`, which wraps this in
 * `useSyncExternalStore`.
 */

import { isValidRegion } from "./region";
import { applyStorageTransaction } from "./storage-transaction";
import {
  isWatchProviderFilter,
  parseStoredProviderIds,
  providerIdsToStoredValue,
  sanitizeProviderIds,
  type WatchProviderFilter,
} from "./watch-provider-settings";

export const REGION_KEY = "tmdb-region";
export const WATCH_PROVIDER_FILTER_KEY = "watch-provider-filter";
export const SELECTED_PROVIDERS_KEY = "selected-watch-providers";
export const HAS_SETTINGS_KEY = "user-has-settings";

export const DEFAULT_REGION = "US";

export interface Settings {
  region: string;
  watchProviderFilter: WatchProviderFilter;
  selectedProviderIds: number[];
  /** Whether the visitor has ever touched any of the above. */
  hasCustomSettings: boolean;
}

/**
 * What a render that has no storage sees: the prerendered HTML, and the first
 * client render that has to match it. Every reader treats this as "not
 * configured", so the pass after hydration is the one that applies the visitor's
 * real settings.
 */
export const DEFAULT_SETTINGS: Settings = {
  region: DEFAULT_REGION,
  watchProviderFilter: "all",
  selectedProviderIds: [],
  hasCustomSettings: false,
};

function readItem(key: string, strict: boolean = false): string | null {
  // Storage throws rather than returning null in a browser configured to block
  // it, and does not exist at all while the page is being prerendered.
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}

/**
 * One stored setting, checked: its value when the stored text is valid or
 * absent, and otherwise the text exactly as found – null when the browser
 * refused the read.
 */
export type StoredSetting<T> =
  | { readable: true; value: T }
  | { readable: false; raw: string | null };

export interface StoredSettingsInspection {
  region: StoredSetting<string>;
  watchProviderFilter: StoredSetting<WatchProviderFilter>;
  selectedProviderIds: StoredSetting<number[]>;
  hasCustomSettings: StoredSetting<boolean>;
}

function inspectItem<T>(
  key: string,
  parse: (stored: string | null) => T | undefined,
): StoredSetting<T> {
  let stored: string | null;
  try {
    stored = readItem(key, true);
  } catch {
    return { readable: false, raw: null };
  }
  const value = parse(stored);
  return value === undefined ? { readable: false, raw: stored } : { readable: true, value };
}

/**
 * Every setting checked on its own, so one invalid value can be named and left
 * out of a backup instead of costing the visitor the whole file.
 */
export function inspectStoredSettings(): StoredSettingsInspection {
  return {
    region: inspectItem(REGION_KEY, (stored) =>
      stored === null ? DEFAULT_REGION : isValidRegion(stored) ? stored : undefined),
    watchProviderFilter: inspectItem(WATCH_PROVIDER_FILTER_KEY, (stored) =>
      stored === null ? "all" : isWatchProviderFilter(stored) ? stored : undefined),
    selectedProviderIds: inspectItem(SELECTED_PROVIDERS_KEY, (stored) => {
      if (stored === null || stored === "") return [];
      return stored.split(",").some((value) =>
        !/^\d+$/.test(value.trim()) ||
        !Number.isSafeInteger(Number(value)) || Number(value) <= 0,
      ) ? undefined : parseStoredProviderIds(stored);
    }),
    hasCustomSettings: inspectItem(HAS_SETTINGS_KEY, (stored) =>
      stored === null ? false : stored === "true" ? true : stored === "false" ? false : undefined),
  };
}

function settingValue<T>(name: string, setting: StoredSetting<T>): T {
  if (!setting.readable) throw new Error(`Invalid stored setting: ${name}`);
  return setting.value;
}

function computeSnapshot(strict: boolean = false): Settings {
  if (strict) {
    const inspected = inspectStoredSettings();
    return {
      region: settingValue("region", inspected.region),
      watchProviderFilter: settingValue("watchProviderFilter", inspected.watchProviderFilter),
      selectedProviderIds: settingValue("selectedProviderIds", inspected.selectedProviderIds),
      hasCustomSettings: settingValue("hasCustomSettings", inspected.hasCustomSettings),
    };
  }

  const region = readItem(REGION_KEY);
  const filter = readItem(WATCH_PROVIDER_FILTER_KEY);
  const providers = readItem(SELECTED_PROVIDERS_KEY);
  const configured = readItem(HAS_SETTINGS_KEY);

  return {
    region: region && isValidRegion(region) ? region : DEFAULT_REGION,
    watchProviderFilter: isWatchProviderFilter(filter) ? filter : "all",
    selectedProviderIds: providers ? parseStoredProviderIds(providers) : [],
    hasCustomSettings: configured === "true",
  };
}

// `useSyncExternalStore` compares snapshots by identity and re-renders forever if
// a fresh object comes back every time it asks, so the snapshot is rebuilt only
// when something has actually changed.
let snapshot: Settings | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  snapshot = computeSnapshot();
  for (const listener of listeners) listener();
}

/** Re-read after a coordinated restore has committed all its storage writes. */
export function refreshSettings(): void {
  emit();
}

export function subscribeSettings(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") {
    // There may have been no settings consumers while another tab wrote. Read
    // those changes before React checks the snapshot after subscribing again.
    const current = computeSnapshot();
    if (
      snapshot === null ||
      snapshot.region !== current.region ||
      snapshot.watchProviderFilter !== current.watchProviderFilter ||
      snapshot.hasCustomSettings !== current.hasCustomSettings ||
      snapshot.selectedProviderIds.length !== current.selectedProviderIds.length ||
      snapshot.selectedProviderIds.some((id, index) => id !== current.selectedProviderIds[index])
    ) {
      snapshot = current;
    }
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

// A second tab changing a setting should not leave this one showing the old
// region until it is reloaded.
function onStorage(event: StorageEvent): void {
  if (
    event.key === null ||
    event.key === REGION_KEY ||
    event.key === WATCH_PROVIDER_FILTER_KEY ||
    event.key === SELECTED_PROVIDERS_KEY ||
    event.key === HAS_SETTINGS_KEY
  ) {
    emit();
  }
}

export function getSettings(): Settings {
  if (snapshot === null) snapshot = computeSnapshot();
  return snapshot;
}

/**
 * Read live values without changing the subscribed snapshot. A strict read
 * throws on any invalid stored setting, so an edit never starts from a default
 * that merely stands in for it; an export uses `inspectStoredSettings` instead.
 */
export function readStoredSettings(options: { strict?: boolean } = {}): Settings {
  return computeSnapshot(options.strict);
}

/** The snapshot for the prerender and for hydration – always the defaults. */
export function getServerSettings(): Settings {
  return DEFAULT_SETTINGS;
}

export function getRegion(): string {
  return getSettings().region;
}

export function getWatchProviderFilter(): WatchProviderFilter {
  return getSettings().watchProviderFilter;
}

export function getSelectedProviderIds(): number[] {
  return getSettings().selectedProviderIds;
}

/** The saved platforms as TMDB wants them in `with_watch_providers`. */
export function getSelectedProviderIdsString(): string {
  return getSelectedProviderIds().join("|");
}

/**
 * Whether this visitor has ever configured anything.
 *
 * Takes the snapshot rather than reading the store, so a component can ask it
 * about the same snapshot it is rendering – asking the store directly during
 * hydration would answer about storage the prerendered HTML knew nothing about.
 */
export function isCustomised(settings: Settings): boolean {
  return (
    settings.hasCustomSettings ||
    settings.region !== DEFAULT_REGION ||
    settings.watchProviderFilter === "streaming-only"
  );
}

function saveSetting(key: string, value: string): boolean {
  const result = applyStorageTransaction(
    new Map([
      [key, value],
      [HAS_SETTINGS_KEY, "true"],
    ]),
  );
  if (!result.ok && result.rolledBack) return false;

  emit();
  return result.ok;
}

/** False when the browser refused to save the setting and its configured flag. */
export function setRegion(region: string): boolean {
  if (!isValidRegion(region)) {
    throw new Error(`Invalid region: ${region}`);
  }

  return saveSetting(REGION_KEY, region);
}

export function setWatchProviderFilter(filter: WatchProviderFilter): boolean {
  if (!isWatchProviderFilter(filter)) {
    throw new Error("Invalid watch provider filter");
  }

  return saveSetting(WATCH_PROVIDER_FILTER_KEY, filter);
}

export function setSelectedProviderIds(ids: number[]): boolean {
  return saveSetting(
    SELECTED_PROVIDERS_KEY,
    providerIdsToStoredValue(sanitizeProviderIds(ids)),
  );
}
