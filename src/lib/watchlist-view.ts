"use client";

import { mediaItemKey } from "./utils";
import type { MediaType } from "@/types/tmdb";

/**
 * Sorting, filtering and grouping for the watchlist page.
 *
 * A watchlist is the one list that only ever grows, and past a couple of dozen
 * titles a flat grid stops being usable – the point of it is answering "what can
 * I watch tonight", which needs the list narrowed rather than displayed.
 */

/** A saved title reduced to what this module sorts and filters on. */
export interface WatchlistViewItem {
  id: number;
  title: string;
  mediaType: MediaType;
  posterPath: string | null;
  voteAverage: number;
  releaseDate: string;
  /** When it was saved, or watched – whichever list it came from. */
  savedAt: string;
  /** The viewer's own score out of ten, or null when they have not given one. */
  myRating: number | null;
}

export type WatchlistSort =
  | "added"
  | "title"
  | "rating"
  | "release"
  | "my-rating";
export type WatchlistTypeFilter = "all" | "movie" | "tv";
export type WatchlistGrouping = "none" | "availability";

export interface WatchlistPreferences {
  sort: WatchlistSort;
  type: WatchlistTypeFilter;
  grouping: WatchlistGrouping;
  /**
   * Show only titles the viewer has scored.
   *
   * Scores were visible as a badge and sortable, but there was no way to see
   * *just* them – and rating a title marks it watched, so they sat mixed in with
   * everything else finished. This is what turns "sorted by my rating" into
   * "the things I have rated".
   */
  ratedOnly: boolean;
}

export const DEFAULT_PREFERENCES: WatchlistPreferences = {
  // Most recently saved first: it is the closest thing to "what I meant to watch".
  sort: "added",
  type: "all",
  grouping: "none",
  ratedOnly: false,
};

export const SORT_LABELS: Record<WatchlistSort, string> = {
  added: "Recently added",
  title: "Title A–Z",
  rating: "Highest rated",
  release: "Newest release",
  "my-rating": "My rating",
};

// Re-exported so the page has one place to import its view helpers from, while
// the definition stays in a module the server side can share.
export { mediaItemKey as itemKey };

function isSort(value: unknown): value is WatchlistSort {
  return (
    value === "added" ||
    value === "title" ||
    value === "rating" ||
    value === "release" ||
    value === "my-rating"
  );
}

function isTypeFilter(value: unknown): value is WatchlistTypeFilter {
  return value === "all" || value === "movie" || value === "tv";
}

function isGrouping(value: unknown): value is WatchlistGrouping {
  return value === "none" || value === "availability";
}

export function sanitizePreferences(input: unknown): WatchlistPreferences {
  if (!input || typeof input !== "object") return DEFAULT_PREFERENCES;

  const record = input as Record<string, unknown>;

  return {
    sort: isSort(record.sort) ? record.sort : DEFAULT_PREFERENCES.sort,
    type: isTypeFilter(record.type) ? record.type : DEFAULT_PREFERENCES.type,
    grouping: isGrouping(record.grouping)
      ? record.grouping
      : DEFAULT_PREFERENCES.grouping,
    // Absent from anything stored before the filter existed, which reads as off.
    ratedOnly: record.ratedOnly === true,
  };
}

const PREFERENCES_STORAGE_KEY = "watchlist-view";
// A `storage` event fires only in *other* tabs, so this tab announces its own
// writes for the store below to notice them.
const PREFERENCES_EVENT = "watchlist-view-change";

let cachedRaw: string | null = null;
let cachedPreferences: WatchlistPreferences = DEFAULT_PREFERENCES;

/** Memoised against the raw string – `useSyncExternalStore` compares by identity. */
export function getPreferences(): WatchlistPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
  } catch {
    return DEFAULT_PREFERENCES;
  }

  if (raw === cachedRaw) return cachedPreferences;

  cachedRaw = raw;
  cachedPreferences = DEFAULT_PREFERENCES;

  if (raw) {
    try {
      cachedPreferences = sanitizePreferences(JSON.parse(raw));
    } catch (error) {
      console.error("Error reading watchlist view preferences:", error);
    }
  }

  return cachedPreferences;
}

export function getDefaultPreferences(): WatchlistPreferences {
  return DEFAULT_PREFERENCES;
}

export function savePreferences(preferences: WatchlistPreferences): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch (error) {
    // Private browsing modes can refuse writes; the change still applies to this
    // page, it just will not be remembered.
    console.error("Error saving watchlist view preferences:", error);
  }

  window.dispatchEvent(new Event(PREFERENCES_EVENT));
}

export function subscribeToPreferences(onChange: () => void): () => void {
  window.addEventListener(PREFERENCES_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(PREFERENCES_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Fold case and accents so "amelie" finds "Amélie". */
function normalise(value: string): string {
  return (
    value
      .normalize("NFD")
      // The combining-marks block, escaped rather than written literally so it
      // survives an editor that normalises the file back to NFC.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  );
}

export function filterWatchlistItems(
  items: WatchlistViewItem[],
  {
    type,
    query,
    ratedOnly = false,
  }: { type: WatchlistTypeFilter; query: string; ratedOnly?: boolean },
): WatchlistViewItem[] {
  const needle = normalise(query.trim());

  return items.filter((item) => {
    if (type !== "all" && item.mediaType !== type) return false;
    if (ratedOnly && item.myRating === null) return false;
    if (needle && !normalise(item.title).includes(needle)) return false;
    return true;
  });
}

/**
 * Sort a copy, never in place – the caller's array is React state.
 *
 * Every comparison falls back to the title, so two titles with the same rating or
 * no release date at all keep a stable order instead of shuffling between renders.
 */
export function sortWatchlistItems(
  items: WatchlistViewItem[],
  sort: WatchlistSort,
): WatchlistViewItem[] {
  const byTitle = (a: WatchlistViewItem, b: WatchlistViewItem) =>
    a.title.localeCompare(b.title, "en");

  return [...items].sort((a, b) => {
    switch (sort) {
      case "title":
        return byTitle(a, b);
      case "rating":
        return b.voteAverage - a.voteAverage || byTitle(a, b);
      case "release":
        // An empty date sorts last rather than first, which is where a plain
        // string comparison would put it.
        return (
          (b.releaseDate || "").localeCompare(a.releaseDate || "") ||
          byTitle(a, b)
        );
      case "my-rating":
        // Unrated goes last: -1 rather than 0, so a title someone deliberately
        // scored at the bottom still ranks above one they never judged.
        return (
          (b.myRating ?? -1) - (a.myRating ?? -1) || byTitle(a, b)
        );
      case "added":
      default:
        return b.savedAt.localeCompare(a.savedAt) || byTitle(a, b);
    }
  });
}

/**
 * Where a title can be watched right now.
 *
 * `unknown` is its own state rather than folded into `none`: "we have not looked"
 * and "it is nowhere" lead to very different decisions.
 */
export type AvailabilityStatus =
  | "mine"
  | "streaming"
  | "rent"
  | "none"
  | "unknown";

export interface ProviderBadge {
  id: number;
  name: string;
  logoPath: string | null;
}

export interface TitleAvailability {
  status: AvailabilityStatus;
  /** The subscription platforms carrying it, for logos. */
  providers: ProviderBadge[];
}

export interface AvailabilityGroup {
  id: AvailabilityStatus;
  label: string;
  hint?: string;
  items: WatchlistViewItem[];
}

const GROUP_ORDER: AvailabilityStatus[] = [
  "mine",
  "streaming",
  "rent",
  "none",
  "unknown",
];

function groupLabel(
  status: AvailabilityStatus,
  hasSelectedProviders: boolean,
  region: string,
): { label: string; hint?: string } {
  switch (status) {
    case "mine":
      return { label: "Ready to watch on your platforms" };
    case "streaming":
      return {
        label: hasSelectedProviders
          ? "Streaming, but not on your platforms"
          : "Streaming now",
      };
    case "rent":
      return { label: "Rent or buy only" };
    case "none":
      return {
        label: region
          ? `Not streaming in ${region}`
          : "Not streaming in your region",
      };
    case "unknown":
    default:
      return {
        label: "Not checked",
        hint: "Availability is looked up for a bounded number of titles at a time.",
      };
  }
}

/**
 * Split the list by where each title can be watched.
 *
 * This is the view the page exists for: with eighty saved titles, "four of these
 * are on Netflix right now" is the only line that helps.
 */
export function groupByAvailability(
  items: WatchlistViewItem[],
  byKey: Record<string, TitleAvailability>,
  { hasSelectedProviders, region }: { hasSelectedProviders: boolean; region: string },
): AvailabilityGroup[] {
  const buckets = new Map<AvailabilityStatus, WatchlistViewItem[]>();

  for (const item of items) {
    const status =
      byKey[mediaItemKey(item.id, item.mediaType)]?.status ?? "unknown";
    const bucket = buckets.get(status);

    if (bucket) bucket.push(item);
    else buckets.set(status, [item]);
  }

  return GROUP_ORDER.flatMap((status) => {
    const bucketItems = buckets.get(status);
    if (!bucketItems || bucketItems.length === 0) return [];

    const { label, hint } = groupLabel(status, hasSelectedProviders, region);
    return [{ id: status, label, hint, items: bucketItems }];
  });
}
