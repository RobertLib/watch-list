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

function readItem(key: string): string | null {
  // Storage throws rather than returning null in a browser configured to block
  // it, and does not exist at all while the page is being prerendered.
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A visitor with storage disabled keeps the defaults for this session. There
    // is nowhere else to put the setting, and failing the click helps nobody.
  }
}

function computeSnapshot(): Settings {
  const region = readItem(REGION_KEY);
  const filter = readItem(WATCH_PROVIDER_FILTER_KEY);
  const providers = readItem(SELECTED_PROVIDERS_KEY);

  return {
    region: region && isValidRegion(region) ? region : DEFAULT_REGION,
    watchProviderFilter: isWatchProviderFilter(filter) ? filter : "all",
    selectedProviderIds: providers ? parseStoredProviderIds(providers) : [],
    hasCustomSettings: readItem(HAS_SETTINGS_KEY) === "true",
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

export function subscribeSettings(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") {
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

function markUserHasSettings(): void {
  writeItem(HAS_SETTINGS_KEY, "true");
}

export function setRegion(region: string): void {
  if (!isValidRegion(region)) {
    throw new Error(`Invalid region: ${region}`);
  }

  writeItem(REGION_KEY, region);
  markUserHasSettings();
  emit();
}

export function setWatchProviderFilter(filter: WatchProviderFilter): void {
  if (!isWatchProviderFilter(filter)) {
    throw new Error("Invalid watch provider filter");
  }

  writeItem(WATCH_PROVIDER_FILTER_KEY, filter);
  markUserHasSettings();
  emit();
}

export function setSelectedProviderIds(ids: number[]): void {
  writeItem(
    SELECTED_PROVIDERS_KEY,
    providerIdsToStoredValue(sanitizeProviderIds(ids)),
  );
  markUserHasSettings();
  emit();
}

/**
 * Restore the settings half of a backup file.
 *
 * A file written before a setting existed carries a null for it, and restoring a
 * null has to leave the current value alone rather than reset it.
 */
export function applySettings(settings: {
  region: string | null;
  watchProviderFilter: WatchProviderFilter | null;
  selectedProviderIds: number[];
}): void {
  const { region, watchProviderFilter, selectedProviderIds } = settings;

  if (region && isValidRegion(region)) writeItem(REGION_KEY, region);
  if (watchProviderFilter) {
    writeItem(WATCH_PROVIDER_FILTER_KEY, watchProviderFilter);
  }
  if (selectedProviderIds.length > 0) {
    writeItem(
      SELECTED_PROVIDERS_KEY,
      providerIdsToStoredValue(sanitizeProviderIds(selectedProviderIds)),
    );
  }

  if (region || watchProviderFilter || selectedProviderIds.length > 0) {
    markUserHasSettings();
    emit();
  }
}
