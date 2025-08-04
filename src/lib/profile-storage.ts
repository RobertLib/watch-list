import { applyStorageTransaction } from "./storage-transaction";

/**
 * Keep each profile's stores at a stable address. Switching profiles changes
 * only the active pointer, so another tab cannot interrupt a destructive swap.
 * The old live keys retain their original owner; parked slots remain readable
 * until each store is edited, without copying or deleting anybody's only data.
 */
export const PROFILE_STORAGE_OWNER_KEY = "profile-storage-owner";
const ACTIVE_KEY = "active-profile";
const ROSTER_KEY = "profiles";
const DEFAULT_ID = "default";
const STORE_PREFIX = "profile-store:";
export const DELETED_PROFILE_PREFIX = "profile-deleted:";
// The roster holds at most five profiles; old/deleted owners must not accumulate.
const MAX_SNAPSHOT_OWNERS = 5;

let boundOwner: string | null = null;
const pendingNotifications = new Set<() => void>();

export function getProfileStorageOwner(): string {
  if (boundOwner !== null) return boundOwner;
  if (typeof window === "undefined") return DEFAULT_ID;
  try {
    return resolveProfileStorageOwner(window.localStorage.getItem(ACTIVE_KEY) || DEFAULT_ID);
  } catch {
    return DEFAULT_ID;
  }
}

export function deletedProfileKey(profileId: string): string {
  return `${DELETED_PROFILE_PREFIX}${encodeURIComponent(profileId)}`;
}

/** A deletion remains authoritative even if another tab rewrites an old roster. */
export function isProfileDeleted(profileId: string): boolean {
  return profileId !== DEFAULT_ID && window.localStorage.getItem(deletedProfileKey(profileId)) !== null;
}

export function isProfileStorageOwnerAvailable(profileId: string): boolean {
  if (isProfileDeleted(profileId)) return false;
  if (profileId === DEFAULT_ID) return true;
  const roster = window.localStorage.getItem(ROSTER_KEY);
  // Before profiles existed, a nondefault active owner could hold the live keys.
  if (roster === null) return true;
  const parsed: unknown = JSON.parse(roster);
  if (!Array.isArray(parsed)) throw new Error("Invalid stored profile roster");
  return parsed.some((entry) => entry && typeof entry === "object" &&
    entry.id === profileId && typeof entry.name === "string" && entry.name.trim());
}

/** Resolve an obsolete pointer without making reads depend on a repair write. */
export function resolveProfileStorageOwner(profileId: string): string {
  return isProfileStorageOwnerAvailable(profileId) ? profileId : DEFAULT_ID;
}

/** Bind an entire synchronous read/transform/write to one rendered owner. */
export function withProfileStorage<T>(profileId: string, operation: () => T): T {
  const previous = boundOwner;
  boundOwner = profileId;
  try {
    return operation();
  } finally {
    boundOwner = previous;
    if (previous === null) {
      const notifications = [...pendingNotifications];
      pendingNotifications.clear();
      for (const notify of notifications) notify();
    }
  }
}

/** Subscriber reads belong to the actual active profile, outside a write scope. */
export function publishProfileStorageChange(notify: () => void): void {
  if (boundOwner === null) notify();
  else pendingNotifications.add(notify);
}

/** Must succeed before a pointer change or a first namespaced write. */
export function initializeProfileStorage(): void {
  const storage = window.localStorage;
  const existing = storage.getItem(PROFILE_STORAGE_OWNER_KEY);
  if (existing !== null) {
    validateOwner(existing);
    return;
  }
  const originalOwner = validateOwner(storage.getItem(ACTIVE_KEY) || DEFAULT_ID);
  // Every switch writes the marker before the pointer. A competing initializer
  // that read a newer pointer must therefore see the existing marker here.
  if (storage.getItem(PROFILE_STORAGE_OWNER_KEY) === null) {
    storage.setItem(PROFILE_STORAGE_OWNER_KEY, originalOwner);
  }
}

export function getLegacyProfileStorageOwner(): string {
  const storage = window.localStorage;
  return validateOwner(storage.getItem(PROFILE_STORAGE_OWNER_KEY)
    ?? (storage.getItem(ACTIVE_KEY) || DEFAULT_ID));
}

function validateOwner(owner: string): string {
  if (!owner || owner.length > 64) throw new Error("Invalid stored profile owner");
  return owner;
}

export function profileStoreKey(key: string, profileId = getProfileStorageOwner()): string {
  return profileId === getLegacyProfileStorageOwner()
    ? key
    : `${STORE_PREFIX}${encodeURIComponent(profileId)}:${key}`;
}

export function readProfileStore(
  key: string,
  profileId = getProfileStorageOwner(),
  strict = false,
): string | null {
  const storage = window.localStorage;
  const address = profileStoreKey(key, profileId);
  const raw = storage.getItem(address);
  // An explicit null also suppresses an unreadable retained copy after a clear.
  if (raw !== null || address === key) return raw === "null" ? null : raw;

  const parked = storage.getItem(`profile-data:${profileId}`);
  if (parked === null) return null;
  try {
    const slot: unknown = JSON.parse(parked);
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
      throw new Error("Invalid stored profile data");
    }
    const value = (slot as Record<string, unknown>)[key];
    if (value === undefined) return null;
    if (typeof value !== "string") throw new Error(`Invalid stored profile value: ${key}`);
    if (strict) JSON.parse(value);
    return value === "null" ? null : value;
  } catch (error) {
    if (strict) throw error;
    console.error("Error reading the profile's data:", error);
    return null;
  }
}

/** Stable React snapshots even when retained and current owners read alternately. */
export function createProfileStoreSnapshot<T>(
  key: string,
  empty: T,
  parse: (raw: string) => T,
): (options?: { strict?: boolean }) => T {
  const snapshots = new Map<string, { raw: string | null; value: T }>();
  return (options = {}) => {
    if (typeof window === "undefined") return empty;

    const owner = getProfileStorageOwner();
    let raw: string | null;
    try {
      raw = readProfileStore(key, owner, options.strict);
      // Rendering parsers may return an empty fallback for broken JSON. Edits
      // must reject that serialization before using a cached or parsed value.
      if (options.strict && raw !== null) JSON.parse(raw);
    } catch (error) {
      if (options.strict) throw error;
      return empty;
    }

    const cached = snapshots.get(owner);
    const value = cached?.raw === raw ? cached.value : raw ? parse(raw) : empty;
    snapshots.delete(owner);
    snapshots.set(owner, { raw, value });
    if (snapshots.size > MAX_SNAPSHOT_OWNERS) {
      snapshots.delete(snapshots.keys().next().value!);
    }
    return value;
  };
}

export function writeProfileStore(
  key: string,
  value: string | null,
  profileId = getProfileStorageOwner(),
): void {
  // Rendering may show an empty fallback for unreadable data. A normal edit
  // must not save that fallback over the only recoverable copy. Read the
  // effective store strictly before any initialization or migration write;
  // an authoritative current value still hides an unused broken parked copy.
  const previous = readProfileStore(key, profileId, true);
  if (previous !== null) JSON.parse(previous);
  initializeProfileStorage();
  if (!isProfileStorageOwnerAvailable(profileId)) {
    throw new Error("This profile was removed; reload before saving");
  }
  const storage = window.localStorage;
  const address = profileStoreKey(key, profileId);
  const changes = new Map<string, string | null>([
    [address, value ?? (address === key ? null : "null")],
  ]);
  addParkedStoreCleanup(changes, [key], profileId);
  if (changes.size > 1) {
    // Release the older field before the current value is written, under the
    // caller's roster lock. Refusal restores the exact original slot as well
    // as the current key, so a first edit never needs room for two full copies.
    const result = applyStorageTransaction(changes, {
      validationKey: ROSTER_KEY,
      validate: () => {
        if (!isProfileStorageOwnerAvailable(profileId)) {
          throw new Error("This profile was removed while saving");
        }
      },
    });
    if (!result.ok) {
      if (!result.rolledBack) {
        // Single-key saves used to fail atomically. A browser that also refuses
        // migration's undo can leave different data behind; every local reader
        // must adopt it outside the temporary owner binding, as other tabs do.
        publishProfileStorageChange(notifyProfileStorageRecovery);
      }
      // Older code can delete the owner without holding the shared lock. The
      // transaction's rollback must not leave its restored data orphaned.
      if (isProfileDeleted(profileId)) {
        for (const changedKey of changes.keys()) storage.removeItem(changedKey);
        throw new Error("This profile was removed while saving");
      }
      throw new Error(result.rolledBack
        ? "The browser refused to save this profile's data"
        : "The browser refused to restore this profile's previous data");
    }
  } else if (value === null && address === key) storage.removeItem(address);
  else storage.setItem(address, value ?? "null");
  // A deletion can finish after the check and before this write. Its tombstone
  // prevents this late write from reviving the owner; release the orphan too.
  if (isProfileDeleted(profileId)) {
    storage.removeItem(address);
    throw new Error("This profile was removed while saving");
  }
}

function notifyProfileStorageRecovery(): void {
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
}

/** Keep unrelated or unreadable parked values until they can be recovered. */
function addParkedStoreCleanup(
  changes: Map<string, string | null>,
  keys: readonly string[],
  profileId: string,
): void {
  const parkedKey = `profile-data:${profileId}`;
  try {
    const raw = window.localStorage.getItem(parkedKey);
    if (raw === null) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const slot = parsed as Record<string, unknown>;
    let changed = false;
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(slot, key) || typeof slot[key] !== "string") continue;
      // A broken serialized field may still be the only recoverable copy.
      try {
        JSON.parse(slot[key]);
      } catch {
        continue;
      }
      delete slot[key];
      changed = true;
    }
    if (changed) {
      changes.set(parkedKey, Object.keys(slot).length > 0 ? JSON.stringify(slot) : null);
    }
  } catch (error) {
    // Editing a usable current store must not discard a malformed older slot.
    console.error("Error preparing the profile's older data for cleanup:", error);
  }
}

/** Raw changes for the existing refusal/rollback transaction helper. */
export function profileStoreChanges(
  keys: readonly string[],
  snapshot: Record<string, string>,
  profileId = getProfileStorageOwner(),
  options: { restoringProfile?: boolean } = {},
): Map<string, string | null> {
  initializeProfileStorage();
  if (!options.restoringProfile && !isProfileStorageOwnerAvailable(profileId)) {
    throw new Error("This profile was removed; reload before saving");
  }
  const changes = new Map(keys.map((key) => {
    const address = profileStoreKey(key, profileId);
    return [address, snapshot[key] ?? (address === key ? null : "null")];
  }));
  // A complete profile restore removes whole slots itself. Its incoming store
  // map must not override that explicit deletion with a partially cleaned slot.
  if (!options.restoringProfile) addParkedStoreCleanup(changes, keys, profileId);
  return changes;
}

export function isProfileStoreEvent(eventKey: string | null, key: string): boolean {
  if (eventKey === null || eventKey === ACTIVE_KEY || eventKey === ROSTER_KEY ||
    eventKey.startsWith(DELETED_PROFILE_PREFIX)) return true;
  const profileId = getProfileStorageOwner();
  return eventKey === profileStoreKey(key, profileId)
    || eventKey === `profile-data:${profileId}`;
}
