"use client";

import { getLegacyProfileStorageOwner, getProfileStorageOwner, isProfileStorageOwnerAvailable, readProfileStore, withProfileStorage, writeProfileStore } from "./profile-storage";
import { withProfileRosterLock } from "./profile-roster-lock";

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
 * Read the legacy fallback without writing. A render, export or storage-event
 * handler must not race a mutation that holds the shared browser lock.
 */
function readWatchlistCookie(): WatchlistItem[] {
  const cookieData = readCookie(WATCHLIST_COOKIE_NAME);
  if (!cookieData) return [];

  return sanitizeStoredWatchlist(JSON.parse(decodeURIComponent(cookieData)));
}

/**
 * Persist a pending cookie under the same lock as adds, clears and restores.
 * Capture its owner before waiting, then re-read storage inside the lock so a
 * newer authoritative list always wins over a stale cookie.
 */
export function migrateWatchlist(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const owner = getProfileStorageOwner();
  try {
    // Ordinary mounts have nothing to migrate. These reads change no storage,
    // so they do not need to queue behind another tab's mutations or restore.
    if (readCookie(WATCHLIST_COOKIE_NAME) === null || owner !== getLegacyProfileStorageOwner()) {
      return Promise.resolve(true);
    }
  } catch (error) {
    console.error("Error checking for a legacy watchlist cookie:", error);
    return Promise.resolve(false);
  }
  return withProfileRosterLock(
    () => withProfileStorage(owner, persistWatchlistCookie),
    false,
  );
}

/** Only called with the roster lock held and the legacy owner's storage bound. */
function persistWatchlistCookie({ ignoreRemovedOwner = false } = {}): boolean {
  if (typeof window === "undefined") return false;

  try {
    const owner = getProfileStorageOwner();
    if (owner !== getLegacyProfileStorageOwner()) return true;
    if (readCookie(WATCHLIST_COOKIE_NAME) === null) return true;
    if (!isProfileStorageOwnerAvailable(owner)) {
      if (!ignoreRemovedOwner) return false;
      // The immutable marker still belongs to this removed owner, so surviving
      // profiles cannot read its cookie. Cleanup is best effort: a browser that
      // refuses it must not prevent those profiles from switching forever.
      try {
        deleteCookie(WATCHLIST_COOKIE_NAME);
      } catch {
        // No reachable profile can fall back to the removed owner's cookie.
      }
      return true;
    }

    // Strict parsing retains malformed data for a later export or recovery.
    // A newer stored list, including [], must never be replaced by the cookie.
    const list = getWatchlist({ strict: true });
    if (readProfileStore(WATCHLIST_STORAGE_KEY, owner, true) === null && !saveWatchlist(list)) {
      return false;
    }

    deleteCookie(WATCHLIST_COOKIE_NAME);
    return readCookie(WATCHLIST_COOKIE_NAME) === null;
  } catch (error) {
    console.error("Error migrating the watchlist from its legacy cookie:", error);
    return false;
  }
}

/**
 * The profile switch already holds the roster lock. Finish the legacy owner's
 * migration synchronously inside it, preserving the only copy on refusal.
 */
export function prepareWatchlistForProfileSwitch(): boolean {
  return persistWatchlistCookie({ ignoreRemovedOwner: true });
}

/**
 * Every entry is rebuilt from the fields we understand rather than trusted as
 * parsed. Storage is hand-editable, it outlives the shape that wrote it, and it
 * is what every render reads – so one malformed record would otherwise take down
 * a page rather than simply be dropped.
 */
export function getWatchlist(options: { strict?: boolean } = {}): WatchlistItem[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = readProfileStore(WATCHLIST_STORAGE_KEY, getProfileStorageOwner(), options.strict);
    if (stored === null) {
      return getProfileStorageOwner() === getLegacyProfileStorageOwner()
        ? readWatchlistCookie()
        : [];
    }

    return sanitizeStoredWatchlist(JSON.parse(stored));
  } catch (error) {
    if (options.strict) throw error;
    console.error("Error parsing watchlist from storage:", error);
    return [];
  }
}

/** False when the browser refused the write – out of quota, or storing nothing. */
export function saveWatchlist(watchlist: WatchlistItem[]): boolean {
  if (typeof window === "undefined") return false;

  try {
    writeProfileStore(
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
): Promise<ListWriteResult> {
  const owner = getProfileStorageOwner();
  // Read only after acquiring the origin-wide lock. It also coordinates this
  // update with profile deletion and restores, which replace these stores.
  return withProfileRosterLock(
    () => withProfileStorage(owner, () => addToProfileWatchlist(item)),
    "failed" as ListWriteResult,
  );
}

/** Keep a shared-list batch together across profile deletion and restores. */
export function addManyToWatchlist(
  items: Omit<WatchlistItem, "addedAt">[],
): Promise<ListWriteResult[]> {
  const owner = getProfileStorageOwner();
  return withProfileRosterLock(
    () => withProfileStorage(owner, () => items.map(addToProfileWatchlist)),
    items.map(() => "failed" as ListWriteResult),
  );
}

function addToProfileWatchlist(item: Omit<WatchlistItem, "addedAt">): ListWriteResult {
  try {
    const currentWatchlist = getWatchlist({ strict: true });

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
): Promise<ListWriteResult> {
  const owner = getProfileStorageOwner();
  return withProfileRosterLock(
    () => withProfileStorage(owner, () => removeFromWatchlistUnderLock(id, mediaType)),
    "failed" as ListWriteResult,
  );
}

/** For compound actions already holding the roster lock and an owner scope. */
export function removeFromWatchlistUnderLock(id: number, mediaType: "movie" | "tv"): ListWriteResult {
  try {
    const currentWatchlist = getWatchlist({ strict: true });
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
export function clearWatchlist(): Promise<boolean> {
  const owner = getProfileStorageOwner();
  return withProfileRosterLock(
    () => withProfileStorage(owner, clearProfileWatchlist),
    false,
  );
}

function clearProfileWatchlist(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const owner = getProfileStorageOwner();
    // An absent value can fall back to a legacy cookie. Keep an authoritative
    // empty list even when the cookie's domain prevents its deletion here.
    writeProfileStore(WATCHLIST_STORAGE_KEY, "[]", owner);
    if (owner === getLegacyProfileStorageOwner()) {
      try {
        deleteCookie(WATCHLIST_COOKIE_NAME);
      } catch {
        // The stored empty list already prevents any further cookie migration.
      }
    }
    return true;
  } catch (error) {
    console.error("Error clearing watchlist:", error);
    return false;
  }
}
