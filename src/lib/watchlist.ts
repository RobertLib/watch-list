"use client";

import { getLegacyProfileStorageOwner, getProfileStorageOwner, initializeProfileStorage, isProfileStorageOwnerAvailable, readProfileStore, withProfileStorage, writeProfileStore } from "./profile-storage";
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

/**
 * Where a legacy cookie the app cannot parse is kept once the list moves on.
 *
 * Such a cookie used to be the store's only copy, so every edit refused to save
 * over it and every profile switch refused to start – with nothing telling the
 * visitor that only "Clear all" would get them out. Its text is moved here
 * instead (the original owner's data, like the other bare keys), the list
 * carries on empty, and a backup names it with the text kept for recovery.
 */
export const WATCHLIST_COOKIE_RECOVERY_KEY = "watchlist-cookie-unreadable";

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
 * The legacy cookie still waiting to be read, or null. A cookie whose text was
 * already kept under `WATCHLIST_COOKIE_RECOVERY_KEY` is settled even when it
 * cannot be deleted (one set for a parent domain, say).
 */
function pendingCookieText(): string | null {
  const cookieData = readCookie(WATCHLIST_COOKIE_NAME);
  if (!cookieData) return null;
  return cookieData === window.localStorage.getItem(WATCHLIST_COOKIE_RECOVERY_KEY)
    ? null
    : cookieData;
}

function parseWatchlistCookie(cookieData: string): WatchlistItem[] {
  return sanitizeStoredWatchlist(JSON.parse(decodeURIComponent(cookieData)));
}

/**
 * Read the legacy fallback without writing. A render, export or storage-event
 * handler must not race a mutation that holds the shared browser lock.
 */
function readWatchlistCookie(): WatchlistItem[] {
  const cookieData = pendingCookieText();
  return cookieData ? parseWatchlistCookie(cookieData) : [];
}

function readableText(cookieData: string): string {
  try {
    return decodeURIComponent(cookieData);
  } catch {
    return cookieData;
  }
}

/**
 * For a backup of the original owner: the pending cookie's text when it cannot
 * be parsed, so the export keeps it rather than naming a store with no text.
 */
export function unreadableWatchlistCookieText(): string | null {
  try {
    const cookieData = pendingCookieText();
    if (!cookieData) return null;
    try {
      parseWatchlistCookie(cookieData);
      return null;
    } catch {
      return readableText(cookieData);
    }
  } catch {
    return null;
  }
}

/** For a backup of the original owner: an unreadable cookie's kept text. */
export function retiredWatchlistCookieText(): string | null {
  const kept = window.localStorage.getItem(WATCHLIST_COOKIE_RECOVERY_KEY);
  return kept === null ? null : readableText(kept);
}

/**
 * Move an unparseable legacy cookie's text into storage, so the list can carry
 * on without it. Only with the roster lock held and the original owner bound,
 * and only while no stored list has replaced the cookie.
 *
 * False when it does not apply or cannot be done: a readable cookie, a stored
 * list, another owner, or an earlier kept copy with different text (neither is
 * ever overwritten). Throws when the browser refuses the write, leaving the
 * cookie as the only copy.
 */
function retireUnreadableCookie(): boolean {
  const owner = getProfileStorageOwner();
  if (owner !== getLegacyProfileStorageOwner()) return false;
  if (readProfileStore(WATCHLIST_STORAGE_KEY, owner, true) !== null) return false;
  const cookieData = pendingCookieText();
  if (cookieData === null) return false;
  try {
    parseWatchlistCookie(cookieData);
    return false;
  } catch {
    // Unreadable: keep its text below.
  }

  const storage = window.localStorage;
  if (storage.getItem(WATCHLIST_COOKIE_RECOVERY_KEY) !== null) return false;
  // The kept text is the original owner's bare-key data; pin who that is first.
  initializeProfileStorage();
  if (!isProfileStorageOwnerAvailable(owner)) return false;
  storage.setItem(WATCHLIST_COOKIE_RECOVERY_KEY, cookieData);
  try {
    deleteCookie(WATCHLIST_COOKIE_NAME);
  } catch {
    // Its text is kept, so `pendingCookieText` already treats it as settled.
  }
  return true;
}

/** A strict read for an edit, retiring an unparseable legacy cookie first. */
function readWatchlistForEdit(): WatchlistItem[] {
  try {
    return getWatchlist({ strict: true });
  } catch (error) {
    // An unreadable *stored* list stays refused: it is still the only copy.
    if (!retireUnreadableCookie()) throw error;
    return getWatchlist({ strict: true });
  }
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
    if (pendingCookieText() === null || owner !== getLegacyProfileStorageOwner()) {
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
    if (pendingCookieText() === null) return true;
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

    // A newer stored list, including [], must never be replaced by the cookie –
    // and is the only thing read when it exists, readable or not: an unreadable
    // stored list is already a store's own problem (edits refuse, a clear
    // replaces it) and must not block switching away from it as well.
    if (readProfileStore(WATCHLIST_STORAGE_KEY, owner, true) === null) {
      let list: WatchlistItem[];
      try {
        list = readWatchlistCookie();
      } catch {
        // Unparseable: keep its text for recovery and let the list carry on.
        // A browser refusing that write throws, keeping the cookie in place.
        // An earlier kept copy with different text is not overwritten; this
        // cookie then simply stays where it is, still the original owner's.
        retireUnreadableCookie();
        return true;
      }
      if (!saveWatchlist(list)) return false;
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
    const currentWatchlist = readWatchlistForEdit();

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
    const currentWatchlist = readWatchlistForEdit();
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
    // A clear, so an unreadable list does not stop it (see writeProfileStore).
    writeProfileStore(WATCHLIST_STORAGE_KEY, "[]", owner, { clear: true });
    if (owner === getLegacyProfileStorageOwner()) {
      try {
        deleteCookie(WATCHLIST_COOKIE_NAME);
      } catch {
        // The stored empty list already prevents any further cookie migration.
      }
      try {
        // A clear replaces an unreadable store, and this was one.
        window.localStorage.removeItem(WATCHLIST_COOKIE_RECOVERY_KEY);
      } catch (error) {
        console.error("Error removing an unreadable legacy watchlist:", error);
      }
    }
    return true;
  } catch (error) {
    console.error("Error clearing watchlist:", error);
    return false;
  }
}
