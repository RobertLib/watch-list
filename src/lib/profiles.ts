"use client";

import { COLLECTIONS_STORAGE_KEY } from "./collections";
import { DAILY_GAME_STORAGE_KEY } from "./daily-game";
import { EPISODE_PROGRESS_STORAGE_KEY } from "./episode-progress";
import { GOAL_STORAGE_KEY } from "./goal";
import { HIGHER_LOWER_STORAGE_KEY } from "./higher-lower";
import { RANKING_STORAGE_KEY } from "./ranking";
import { RATINGS_STORAGE_KEY } from "./ratings";
import { WATCHED_STORAGE_KEY } from "./watched";
import { WATCHLIST_STORAGE_KEY } from "./watchlist";

/**
 * More than one person per browser.
 *
 * One television, two people, one set of recommendations quietly averaging both
 * of them into nonsense – and a "continue watching" row full of somebody else's
 * series. That is the usual reason a shared household stops trusting a tracker.
 *
 * Implemented by *swapping* the stored data rather than by namespacing every key.
 * The alternative – prefixing keys everywhere – would mean touching every storage
 * module, every `storage` event listener that compares a key by name, and the
 * backup format, for exactly the same result. Here the live keys stay the live
 * keys: switching writes the current data into the outgoing profile's slot and
 * loads the incoming one over the top.
 *
 * The cost is that two tabs cannot hold two different profiles at once. That is
 * inherent to a switch rather than a namespace, and it matches how the feature is
 * actually used – one person at the television at a time.
 */

export const PROFILES_STORAGE_KEY = "profiles";
export const ACTIVE_PROFILE_STORAGE_KEY = "active-profile";

/** The profile whose data sits in the live keys for anyone who never switches. */
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
 * A dormant profile's parked stores, as the raw strings each store wrote.
 *
 * Exported for backup and restore, which is the one thing outside this module
 * that has any business reading a profile other than the active one. It hands
 * back the slot verbatim rather than anything structured: what a store's JSON
 * means is the store's business, not this module's.
 */
export function readProfileSlot(profileId: string): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(slotKey(profileId));
    if (!stored) return {};

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    // Only the keys a profile actually owns, and only the ones stored as the
    // strings `writeLiveData` would put back.
    const slot: Record<string, string> = {};
    for (const key of OWNED_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string") slot[key] = value;
    }

    return slot;
  } catch (error) {
    console.error("Error reading the profile's data:", error);
    return {};
  }
}

/** Park a profile's stores without switching to it. */
function writeProfileSlot(
  profileId: string,
  slot: Record<string, string>,
): void {
  window.localStorage.setItem(slotKey(profileId), JSON.stringify(slot));
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

export function getProfiles(): Profile[] {
  if (typeof window === "undefined") return [DEFAULT_PROFILE];

  try {
    const stored = window.localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!stored) return [DEFAULT_PROFILE];

    return sanitizeProfiles(JSON.parse(stored));
  } catch (error) {
    console.error("Error parsing profiles from storage:", error);
    return [DEFAULT_PROFILE];
  }
}

function writeProfiles(profiles: Profile[]): void {
  try {
    window.localStorage.setItem(
      PROFILES_STORAGE_KEY,
      JSON.stringify(profiles),
    );
  } catch (error) {
    console.error("Error saving profiles:", error);
  }
}

export function getActiveProfileId(): string {
  if (typeof window === "undefined") return DEFAULT_PROFILE_ID;

  try {
    return (
      window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) ||
      DEFAULT_PROFILE_ID
    );
  } catch {
    return DEFAULT_PROFILE_ID;
  }
}

export function getActiveProfile(): Profile {
  const id = getActiveProfileId();
  return getProfiles().find((profile) => profile.id === id) ?? DEFAULT_PROFILE;
}

/** Everything the active profile currently owns, as one blob. */
function captureLiveData(): Record<string, string> {
  const snapshot: Record<string, string> = {};

  for (const key of OWNED_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value !== null) snapshot[key] = value;
  }

  return snapshot;
}

function writeLiveData(snapshot: Record<string, string>): void {
  for (const key of OWNED_KEYS) {
    const value = snapshot[key];

    // A key the incoming profile has never written has to be *removed*, not left
    // alone – otherwise the outgoing profile's watchlist stays on screen.
    if (value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  }
}

function parkCurrentProfile(profileId: string): void {
  try {
    window.localStorage.setItem(
      slotKey(profileId),
      JSON.stringify(captureLiveData()),
    );
  } catch (error) {
    // Out of quota is the realistic failure, and losing the outgoing profile's
    // data would be much worse than refusing to switch.
    console.error("Error saving the current profile's data:", error);
    throw error;
  }
}

function loadProfileData(profileId: string): void {
  let snapshot: Record<string, string> = {};

  try {
    const stored = window.localStorage.getItem(slotKey(profileId));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        snapshot = parsed as Record<string, string>;
      }
    }
  } catch (error) {
    // A corrupt slot loads as an empty profile rather than as the previous
    // person's data, which would be the worse of the two failures.
    console.error("Error reading the profile's data:", error);
  }

  // `writeLiveData` is deliberately not wrapped: a failure part-way through
  // leaves the live keys holding two people's data, which `switchProfile` has to
  // hear about so it can put the original back.
  writeLiveData(snapshot);
}

/**
 * Switch profiles.
 *
 * Returns whether the swap happened. The caller reloads afterwards: every context
 * in the app read its store once on mount, and there is no honest way to tell
 * them all that the ground moved.
 */
export function switchProfile(profileId: string): boolean {
  if (typeof window === "undefined") return false;

  const current = getActiveProfileId();
  if (current === profileId) return false;

  const exists = getProfiles().some((profile) => profile.id === profileId);
  if (!exists) return false;

  try {
    parkCurrentProfile(current);
  } catch {
    return false;
  }

  // The name moves before the data, and moves back if the data cannot follow.
  //
  // Whichever order these two go in, one of them can fail with the other already
  // done – and the pairing is what matters, because the *next* switch parks
  // whatever is in the live keys into the slot named by the active id. A
  // mismatch there does not read as a failed switch; it silently overwrites one
  // profile's watchlist with another's. So the only safe arrangement is one
  // where every exit path has the two agreeing, which means being able to undo.
  // Writing the id is the undoable half: it is one short string, and the data it
  // names is still parked and intact.
  try {
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
  } catch (error) {
    console.error("Error recording the active profile:", error);
    return false;
  }

  try {
    loadProfileData(profileId);
  } catch (error) {
    console.error("Error loading the profile's data:", error);

    // Put both halves back the way they were. The outgoing profile's data was
    // parked a moment ago, so it can be read straight back in.
    try {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, current);
      loadProfileData(current);
    } catch (rollbackError) {
      console.error("Error restoring the previous profile:", rollbackError);
    }

    return false;
  }

  return true;
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
function nameIsTaken(clean: string, exceptId?: string): boolean {
  const wanted = clean.toLocaleLowerCase();

  return getProfiles().some(
    (profile) =>
      profile.id !== exceptId && profile.name.toLocaleLowerCase() === wanted,
  );
}

/**
 * Add a profile. It starts empty, and is not switched to.
 *
 * Null for a name that is blank after sanitising, one that duplicates an
 * existing profile, or a roster that is already full.
 */
export function createProfile(name: string): Profile | null {
  if (typeof window === "undefined") return null;

  const clean = sanitizeName(name);
  if (!clean) return null;

  const profiles = getProfiles();
  if (profiles.length >= MAX_PROFILES) return null;
  if (nameIsTaken(clean)) return null;

  const profile: Profile = { id: newProfileId(), name: clean };
  writeProfiles([...profiles, profile]);

  return profile;
}

/** Rename a profile. False when the name is blank or belongs to someone else. */
export function renameProfile(profileId: string, name: string): boolean {
  if (typeof window === "undefined") return false;

  const clean = sanitizeName(name);
  if (!clean) return false;

  // `exceptId` is what lets a rename that only changes capitalisation through –
  // and what stops one profile from being renamed onto another.
  if (nameIsTaken(clean, profileId)) return false;

  writeProfiles(
    getProfiles().map((profile) =>
      profile.id === profileId ? { ...profile, name: clean } : profile,
    ),
  );

  return true;
}

/**
 * Delete a profile and everything it owns.
 *
 * The default profile cannot go: its data is the data in the live keys, so
 * deleting it would mean deciding what the live keys should hold instead. The
 * active profile cannot go either – switch away first, which is what the UI does.
 */
export function deleteProfile(profileId: string): boolean {
  if (typeof window === "undefined") return false;
  if (profileId === DEFAULT_PROFILE_ID) return false;
  if (profileId === getActiveProfileId()) return false;

  writeProfiles(getProfiles().filter((profile) => profile.id !== profileId));

  try {
    window.localStorage.removeItem(slotKey(profileId));
  } catch (error) {
    console.error("Error removing the profile's data:", error);
  }

  return true;
}

/**
 * Rebuild this browser's profiles from a backup.
 *
 * The caller has already written the active profile's stores into the live keys,
 * because those are the same stores the app reads all the time and it owns them.
 * What is left is the part only this module can do: park everyone else, replace
 * the roster, and say who is live.
 *
 * A file with no `active` is one written before backups knew about profiles. It
 * carries one set of stores and no claim about whose they are, so the roster is
 * left exactly as it was and the restore means what it always meant – replace
 * the data of whoever is currently switched in.
 */
export function restoreProfiles(
  active: Profile | null,
  others: { profile: Profile; slot: Record<string, string> }[],
): boolean {
  if (typeof window === "undefined") return false;
  if (!active) return false;

  const keep = new Set([active.id, ...others.map(({ profile }) => profile.id)]);

  // A profile this browser is about to forget still has a slot, and a slot left
  // behind is one person's watchlist sitting in storage under a name nothing
  // points at any more – until some later profile happens to reuse the id.
  for (const existing of getProfiles()) {
    if (keep.has(existing.id)) continue;

    try {
      window.localStorage.removeItem(slotKey(existing.id));
    } catch (error) {
      console.error("Error removing a replaced profile's data:", error);
    }
  }

  for (const { profile, slot } of others) {
    try {
      writeProfileSlot(profile.id, slot);
    } catch (error) {
      // Out of quota part-way through leaves the profiles that did fit. Better
      // than failing the whole restore and leaving the visitor with neither.
      console.error("Error restoring a profile's data:", error);
    }
  }

  // The active profile goes first so that a file carrying more than `MAX_PROFILES`
  // cannot be the one that gets dropped by the cap.
  writeProfiles(
    sanitizeProfiles([active, ...others.map(({ profile }) => profile)]),
  );

  try {
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, active.id);
  } catch (error) {
    console.error("Error recording the active profile:", error);
    return false;
  }

  return true;
}
