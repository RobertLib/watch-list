"use client";

import { COLLECTIONS_STORAGE_KEY } from "./collections";
import { DAILY_GAME_STORAGE_KEY } from "./daily-game";
import { EPISODE_PROGRESS_STORAGE_KEY } from "./episode-progress";
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
 * Region and platform settings are deliberately not here: they live in httpOnly
 * cookies the browser cannot write, and they describe the household rather than
 * the person – two people on one sofa are in the same country.
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
] as const;

/** Where a dormant profile's data is parked. */
function slotKey(profileId: string): string {
  return `profile-data:${profileId}`;
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

  loadProfileData(profileId);

  try {
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
  } catch (error) {
    console.error("Error recording the active profile:", error);
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

/** Add a profile. It starts empty, and is not switched to. */
export function createProfile(name: string): Profile | null {
  if (typeof window === "undefined") return null;

  const clean = sanitizeName(name);
  if (!clean) return null;

  const profiles = getProfiles();
  if (profiles.length >= MAX_PROFILES) return null;

  const profile: Profile = { id: newProfileId(), name: clean };
  writeProfiles([...profiles, profile]);

  return profile;
}

export function renameProfile(profileId: string, name: string): boolean {
  if (typeof window === "undefined") return false;

  const clean = sanitizeName(name);
  if (!clean) return false;

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
