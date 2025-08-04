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

/** False when the browser refused the write. */
function writeItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function computeSnapshot(strict: boolean = false): Settings {
  const region = readItem(REGION_KEY, strict);
  const filter = readItem(WATCH_PROVIDER_FILTER_KEY, strict);
  const providers = readItem(SELECTED_PROVIDERS_KEY, strict);
  const configured = readItem(HAS_SETTINGS_KEY, strict);

  if (strict) {
    if (region !== null && !isValidRegion(region)) {
      throw new Error("Invalid stored region");
    }
    if (filter !== null && !isWatchProviderFilter(filter)) {
      throw new Error("Invalid stored watch provider filter");
    }
    if (providers !== null && providers !== "" && providers.split(",").some((value) =>
      !/^\d+$/.test(value.trim()) ||
      !Number.isSafeInteger(Number(value)) || Number(value) <= 0,
    )) {
      throw new Error("Invalid stored provider selection");
    }
    if (configured !== null && configured !== "true" && configured !== "false") {
      throw new Error("Invalid stored settings flag");
    }
  }

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

/** Read live values for an export without changing the subscribed snapshot. */
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

/**
 * Restore the settings half of a backup file.
 *
 * A file written before a setting existed carries a null for it, and restoring a
 * null has to leave the current value alone rather than reset it – so a file
 * that names nothing is a success that wrote nothing, not a failure.
 *
 * False when the browser refused a write the file did ask for.
 */
export function applySettings(settings: {
  region: string | null;
  watchProviderFilter: WatchProviderFilter | null;
  selectedProviderIds: number[] | null;
}): boolean {
  const { region, watchProviderFilter, selectedProviderIds } = settings;

  let stored = true;

  if (region && isValidRegion(region)) {
    stored = writeItem(REGION_KEY, region) && stored;
  }
  if (watchProviderFilter) {
    stored = writeItem(WATCH_PROVIDER_FILTER_KEY, watchProviderFilter) && stored;
  }
  if (selectedProviderIds !== null) {
    stored =
      writeItem(
        SELECTED_PROVIDERS_KEY,
        providerIdsToStoredValue(sanitizeProviderIds(selectedProviderIds)),
      ) && stored;
  }

  if (region || watchProviderFilter || selectedProviderIds !== null) {
    stored = writeItem(HAS_SETTINGS_KEY, "true") && stored;
    emit();
  }

  return stored;
}
