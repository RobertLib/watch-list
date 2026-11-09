"use client";

import { COLLECTIONS_STORAGE_KEY, notifyCollectionsChanged } from "./collections";
import { DAILY_GAME_STORAGE_KEY, notifyGameStateChanged } from "./daily-game";
import { EPISODE_PROGRESS_STORAGE_KEY } from "./episode-progress";
import { GOAL_STORAGE_KEY, notifyGoalChanged } from "./goal";
import { HIGHER_LOWER_STORAGE_KEY } from "./higher-lower";
import { LAST_VISIT_STORAGE_KEY, LEGACY_LAST_VISIT_STORAGE_KEY } from "./last-visit";
import { RANKING_STORAGE_KEY } from "./ranking";
import { RATINGS_STORAGE_KEY, notifyRatingsChanged } from "./ratings";
import { WATCHED_STORAGE_KEY } from "./watched";
import { WATCHLIST_COOKIE_RECOVERY_KEY, WATCHLIST_STORAGE_KEY, prepareWatchlistForProfileSwitch } from "./watchlist";
import { DEFAULT_PROFILE, DELETED_PROFILE_PREFIX, deletedProfileKey, getLegacyProfileStorageOwner, getProfileStorageOwner, initializeProfileStorage, initializeProfileStorageAfterRelease, initializeProfileStorageForRelease, inspectProfileStore, isProfileDeleted, isProfileStorageOwnerAvailable, MAX_PROFILES, PROFILE_STORAGE_OWNER_KEY, profileIdsInStorage, profileStoreChanges, profileStoreKey, publishProfileStorageChange, resolveProfileStorageOwner, sanitizeProfileId, sanitizeProfileName, sanitizeProfiles, withProfileStorage, type Profile } from "./profile-storage";
import { withProfileRosterLock } from "./profile-roster-lock";
import type { StorageTransactionResult } from "./storage-transaction";

// The roster's shape and its one normalizer live with the storage ownership
// that has to agree with them; this is still where callers find them.
export { DEFAULT_PROFILE, MAX_PROFILE_NAME_LENGTH, MAX_PROFILES, sanitizeProfiles, type Profile } from "./profile-storage";

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
export const DEFAULT_PROFILE_ID = DEFAULT_PROFILE.id;

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
  // "Since you were last here" is checked against this person's followed
  // titles, so the interval it acknowledges has to be this person's too.
  LAST_VISIT_STORAGE_KEY,
] as const;

/** Where a dormant profile's data is parked. */
function slotKey(profileId: string): string {
  return `profile-data:${profileId}`;
}

/**
 * Storage a profile owns outside its stable store addresses: the shared
 * last-visit stamp written before profiles had their own, and the kept text of
 * an unreadable legacy watchlist cookie, belong to the original owner, like the
 * other legacy live keys. Restores and deletions replace them with the rest of
 * that owner's data.
 */
function legacyOwnedKeys(profileId: string): string[] {
  return profileId === getLegacyProfileStorageOwner()
    ? [LEGACY_LAST_VISIT_STORAGE_KEY, WATCHLIST_COOKIE_RECOVERY_KEY]
    : [];
}

/** Whether the original owner's bare keys hold anything. */
function legacyOwnerHasData(): boolean {
  const storage = window.localStorage;
  return [...OWNED_KEYS, LEGACY_LAST_VISIT_STORAGE_KEY, WATCHLIST_COOKIE_RECOVERY_KEY]
    .some((key) => storage.getItem(key) !== null);
}

/**
 * Every profile id with data in storage, from the addresses themselves rather
 * than the roster: namespaced stores, parked slots and the original owner's
 * bare keys. Deleted profiles are left out unless `includeDeleted` asks for
 * their leftovers too.
 */
function profileIdsWithData(options: { includeDeleted?: boolean; withContent?: boolean } = {}): string[] {
  const ids = profileIdsInStorage(OWNED_KEYS, { withContent: options.withContent });
  const legacy = getLegacyProfileStorageOwner();
  if (legacyOwnerHasData()) ids.add(legacy);
  return [...ids]
    .filter((id) => options.includeDeleted || !isProfileDeleted(id))
    .sort();
}

/**
 * The people a damaged roster no longer lists, found from the data they left.
 *
 * A roster that cannot be parsed reads as the default profile alone, and one
 * the normalizer had to repair loses the entries it dropped – but their stores
 * are still in storage, readable at their own addresses. A backup that trusted
 * the repaired roster exported nobody else, and a restore of that file then
 * orphaned all of them; this is what lets the backup carry them instead. Each
 * keeps the name the damaged roster still gives it where that is usable and
 * unique, and is otherwise called "Recovered profile N".
 */
export function recoverUnlistedProfiles(rosterText: string | null, listed: Profile[]): Profile[] {
  if (typeof window === "undefined") return [];

  const storedNames = new Map<string, string>();
  try {
    const parsed: unknown = rosterText === null ? null : JSON.parse(rosterText);
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        const id = sanitizeProfileId(record.id);
        const name = sanitizeProfileName(record.name);
        if (id && name && !storedNames.has(id)) storedNames.set(id, name);
      }
    }
  } catch {
    // Unparseable: every recovered profile gets a placeholder name.
  }

  const listedIds = new Set(listed.map((profile) => profile.id));
  const recovered: Profile[] = [];
  let counter = 0;
  for (const id of profileIdsWithData({ withContent: true })) {
    if (listedIds.has(id)) continue;
    let name = storedNames.get(id);
    while (!name || nameIsTaken([...listed, ...recovered], name)) {
      counter += 1;
      name = `Recovered profile ${counter}`;
    }
    recovered.push({ id, name });
  }
  return recovered;
}

/**
 * A profile's stores as a backup reads them, without switching to it.
 *
 * `slot` holds the raw string of every store that could be read; what a store's
 * JSON means is the store's business, not this module's. `unreadable` holds the
 * rest, keyed by store, with the stored text kept exactly as found – or null
 * when the browser refused the read – so a backup can still carry everything
 * else and say precisely what it could not.
 */
export function inspectProfileSlot(profileId: string): {
  slot: Record<string, string>;
  unreadable: Record<string, string | null>;
} {
  const slot: Record<string, string> = {};
  const unreadable: Record<string, string | null> = {};
  if (typeof window === "undefined") return { slot, unreadable };

  for (const key of OWNED_KEYS) {
    const store = inspectProfileStore(key, profileId);
    if (!store.readable) unreadable[key] = store.raw;
    else if (store.value !== null) slot[key] = store.value;
  }

  return { slot, unreadable };
}

/**
 * A profile's readable stores, as the raw strings each store wrote. A strict
 * read throws instead when any store cannot be read, rather than presenting
 * corruption as an empty store.
 */
export function readProfileSlot(
  profileId: string,
  options: { strict?: boolean } = {},
): Record<string, string> {
  const { slot, unreadable } = inspectProfileSlot(profileId);
  const failed = Object.keys(unreadable);
  if (options.strict && failed.length > 0) {
    throw new Error(`Unreadable stored profile data: ${failed.join(", ")}`);
  }

  return slot;
}

/**
 * The stored roster text as the app uses it. `canonical` is false when the
 * normalizer had to repair it – entries past the cap, blank or zero-width
 * names, over-long ids, duplicates, or text that is not a roster at all.
 */
export function parseStoredProfiles(stored: string | null): {
  profiles: Profile[];
  canonical: boolean;
} {
  if (stored === null) return { profiles: [DEFAULT_PROFILE], canonical: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return { profiles: [DEFAULT_PROFILE], canonical: false };
  }
  const profiles = sanitizeProfiles(parsed);
  const canonical = Array.isArray(parsed) &&
    parsed.length === profiles.length &&
    parsed.every((entry, index) =>
      !!entry && typeof entry === "object" &&
      entry.id === profiles[index].id &&
      entry.name === profiles[index].name,
    );

  return {
    profiles: profiles.filter((profile) => !isProfileDeleted(profile.id)),
    canonical,
  };
}

export function getProfiles(options: { strict?: boolean } = {}): Profile[] {
  if (typeof window === "undefined") return [DEFAULT_PROFILE];

  try {
    const stored = window.localStorage.getItem(PROFILES_STORAGE_KEY);
    const { profiles, canonical } = parseStoredProfiles(stored);
    // Edits to the roster rewrite all of it, so they must not start from a
    // repaired copy: the entries the repair dropped would be gone for good.
    if (options.strict && !canonical) throw new Error("Invalid stored profile roster");
    return profiles;
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

/** Every owned store replaced by `snapshot`, for backup restore. */
export function liveProfileChanges(
  snapshot: Record<string, string>,
  profileId = getProfileStorageOwner(),
  options: { restoringProfile?: boolean } = {},
): Map<string, string | null> {
  const changes = profileStoreChanges(OWNED_KEYS, snapshot, profileId, options);
  // An absent incoming stamp would otherwise fall back to the pre-profile one.
  for (const key of legacyOwnedKeys(profileId)) changes.set(key, null);
  return changes;
}

/**
 * Switch profiles.
 *
 * Only the active pointer changes. Failed writes leave every profile's stores
 * intact. The roster lock keeps a queued deletion or restore from invalidating
 * the target between checking it and saving the pointer.
 *
 * The target's stores are not read: nothing moves, so nothing can be lost to
 * one that is unreadable. Such a store behaves exactly as it does for a profile
 * that is already active – it renders empty, its edits are refused, a clear
 * replaces it, and a backup keeps its text. Refusing the switch over it used to
 * leave that person's other stores unreachable, with no way to recover them.
 *
 * Asking for the profile that is already active succeeds: another tab got
 * there first, and this one has not seen the storage event yet. Subscribers are
 * told, so the page catches up with the profile actually in use.
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
  if (current === profileId) {
    notifyProfileStoresChanged();
    return { ok: true };
  }

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
 * one is a switch – after which every save lands in the other person's stores
 * and theirs are what you see. Compared case-insensitively because "tom" and
 * "Tom" are the same person as far as anyone reading the menu is concerned.
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

  const clean = sanitizeProfileName(name);
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

  const clean = sanitizeProfileName(name);
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
    // Deletion is how a full browser makes room, so an owner marker it cannot
    // write yet must not refuse it (see `initializeProfileStorageForRelease`).
    initializeProfileStorageForRelease();
  } catch (error) {
    console.error("Error preparing profile storage:", error);
    return false;
  }

  const profiles = getProfiles({ strict: true });
  if (!profiles.some((profile) => profile.id === profileId)) return false;
  if (profileId === getActiveProfileId()) return false;
  const removed = profiles.filter((profile) => profile.id !== profileId);
  // This atomic write is the deletion's commit point. Shrinking the roster
  // first would orphan the profile if both the marker and roster recovery failed,
  // causing the next backup to omit data after a reported failed deletion.
  let marked = true;
  try {
    window.localStorage.setItem(deletedProfileKey(profileId), "true");
  } catch (error) {
    console.error("Error saving profile deletion:", error);
    marked = false;
  }

  if (marked) {
    // Readers already exclude marked owners. Cleanup cannot turn a committed
    // deletion into a failure, even if the original roster remains in storage.
    writeProfiles(removed);
  } else {
    // A browser at its quota has no room for even the small marker – and
    // deleting a profile is how somebody makes room. A shorter roster always
    // fits where the longer one did, and it commits the deletion just as well:
    // an owner the roster does not list is unavailable to every reader and
    // writer. The marker is written once the data below has released space.
    if (!writeProfiles(removed)) return false;
  }

  try {
    window.localStorage.removeItem(slotKey(profileId));
    for (const key of OWNED_KEYS) {
      window.localStorage.removeItem(profileStoreKey(key, profileId));
    }
    for (const key of legacyOwnedKeys(profileId)) window.localStorage.removeItem(key);
  } catch (error) {
    // The committed marker keeps retained data inaccessible to late writes;
    // failed cleanup costs storage without reversing the requested deletion.
    console.error("Error removing the profile's data:", error);
  }

  if (!marked) {
    try {
      window.localStorage.setItem(deletedProfileKey(profileId), "true");
    } catch (error) {
      // The shortened roster already committed the deletion.
      console.error("Error saving profile deletion after cleanup:", error);
    }
  }
  initializeProfileStorageAfterRelease();

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
  // Everybody the backup does not carry goes, with all their data – which is
  // what the confirmation promises. Found from the addresses in storage as well
  // as from the roster: a roster that cannot be parsed, or one the normalizer
  // repaired, does not list everybody whose stores are still here, and those
  // used to survive the restore as data no profile could ever reach again.
  // A deleted profile's leftovers – from a cleanup the browser refused – go too.
  const absent = new Set([
    ...getProfiles().map((profile) => profile.id),
    ...profileIdsWithData({ includeDeleted: true }),
  ]);
  for (const existingId of absent) {
    if (keep.has(existingId)) continue;
    changes.set(deletedProfileKey(existingId), "true");
    changes.set(slotKey(existingId), null);
    for (const key of OWNED_KEYS) {
      changes.set(profileStoreKey(key, existingId), null);
    }
    for (const key of legacyOwnedKeys(existingId)) changes.set(key, null);
  }

  return changes;
}
