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
const PARKED_PREFIX = "profile-data:";
export const DELETED_PROFILE_PREFIX = "profile-deleted:";

export const MAX_PROFILES = 5;
export const MAX_PROFILE_NAME_LENGTH = 24;
const MAX_PROFILE_ID_LENGTH = 64;

export interface Profile {
  id: string;
  name: string;
}

/** The initial profile for visitors who have never created another. */
export const DEFAULT_PROFILE: Profile = {
  id: DEFAULT_ID,
  name: "Me",
};

/**
 * A name as the switcher can show it. Control and format characters become
 * spaces first, so a name made only of zero-width characters is blank – the
 * same as one made of spaces – rather than an invisible row.
 *
 * Idempotent: a stored name sanitizes to itself. The cut used to come last, so
 * it could end a name on a space, or on the first half of a surrogate pair –
 * which a second pass then removed. A roster holding such a name read as
 * repaired (non-canonical), and every roster edit refused to start from it.
 */
export function sanitizeProfileName(value: unknown): string {
  if (typeof value !== "string") return "";

  let name = value
    .replace(/[\p{C}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PROFILE_NAME_LENGTH);
  // Never keep half of a character the cut went through.
  if (/[\uD800-\uDBFF]$/.test(name)) name = name.slice(0, -1);
  return name.trimEnd();
}

/** Ids are cut, not refused, the same way everywhere a roster entry is read. */
export function sanitizeProfileId(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_PROFILE_ID_LENGTH) : "";
}

/**
 * The roster exactly as the app uses it: at most `MAX_PROFILES` entries with an
 * id and a visible name, the default profile always among them.
 *
 * This is the one normalizer behind both questions a roster answers – whom the
 * switcher and a backup list, and whose stores may be read and written. They
 * used to disagree: availability accepted any entry with a non-blank trimmed
 * name, so a sixth entry, an over-long id or a zero-width name resolved as the
 * active owner while missing from the list, and every export then failed on an
 * active profile "absent from the stored roster".
 */
export function sanitizeProfiles(input: unknown): Profile[] {
  if (!Array.isArray(input)) return [DEFAULT_PROFILE];

  const profiles: Profile[] = [];
  const seen = new Set<string>();

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const id = sanitizeProfileId(record.id);
    const name = sanitizeProfileName(record.name);

    if (!id || !name || seen.has(id)) continue;
    seen.add(id);

    profiles.push({ id, name });
    if (profiles.length >= MAX_PROFILES) break;
  }

  // There is always somebody. A stored list that repaired down to nothing means
  // the data in the live keys belongs to the default profile.
  if (!profiles.some((profile) => profile.id === DEFAULT_ID)) {
    profiles.unshift(DEFAULT_PROFILE);
    // Room is made rather than taken: the loop above stops at the cap, so
    // putting the default profile back on the front of a full list would return
    // one more than `MAX_PROFILES` and let the UI create past its own limit.
    // The default is the entry that cannot be dropped – it owns the live keys.
    if (profiles.length > MAX_PROFILES) profiles.length = MAX_PROFILES;
  }

  return profiles;
}

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

/**
 * Whether a profile's stores may be read and written: exactly the profiles
 * `getProfiles()` lists, through the same `sanitizeProfiles`, so an owner is
 * either visible and available or neither.
 */
export function isProfileStorageOwnerAvailable(profileId: string): boolean {
  if (isProfileDeleted(profileId)) return false;
  if (profileId === DEFAULT_ID) return true;
  const roster = window.localStorage.getItem(ROSTER_KEY);
  // Before profiles existed, a nondefault active owner could hold the live keys.
  if (roster === null) return true;
  const parsed: unknown = JSON.parse(roster);
  if (!Array.isArray(parsed)) throw new Error("Invalid stored profile roster");
  return sanitizeProfiles(parsed).some((profile) => profile.id === profileId);
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

/**
 * `initializeProfileStorage` for an operation that only releases storage: a
 * clear, or a profile deletion.
 *
 * Writing the marker is the first write of every operation, so a browser that
 * reached its quota before the marker existed (an install from before it was
 * introduced) refused every clear and every deletion – exactly the operations
 * that would make room. The marker only has to exist before the active pointer
 * changes, and none of these change it: until it is written, the legacy owner
 * still resolves from that same unchanged pointer. So a refused marker write is
 * tolerated here; an invalid marker or pointer is not.
 */
export function initializeProfileStorageForRelease(): void {
  try {
    initializeProfileStorage();
  } catch (error) {
    const storage = window.localStorage;
    // An existing marker that failed validation, or a refused read, still stops it.
    if (storage.getItem(PROFILE_STORAGE_OWNER_KEY) !== null) throw error;
    validateOwner(storage.getItem(ACTIVE_KEY) || DEFAULT_ID);
    console.error("Releasing storage before its owner marker could be written:", error);
  }
}

/** After a release made room, the marker that could not be written before. */
export function initializeProfileStorageAfterRelease(): void {
  try {
    initializeProfileStorage();
  } catch (error) {
    console.error("Error writing the profile storage owner marker:", error);
  }
}

export function getLegacyProfileStorageOwner(): string {
  const storage = window.localStorage;
  return validateOwner(storage.getItem(PROFILE_STORAGE_OWNER_KEY)
    ?? (storage.getItem(ACTIVE_KEY) || DEFAULT_ID));
}

function validateOwner(owner: string): string {
  if (!owner || owner.length > MAX_PROFILE_ID_LENGTH) throw new Error("Invalid stored profile owner");
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
    // Old and deleted owners must not accumulate beyond the roster's size.
    if (snapshots.size > MAX_PROFILES) {
      snapshots.delete(snapshots.keys().next().value!);
    }
    return value;
  };
}

/**
 * Save one store for one owner.
 *
 * `clear` marks a write whose value owes nothing to the current one: the
 * visitor asked for the store to be emptied. A null value is always a clear; a
 * store whose empty form is not null (the watchlist's `[]`) says so explicitly.
 */
export function writeProfileStore(
  key: string,
  value: string | null,
  profileId = getProfileStorageOwner(),
  options: { clear?: boolean } = {},
): void {
  // Rendering may show an empty fallback for unreadable data. A normal edit
  // must not save that fallback over the only recoverable copy. Read the
  // effective store strictly before any initialization or migration write;
  // an authoritative current value still hides an unused broken parked copy.
  //
  // A clear derives nothing from the old value, so there is nothing to guard.
  // Requiring a readable store first left a corrupt one – rendered as empty –
  // impossible to clear at all, reported only as refused storage. The explicit
  // request replaces the current value; an unreadable parked copy stays behind
  // the explicit empty value below, as it does for any other edit.
  const clear = options.clear ?? value === null;
  if (!clear) {
    const previous = readProfileStore(key, profileId, true);
    if (previous !== null) JSON.parse(previous);
  }
  // A clear is how a full browser makes room, so a marker it cannot write yet
  // must not refuse it (see `initializeProfileStorageForRelease`).
  if (clear) initializeProfileStorageForRelease();
  else initializeProfileStorage();
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
  if (clear) initializeProfileStorageAfterRelease();
}

/**
 * One store as a backup needs it: the value when it can be read, and otherwise
 * the stored text exactly as found.
 *
 * Strict reads stop an edit at the first unreadable store, which is right for
 * an edit and wrong for the way out: a backup that refused to build over one
 * hand-edited field left the visitor no copy of anything else. `raw` is the
 * text of the effective value – the current address, else its parked field –
 * or the whole parked slot when the slot itself cannot be parsed; null when the
 * browser refused the read and there is no text to keep.
 */
export type ProfileStoreInspection =
  | { readable: true; value: string | null }
  | { readable: false; raw: string | null };

export function inspectProfileStore(key: string, profileId: string): ProfileStoreInspection {
  try {
    const value = readProfileStore(key, profileId, true);
    if (value !== null) JSON.parse(value);
    return { readable: true, value };
  } catch (error) {
    console.error(`Error reading the profile's ${key}:`, error);
    return { readable: false, raw: unreadableStoreText(key, profileId) };
  }
}

function unreadableStoreText(key: string, profileId: string): string | null {
  try {
    const storage = window.localStorage;
    const address = profileStoreKey(key, profileId);
    const current = storage.getItem(address);
    if (current !== null || address === key) return current;

    const parked = storage.getItem(`profile-data:${profileId}`);
    if (parked === null) return null;
    try {
      const slot: unknown = JSON.parse(parked);
      if (slot && typeof slot === "object" && !Array.isArray(slot) &&
          Object.prototype.hasOwnProperty.call(slot, key)) {
        const field = (slot as Record<string, unknown>)[key];
        return typeof field === "string" ? field : JSON.stringify(field);
      }
    } catch {
      // The slot itself is what cannot be parsed; keep all of it.
    }
    return parked;
  } catch {
    return null;
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

/**
 * Every profile id that owns a namespaced store or a parked slot in storage,
 * whatever the roster says.
 *
 * The roster is normally the list of who exists, but not when it cannot be
 * parsed or the normalizer had to drop entries: their people still have data
 * at these addresses, and a backup or restore that trusted the repaired roster
 * left it out or left it behind. `storeKeys` limits namespaced addresses to the
 * stores a profile owns; `withContent` skips stores holding only a clear's
 * explicit "null". The original owner's bare keys are not addresses of this
 * kind – the caller knows who that is.
 */
export function profileIdsInStorage(
  storeKeys: readonly string[],
  options: { withContent?: boolean } = {},
): Set<string> {
  const ids = new Set<string>();
  const storage = window.localStorage;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key === null) continue;
    let id: string;
    if (key.startsWith(STORE_PREFIX)) {
      const rest = key.slice(STORE_PREFIX.length);
      // The id is URI-encoded, so the first colon ends it.
      const separator = rest.indexOf(":");
      if (separator <= 0 || !storeKeys.includes(rest.slice(separator + 1))) continue;
      if (options.withContent && storage.getItem(key) === "null") continue;
      try {
        id = decodeURIComponent(rest.slice(0, separator));
      } catch {
        continue;
      }
    } else if (key.startsWith(PARKED_PREFIX)) {
      id = key.slice(PARKED_PREFIX.length);
    } else {
      continue;
    }
    if (id && sanitizeProfileId(id) === id) ids.add(id);
  }
  return ids;
}

export function isProfileStoreEvent(eventKey: string | null, key: string): boolean {
  if (eventKey === null || eventKey === ACTIVE_KEY || eventKey === ROSTER_KEY ||
    eventKey.startsWith(DELETED_PROFILE_PREFIX)) return true;
  const profileId = getProfileStorageOwner();
  return eventKey === profileStoreKey(key, profileId)
    || eventKey === `profile-data:${profileId}`;
}
