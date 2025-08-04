"use client";

import { COLLECTIONS_STORAGE_KEY, notifyCollectionsChanged } from "./collections";
import { DAILY_GAME_STORAGE_KEY, notifyGameStateChanged } from "./daily-game";
import { EPISODE_PROGRESS_STORAGE_KEY } from "./episode-progress";
import { GOAL_STORAGE_KEY, notifyGoalChanged } from "./goal";
import { HIGHER_LOWER_STORAGE_KEY } from "./higher-lower";
import { RANKING_STORAGE_KEY } from "./ranking";
import { RATINGS_STORAGE_KEY, notifyRatingsChanged } from "./ratings";
import { WATCHED_STORAGE_KEY } from "./watched";
import { WATCHLIST_STORAGE_KEY, prepareWatchlistForProfileSwitch } from "./watchlist";
import { DELETED_PROFILE_PREFIX, deletedProfileKey, getLegacyProfileStorageOwner, getProfileStorageOwner, initializeProfileStorage, isProfileDeleted, isProfileStorageOwnerAvailable, PROFILE_STORAGE_OWNER_KEY, profileStoreChanges, profileStoreKey, publishProfileStorageChange, readProfileStore, resolveProfileStorageOwner, withProfileStorage } from "./profile-storage";
import { withProfileRosterLock } from "./profile-roster-lock";
import {
  applyStorageTransaction,
  type StorageTransactionResult,
} from "./storage-transaction";

/**
 * More than one person per browser.
 *
 * One television, two people, one set of recommendations quietly averaging both
 * of them into nonsense – and a "continue watching" row full of somebody else's
 * series. That is the usual reason a shared household stops trusting a tracker.
 *
 * Each store has a stable owner. A switch writes only the active-profile pointer,
 * so simultaneous switches cannot mix or delete the two people's data. Legacy
 * live keys and parked slots stay readable through `profile-storage`.
 *
 * The active pointer is still shared across tabs, so the household switches
 * together while the stored data never has to move.
 */

export const PROFILES_STORAGE_KEY = "profiles";
export const ACTIVE_PROFILE_STORAGE_KEY = "active-profile";

/** The initial profile for visitors who have never created another. */
export const DEFAULT_PROFILE_ID = "default";

export const MAX_PROFILES = 5;
export const MAX_PROFILE_NAME_LENGTH = 24;

export interface Profile {
  id: string;
  name: string;
}

export const DEFAULT_PROFILE: Profile = {
  id: DEFAULT_PROFILE_ID,
  name: "Me",
};

const listeners = new Set<() => void>();

export function notifyProfilesChanged(): void {
  publishProfileStorageChange(() => { for (const listener of listeners) listener(); });
}

/** Keep the switcher current after a restore or a change in another tab. */
export function subscribeProfiles(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === PROFILES_STORAGE_KEY ||
      event.key === ACTIVE_PROFILE_STORAGE_KEY ||
      event.key.startsWith(DELETED_PROFILE_PREFIX)
    ) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The stores a profile owns.
 *
 * Region and platform settings are deliberately not here: they describe the
 * household rather than the person – two people on one sofa are in the same
 * country, watching the same subscriptions.
 */
const OWNED_KEYS = [
  WATCHLIST_STORAGE_KEY,
  WATCHED_STORAGE_KEY,
  EPISODE_PROGRESS_STORAGE_KEY,
  RATINGS_STORAGE_KEY,
  COLLECTIONS_STORAGE_KEY,
  RANKING_STORAGE_KEY,
  DAILY_GAME_STORAGE_KEY,
  HIGHER_LOWER_STORAGE_KEY,
  // The target belongs with the watched list it is measured against. Left
  // behind, it made the stats page compare one person's goal to another
  // person's year – a number that is wrong without ever looking wrong.
  GOAL_STORAGE_KEY,
] as const;

/** Where a dormant profile's data is parked. */
function slotKey(profileId: string): string {
  return `profile-data:${profileId}`;
}

/**
 * A profile's stores, as the raw strings each store wrote.
 *
 * Exported for backup and restore, which is the one thing outside this module
 * that has any business reading a profile other than the active one. It hands
 * back raw values rather than anything structured: what a store's JSON
 * means is the store's business, not this module's.
 *
 * Strict reads distinguish a new profile's absent slot from unreadable data.
 * Backups and switches must stop on corruption rather than treating it as an
 * empty profile and discarding the only saved copy.
 */
export function readProfileSlot(
  profileId: string,
  options: { strict?: boolean } = {},
): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const slot: Record<string, string> = {};
    for (const key of OWNED_KEYS) {
      const value = readProfileStore(key, profileId, options.strict);
      if (value === null) continue;
      if (options.strict) JSON.parse(value);
      slot[key] = value;
    }

    return slot;
  } catch (error) {
    if (options.strict) throw error;
    console.error("Error reading the profile's data:", error);
    return {};
  }
}

function sanitizeName(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\p{C}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PROFILE_NAME_LENGTH);
}

export function sanitizeProfiles(input: unknown): Profile[] {
  if (!Array.isArray(input)) return [DEFAULT_PROFILE];

  const profiles: Profile[] = [];
  const seen = new Set<string>();

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.slice(0, 64) : "";
    const name = sanitizeName(record.name);

    if (!id || !name || seen.has(id)) continue;
    seen.add(id);

    profiles.push({ id, name });
    if (profiles.length >= MAX_PROFILES) break;
  }

  // There is always somebody. A stored list that repaired down to nothing means
  // the data in the live keys belongs to the default profile.
  if (!profiles.some((profile) => profile.id === DEFAULT_PROFILE_ID)) {
    profiles.unshift(DEFAULT_PROFILE);
    // Room is made rather than taken: the loop above stops at the cap, so
    // putting the default profile back on the front of a full list would return
    // one more than `MAX_PROFILES` and let the UI create past its own limit.
    // The default is the entry that cannot be dropped – it owns the live keys.
    if (profiles.length > MAX_PROFILES) profiles.length = MAX_PROFILES;
  }

  return profiles;
}

export function getProfiles(options: { strict?: boolean } = {}): Profile[] {
  if (typeof window === "undefined") return [DEFAULT_PROFILE];

  try {
    const stored = window.localStorage.getItem(PROFILES_STORAGE_KEY);
    if (stored === null || (!options.strict && !stored)) return [DEFAULT_PROFILE];

    const parsed: unknown = JSON.parse(stored);
    const profiles = sanitizeProfiles(parsed);
    if (options.strict && (
      !Array.isArray(parsed) ||
      parsed.length !== profiles.length ||
      parsed.some((entry, index) =>
        !entry || typeof entry !== "object" ||
        entry.id !== profiles[index].id ||
        entry.name !== profiles[index].name,
      )
    )) {
      throw new Error("Invalid stored profile roster");
    }
    return profiles.filter((profile) => !isProfileDeleted(profile.id));
  } catch (error) {
    if (options.strict) throw error;
    console.error("Error parsing profiles from storage:", error);
    return [DEFAULT_PROFILE];
  }
}

/**
 * Replace the roster. False when the browser refused the write.
 *
 * Creation and rename require success before publishing their changes. After a
 * deletion marker commits, rewriting the roster is only cleanup: readers already
 * exclude that owner even if this write is refused.
 */
function writeProfiles(profiles: Profile[]): boolean {
  try {
    window.localStorage.setItem(
      PROFILES_STORAGE_KEY,
      JSON.stringify(profiles.filter((profile) => !isProfileDeleted(profile.id))),
    );
    return true;
  } catch (error) {
    // Out of quota, or a private window refusing storage outright.
    console.error("Error saving profiles:", error);
    return false;
  }
}

export function getActiveProfileId(options: { strict?: boolean } = {}): string {
  if (typeof window === "undefined") return DEFAULT_PROFILE_ID;

  try {
    const stored = window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    if (options.strict && stored === "") {
      throw new Error("Invalid stored active profile");
    }
    return resolveProfileStorageOwner(stored || DEFAULT_PROFILE_ID);
  } catch (error) {
    if (options.strict) throw error;
    return DEFAULT_PROFILE_ID;
  }
}

export function getActiveProfile(): Profile {
  const id = getActiveProfileId();
  return getProfiles().find((profile) => profile.id === id) ?? DEFAULT_PROFILE;
}

export function liveProfileChanges(
  snapshot: Record<string, string>,
  profileId = getProfileStorageOwner(),
  options: { restoringProfile?: boolean } = {},
): Map<string, string | null> {
  return profileStoreChanges(OWNED_KEYS, snapshot, profileId, options);
}

/**
 * Switch profiles.
 *
 * Only the active pointer changes. Failed writes leave every profile's stores
 * intact. The roster lock keeps a queued deletion or restore from invalidating
 * the target between checking its stores and saving the pointer.
 */
export function switchProfileWithResult(
  profileId: string,
): Promise<StorageTransactionResult> {
  return withProfileRosterLock<StorageTransactionResult>(
    () => switchProfileLocked(profileId),
    { ok: false, key: PROFILES_STORAGE_KEY, rolledBack: true },
  );
}

function switchProfileLocked(
  profileId: string,
): StorageTransactionResult {
  if (typeof window === "undefined") {
    return { ok: false, key: null, rolledBack: true };
  }

  const current = getActiveProfileId();
  if (current === profileId) return { ok: false, key: null, rolledBack: true };

  const exists = getProfiles().some((profile) => profile.id === profileId);
  if (!exists) return { ok: false, key: null, rolledBack: true };

  let writingKey: string | null = PROFILE_STORAGE_OWNER_KEY;
  let pointerWritten = false;
  try {
    initializeProfileStorage();
    writingKey = WATCHLIST_STORAGE_KEY;
    if (!withProfileStorage(getLegacyProfileStorageOwner(), prepareWatchlistForProfileSwitch)) {
      return { ok: false, key: WATCHLIST_STORAGE_KEY, rolledBack: true };
    }
    writingKey = null;
    readProfileSlot(profileId, { strict: true });
    writingKey = ACTIVE_PROFILE_STORAGE_KEY;
    if (!getProfiles().some((profile) => profile.id === profileId)) {
      return { ok: false, key: PROFILES_STORAGE_KEY, rolledBack: true };
    }
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
    pointerWritten = true;
    if (!isProfileStorageOwnerAvailable(profileId)) {
      // Cooperating switches, deletes and restores hold this lock. A raw write
      // from older code can still invalidate the pointer after it was saved.
      // Publish the actual owner; restoring our old pointer could overwrite a
      // newer switch from that code, so let the UI recover instead.
      notifyProfileStoresChanged();
      return { ok: false, key: ACTIVE_PROFILE_STORAGE_KEY, rolledBack: false };
    }
  } catch (error) {
    console.error("Error switching profiles:", error);
    if (pointerWritten) notifyProfileStoresChanged();
    return { ok: false, key: writingKey, rolledBack: !pointerWritten };
  }

  notifyProfileStoresChanged();
  return { ok: true };
}

function notifyProfileStoresChanged(): void {
  notifyRatingsChanged();
  notifyCollectionsChanged();
  notifyGameStateChanged();
  notifyGoalChanged();
  notifyProfilesChanged();
}

/** Whether the switch completed; recovery-aware UI uses the detailed result. */
export async function switchProfile(profileId: string): Promise<boolean> {
  return (await switchProfileWithResult(profileId)).ok;
}

let idCounter = 0;
function newProfileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  idCounter += 1;
  return `p${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/**
 * Is this name already taken by somebody other than `exceptId`?
 *
 * A name is all the switcher shows. Two profiles called "Tom" are two
 * indistinguishable rows over two different watchlists, and picking the wrong
 * one is a switch – which parks your data under the other person's id and loads
 * theirs over yours. Compared case-insensitively because "tom" and "Tom" are the
 * same person as far as anyone reading the menu is concerned.
 */
function nameIsTaken(profiles: Profile[], clean: string, exceptId?: string): boolean {
  const wanted = clean.toLocaleLowerCase();

  return profiles.some(
    (profile) =>
      profile.id !== exceptId && profile.name.toLocaleLowerCase() === wanted,
  );
}

/**
 * Add a profile. It starts empty, and is not switched to.
 *
 * Null for a name that is blank after sanitising, one that duplicates an
 * existing profile, a roster that is already full, or a browser that refused
 * the write – a profile reported as created but not stored is one the switcher
 * offers until the next reload quietly drops it.
 */
export function createProfile(name: string): Promise<Profile | null> {
  return withProfileRosterLock(() => createProfileLocked(name), null);
}

function createProfileLocked(name: string): Profile | null {
  if (typeof window === "undefined") return null;

  const clean = sanitizeName(name);
  if (!clean) return null;

  const profiles = getProfiles({ strict: true });
  if (profiles.length >= MAX_PROFILES) return null;
  if (nameIsTaken(profiles, clean)) return null;

  // The timestamp/counter fallback belongs to one tab. Two tab-local counters
  // can produce the same id in the same millisecond even under the shared lock.
  let profile: Profile | null = null;
  for (let attempt = 0; attempt <= MAX_PROFILES; attempt++) {
    const id = newProfileId();
    if (profiles.some((existing) => existing.id === id) || isProfileDeleted(id)) continue;
    profile = { id, name: clean };
    break;
  }
  if (!profile) return null;
  if (!writeProfiles([...profiles, profile])) return null;

  notifyProfilesChanged();
  return profile;
}

/**
 * Rename a profile. False when the name is blank, belongs to someone else, or
 * the browser refused the write.
 */
export function renameProfile(profileId: string, name: string): Promise<boolean> {
  return withProfileRosterLock(() => renameProfileLocked(profileId, name), false);
}

function renameProfileLocked(profileId: string, name: string): boolean {
  if (typeof window === "undefined") return false;

  const clean = sanitizeName(name);
  if (!clean) return false;

  // `exceptId` is what lets a rename that only changes capitalisation through –
  // and what stops one profile from being renamed onto another.
  const profiles = getProfiles({ strict: true });
  if (!profiles.some((profile) => profile.id === profileId)) return false;
  if (nameIsTaken(profiles, clean, profileId)) return false;

  const stored = writeProfiles(
    profiles.map((profile) =>
      profile.id === profileId ? { ...profile, name: clean } : profile,
    ),
  );
  if (stored) notifyProfilesChanged();
  return stored;
}

/**
 * Delete a profile and everything it owns.
 *
 * The default profile always remains on the roster. The active profile cannot
 * go either – switch away first, which is what the UI does.
 *
 * A single persistent deletion marker commits before any roster or data cleanup.
 * The marker keeps a competing tab's old roster or pointer from restoring a
 * deleted owner. Obsolete active pointers resolve to the default profile.
 */
export function deleteProfile(profileId: string): Promise<boolean> {
  return withProfileRosterLock(() => deleteProfileLocked(profileId), false);
}

function deleteProfileLocked(profileId: string): boolean {
  if (typeof window === "undefined") return false;
  if (profileId === DEFAULT_PROFILE_ID) return false;
  if (profileId === getActiveProfileId()) return false;

  try {
    initializeProfileStorage();
  } catch (error) {
    console.error("Error preparing profile storage:", error);
    return false;
  }

  const profiles = getProfiles({ strict: true });
  if (!profiles.some((profile) => profile.id === profileId)) return false;
  if (profileId === getActiveProfileId()) return false;
  const removed = profiles.filter((profile) => profile.id !== profileId);
  // This atomic write is the deletion's only commit point. Shrinking the roster
  // first would orphan the profile if both the marker and roster recovery failed,
  // causing the next backup to omit data after a reported failed deletion.
  try {
    window.localStorage.setItem(deletedProfileKey(profileId), "true");
  } catch (error) {
    console.error("Error saving profile deletion:", error);
    return false;
  }

  // Readers already exclude marked owners. Cleanup cannot turn a committed
  // deletion into a failure, even if the original roster remains in storage.
  writeProfiles(removed);

  try {
    window.localStorage.removeItem(slotKey(profileId));
    for (const key of OWNED_KEYS) {
      window.localStorage.removeItem(profileStoreKey(key, profileId));
    }
  } catch (error) {
    // The committed marker keeps retained data inaccessible to late writes;
    // failed cleanup costs storage without reversing the requested deletion.
    console.error("Error removing the profile's data:", error);
  }

  notifyProfilesChanged();
  return true;
}

/**
 * Prepare changes to stable stores and the roster. Only the immutable legacy
 * owner marker is initialized here; the backup commits all data together.
 *
 * A file with no `active` is one written before backups knew about profiles. It
 * carries one set of stores and no claim about whose they are, so the roster is
 * left exactly as it was by the coordinated restore.
 */
export function profileRestoreChanges(
  active: Profile | null,
  others: { profile: Profile; slot: Record<string, string> }[],
): Map<string, string | null> | null {
  if (typeof window === "undefined" || !active) return null;

  // The roster is decided first, and it decides which slots get written.
  //
  // `sanitizeProfiles` is the one place the cap lives – and it is not only a
  // cap: it also puts the default profile back on a roster that lacks it, which
  // costs the last entry its seat just the same. It used to run on the roster
  // alone, after every slot below had been written, so a file carrying one
  // profile too many left its last slot parked under an id the roster never
  // named: a person's watchlist in storage that no switcher could reach, and a
  // profile silently missing from the restore it was promised in. Now the slot
  // writes follow the roster, and the two cannot disagree about who exists.
  const roster = sanitizeProfiles([
    active,
    ...others
      .filter(({ profile }) => profile.id !== active.id)
      .map(({ profile }) => profile),
  ]);
  const keep = new Set(roster.map((profile) => profile.id));

  // An active profile the roster would not carry has nowhere to be active.
  if (!keep.has(active.id)) return null;

  const kept = others.filter(
    ({ profile }) => profile.id !== active.id && keep.has(profile.id),
  );

  const changes = liveProfileChanges({}, active.id, { restoringProfile: true });
  for (const profile of roster) changes.set(deletedProfileKey(profile.id), null);
  // Backups replace these empty active stores with their incoming values.
  changes.set(slotKey(active.id), null);
  for (const { profile, slot } of kept) {
    for (const [key, value] of liveProfileChanges(slot, profile.id, { restoringProfile: true })) {
      changes.set(key, value);
    }
    changes.set(slotKey(profile.id), null);
  }
  if (active.id !== DEFAULT_PROFILE_ID && !kept.some(({ profile }) => profile.id === DEFAULT_PROFILE_ID)) {
    // An implicitly inserted default profile has no incoming stores. Keeping
    // its old slot would resurrect data the restore promised to replace.
    for (const [key, value] of liveProfileChanges({}, DEFAULT_PROFILE_ID, { restoringProfile: true })) {
      changes.set(key, value);
    }
    changes.set(slotKey(DEFAULT_PROFILE_ID), null);
  }
  changes.set(PROFILES_STORAGE_KEY, JSON.stringify(roster));
  changes.set(ACTIVE_PROFILE_STORAGE_KEY, active.id);
  for (const existing of getProfiles()) {
    if (keep.has(existing.id)) continue;
    changes.set(deletedProfileKey(existing.id), "true");
    changes.set(slotKey(existing.id), null);
    for (const key of OWNED_KEYS) {
      changes.set(profileStoreKey(key, existing.id), null);
    }
  }

  return changes;
}

/** Replace just the profile roster and slots, for callers with no live stores. */
export function restoreProfiles(
  active: Profile | null,
  others: { profile: Profile; slot: Record<string, string> }[],
): Promise<boolean> {
  return withProfileRosterLock(() => restoreProfilesLocked(active, others), false);
}

function restoreProfilesLocked(
  active: Profile | null,
  others: { profile: Profile; slot: Record<string, string> }[],
): boolean {
  try {
    const changes = profileRestoreChanges(active, others);
    if (!changes || !applyStorageTransaction(changes).ok) return false;
  } catch (error) {
    console.error("Error preparing profile restore:", error);
    return false;
  }

  notifyProfilesChanged();
  return true;
}
