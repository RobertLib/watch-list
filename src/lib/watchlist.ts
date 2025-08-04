"use client";

import {
  sanitizeStoredWatchlist,
  type ListWriteResult,
} from "./media-list";

export interface WatchlistItem {
  id: number;
  title: string;
  mediaType: "movie" | "tv";
  posterPath: string | null;
  voteAverage: number;
  releaseDate: string;
  addedAt: string;
}

// Kept in localStorage rather than a cookie, for the same reason as the watched
// list. A cookie caps out at ~4KB, which a watchlist reaches after roughly a
// dozen titles – and a browser rejects an oversized cookie silently, so every
// further save would look like it worked while nothing was stored.
export const WATCHLIST_STORAGE_KEY = "watchlist";

// Where the list used to live. Read once so existing visitors keep their titles.
const WATCHLIST_COOKIE_NAME = "watchlist";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(";").shift() || null;
  }
  return null;
}

function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;

  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
}

/**
 * Pull a pre-existing cookie watchlist into localStorage, once. Runs only while
 * localStorage holds nothing yet, so a list the user emptied on purpose is never
 * repopulated from the stale cookie.
 */
function migrateFromCookie(): WatchlistItem[] {
  const cookieData = readCookie(WATCHLIST_COOKIE_NAME);
  if (!cookieData) return [];

  let migrated: WatchlistItem[] = [];
  try {
    migrated = sanitizeStoredWatchlist(
      JSON.parse(decodeURIComponent(cookieData)),
    );
  } catch (error) {
    console.error("Error parsing watchlist from cookie:", error);
  }

  if (migrated.length > 0) {
    saveWatchlist(migrated);
  }

  // The cookie rode along on every single request; it has no reason to persist.
  deleteCookie(WATCHLIST_COOKIE_NAME);

  return migrated;
}

/**
 * Every entry is rebuilt from the fields we understand rather than trusted as
 * parsed. Storage is hand-editable, it outlives the shape that wrote it, and it
 * is what every render reads – so one malformed record would otherwise take down
 * a page rather than simply be dropped.
 */
export function getWatchlist(): WatchlistItem[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (stored === null) return migrateFromCookie();

    return sanitizeStoredWatchlist(JSON.parse(stored));
  } catch (error) {
    console.error("Error parsing watchlist from storage:", error);
    return [];
  }
}

/** False when the browser refused the write – out of quota, or storing nothing. */
export function saveWatchlist(watchlist: WatchlistItem[]): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify(watchlist),
    );
    return true;
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving watchlist to storage:", error);
    return false;
  }
}

export function addToWatchlist(
  item: Omit<WatchlistItem, "addedAt">,
): ListWriteResult {
  try {
    const currentWatchlist = getWatchlist();

    // Check if item already exists
    const exists = currentWatchlist.some(
      (existing) =>
        existing.id === item.id && existing.mediaType === item.mediaType,
    );

    if (exists) return "duplicate";

    const newItem: WatchlistItem = {
      ...item,
      addedAt: new Date().toISOString(),
    };

    return saveWatchlist([newItem, ...currentWatchlist]) ? "ok" : "failed";
  } catch (error) {
    console.error("Error adding to watchlist:", error);
    return "failed";
  }
}

export function removeFromWatchlist(
  id: number,
  mediaType: "movie" | "tv",
): ListWriteResult {
  try {
    const currentWatchlist = getWatchlist();
    const updatedWatchlist = currentWatchlist.filter(
      (item) => !(item.id === id && item.mediaType === mediaType),
    );

    return saveWatchlist(updatedWatchlist) ? "ok" : "failed";
  } catch (error) {
    console.error("Error removing from watchlist:", error);
    return "failed";
  }
}

export function isInWatchlist(id: number, mediaType: "movie" | "tv"): boolean {
  try {
    const watchlist = getWatchlist();
    return watchlist.some(
      (item) => item.id === id && item.mediaType === mediaType,
    );
  } catch (error) {
    console.error("Error checking watchlist:", error);
    return false;
  }
}

/**
 * Empty the list in one write.
 *
 * Returns false when the browser refused, for the same reason `saveWatchlist`
 * does: a caller that clears the screen on the strength of a write that never
 * happened is showing an empty list the next reload will contradict.
 */
export function clearWatchlist(): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.removeItem(WATCHLIST_STORAGE_KEY);
    deleteCookie(WATCHLIST_COOKIE_NAME);
    return true;
  } catch (error) {
    console.error("Error clearing watchlist:", error);
    return false;
  }
}
