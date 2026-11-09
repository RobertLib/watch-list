"use client";

import { withProfileRosterLock } from "./profile-roster-lock";
import {
  getLegacyProfileStorageOwner,
  isProfileStorageOwnerAvailable,
  profileStoreChanges,
  readProfileStore,
  withProfileStorage,
} from "./profile-storage";
import { applyStorageTransaction } from "./storage-transaction";

/**
 * When this profile was last here.
 *
 * One timestamp, and it buys the most valuable line on the home page: "two of
 * your shows aired since you were last here". Without it every return visit
 * opens on the same page as the last one, and there is nothing to notice.
 *
 * Recorded once per session rather than on every navigation – the useful reading
 * is "the previous visit", not "thirty seconds ago".
 *
 * It belongs to a profile, like the titles it is checked against. One stamp for
 * the whole browser let somebody who follows nothing acknowledge the interval
 * for everybody: Bob opening the home page on Friday meant Alice, back on
 * Saturday, never heard about what aired between her Monday visit and his.
 */

/** Each profile's stamp, a JSON string at that profile's stable store address. */
export const LAST_VISIT_STORAGE_KEY = "last-visited";
/**
 * The one shared stamp written before profiles had their own, as a bare ISO
 * string. Like every other legacy live key it belongs to the original owner
 * (`profile-storage-owner`), which keeps reading it until its first completed
 * visit replaces it with its own store.
 */
export const LEGACY_LAST_VISIT_STORAGE_KEY = "last-visit";

export const SESSION_MARKER_KEY = "visit-recorded";
/**
 * Where the stamp this session replaced is kept, for the second and every later
 * call. Empty when there was none – a first visit stays a first visit for the
 * whole session, not just for its first page.
 */
export const PREVIOUS_VISIT_SESSION_KEY = "visit-previous";
export const VISIT_STARTED_SESSION_KEY = "visit-started";

/**
 * Session keys are per profile too. A switch reloads into the same session, and
 * a shared cache handed the next person the interval captured for the previous
 * one – and kept it for the rest of the session.
 */
export function visitSessionKey(key: string, profileId: string): string {
  return `${key}:${encodeURIComponent(profileId)}`;
}

export interface Visit {
  /** Whose interval this is; completion writes only this profile's stamp. */
  profileId: string;
  previous: string | null;
  startedAt: string;
}

/** Below this, "since your last visit" means nothing anyone cares about. */
const MIN_GAP_HOURS = 6;

/** A stored or backed-up stamp, or null when it is not a usable date. */
export function sanitizeLastVisit(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function parseStoredStamp(raw: string): string | null {
  try {
    return sanitizeLastVisit(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * The profile's stamp, or null for a first visit.
 *
 * An unusable stamp reads as absent, as it always has: it is a baseline rather
 * than anything a person saved, and treating it as a first visit only means no
 * interval is shown until the next one. A refused read throws, so completion
 * cannot mistake a blocked storage for a first visit and overwrite a baseline
 * that was never checked.
 */
export function readLastVisit(profileId: string): string | null {
  const raw = readProfileStore(LAST_VISIT_STORAGE_KEY, profileId);
  if (raw !== null) return parseStoredStamp(raw);
  if (profileId !== getLegacyProfileStorageOwner()) return null;

  return sanitizeLastVisit(window.localStorage.getItem(LEGACY_LAST_VISIT_STORAGE_KEY));
}

/**
 * Capture this session's interval without acknowledging unseen releases.
 * Completion is separate so a failed lookup can be retried on the next visit.
 */
export function beginVisit(profileId: string, now: Date = new Date()): Visit {
  const startedAt = now.toISOString();
  if (typeof window === "undefined") return { profileId, previous: null, startedAt };

  let previous: string | null = null;
  try {
    previous = readLastVisit(profileId);
  } catch {
    // Unreadable now; completion re-reads under the lock before writing.
  }

  const marker = visitSessionKey(SESSION_MARKER_KEY, profileId);
  const stashedPrevious = visitSessionKey(PREVIOUS_VISIT_SESSION_KEY, profileId);
  const stashedStart = visitSessionKey(VISIT_STARTED_SESSION_KEY, profileId);
  try {
    if (window.sessionStorage.getItem(marker)) {
      previous = readStashedVisit(stashedPrevious);
      const storedStart = window.sessionStorage.getItem(stashedStart);
      if (storedStart && !Number.isNaN(Date.parse(storedStart))) {
        return { profileId, previous, startedAt: storedStart };
      }
    }
  } catch {
    // The returned descriptor still preserves the interval for this mount.
  }

  try {
    window.sessionStorage.setItem(stashedPrevious, previous ?? "");
    window.sessionStorage.setItem(stashedStart, startedAt);
    window.sessionStorage.setItem(marker, "1");
  } catch {
    // A refused session write must not advance the persistent interval either.
  }

  return { profileId, previous, startedAt };
}

/**
 * Acknowledge a successfully checked interval, once and in order across tabs,
 * for the profile it was captured for.
 */
export function completeVisit(
  visit: Visit,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  return withProfileRosterLock(() => withProfileStorage(visit.profileId, () => {
    if (!isCurrent() || Number.isNaN(Date.parse(visit.startedAt))) return false;
    const stored = readLastVisit(visit.profileId);
    if (stored && Date.parse(stored) >= Date.parse(visit.startedAt)) return true;
    // A temporarily refused read can resemble a first visit. If an older
    // baseline is now readable, it was never checked and must remain intact.
    if (visit.previous === null && stored) return false;

    // Written through the profile's own store transaction rather than
    // `writeProfileStore`, whose strict read would refuse to replace an
    // unusable stamp forever: nothing here derives from it beyond "is there a
    // newer one", and an unusable baseline already read as a first visit.
    const changes = profileStoreChanges(
      [LAST_VISIT_STORAGE_KEY],
      { [LAST_VISIT_STORAGE_KEY]: JSON.stringify(visit.startedAt) },
      visit.profileId,
    );
    // The shared legacy stamp goes in the same transaction: once its owner has
    // a stamp of its own, the old one must not resurface after a later clear.
    if (visit.profileId === getLegacyProfileStorageOwner()) {
      changes.set(LEGACY_LAST_VISIT_STORAGE_KEY, null);
    }
    return applyStorageTransaction(changes, {
      validationKey: "profiles",
      validate: () => {
        if (!isProfileStorageOwnerAvailable(visit.profileId)) {
          throw new Error("This profile was removed while saving");
        }
      },
    }).ok;
  }), false);
}

/** The stamp the first call of this session saw, or null when there was none. */
function readStashedVisit(key: string): string | null {
  try {
    const stashed = window.sessionStorage.getItem(key);
    if (!stashed || Number.isNaN(Date.parse(stashed))) return null;

    return stashed;
  } catch {
    return null;
  }
}

/** Whether a gap is worth remarking on. */
export function isGapWorthShowing(
  previous: string | null,
  now: Date = new Date(),
): boolean {
  if (!previous) return false;

  const parsed = Date.parse(previous);
  if (Number.isNaN(parsed)) return false;

  return now.getTime() - parsed >= MIN_GAP_HOURS * 3_600_000;
}

/** "yesterday", "3 days ago" – the phrasing a person would use. */
export function describeGap(previous: string, now: Date = new Date()): string {
  const days = Math.floor(
    (now.getTime() - Date.parse(previous)) / 86_400_000,
  );

  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;

  return `${Math.round(days / 30)} months ago`;
}
