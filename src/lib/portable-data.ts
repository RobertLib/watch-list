import {
  EPISODE_PROGRESS_STORAGE_KEY,
  sanitizeProgress,
  type EpisodeProgress,
} from "./episode-progress";
import { RATINGS_STORAGE_KEY, sanitizeRatings, type Ratings } from "./ratings";
import {
  COLLECTIONS_STORAGE_KEY,
  sanitizeCollections,
  type Collection,
} from "./collections";
import { RANKING_STORAGE_KEY, sanitizeRanking, type Ranking } from "./ranking";
import { GOAL_STORAGE_KEY, sanitizeGoal, type YearlyGoal } from "./goal";
import {
  DAILY_GAME_STORAGE_KEY,
  EMPTY_STATE as EMPTY_DAILY_GAME,
  sanitizeGameState,
  type DailyGameState,
} from "./daily-game";
import {
  EMPTY_RECORD as EMPTY_HIGHER_LOWER,
  HIGHER_LOWER_STORAGE_KEY,
  sanitizeRecord as sanitizeHigherLower,
  type HigherLowerRecord,
} from "./higher-lower";
import { isValidRegion } from "./region";
import {
  isWatchProviderFilter,
  sanitizeProviderIds,
  type WatchProviderFilter,
} from "./watch-provider-settings";
import {
  sanitizeTimestamp,
  sanitizeWatchedItems,
  sanitizeWatchlistItems,
} from "./media-list";
import {
  getWatchlist,
  retiredWatchlistCookieText,
  unreadableWatchlistCookieText,
  WATCHLIST_COOKIE_RECOVERY_KEY,
  WATCHLIST_STORAGE_KEY,
  type WatchlistItem,
} from "./watchlist";
import { WATCHED_STORAGE_KEY, type WatchedItem } from "./watched";
import {
  LAST_VISIT_STORAGE_KEY,
  LEGACY_LAST_VISIT_STORAGE_KEY,
  readLastVisit,
  sanitizeLastVisit,
} from "./last-visit";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  DEFAULT_PROFILE,
  DEFAULT_PROFILE_ID,
  inspectProfileSlot,
  MAX_PROFILES,
  parseStoredProfiles,
  PROFILES_STORAGE_KEY,
  recoverUnlistedProfiles,
} from "./profiles";
import {
  getLegacyProfileStorageOwner,
  getProfileStorageOwner,
  resolveProfileStorageOwner,
  sanitizeProfileId,
  sanitizeProfileName,
  withProfileStorage,
} from "./profile-storage";
import { inspectStoredSettings, type StoredSetting } from "./settings";

// The two list sanitisers live with the stores they repair – browser storage
// needs them just as much as a backup file does – and are re-exported here so a
// backup still has one import surface.
export { sanitizeWatchedItems, sanitizeWatchlistItems };

/**
 * Backup and restore for everything this app knows about a visitor.
 *
 * There is no account, so browser storage is the only copy that exists: clearing
 * site data, switching to a phone, or reinstalling a browser loses the lot. A
 * file the visitor holds is what makes that recoverable – and it is the reason a
 * lost list does not have to mean a lost visitor.
 *
 * "Everything" has to mean every profile, not just the one that happens to be
 * loaded. Each profile has stable stores (see `profile-storage.ts`), so a backup
 * built from the active profile alone silently omits the rest of the household
 * – and does it at exactly the
 * moment the visitor believes they are safe.
 */

export const BACKUP_FORMAT = "watch-list-backup";
// 2 added named lists, the pairwise ranking and the yearly goal.
// 3 added the profiles that are not active, the streaks every profile owns, and
//   the name of the profile the top-level stores belong to.
// 4 added each profile's last-visit stamp, and `unreadable`: what the export
//   could not read, with its stored text kept for recovery.
//
// Older files still restore: every field is rebuilt by its own sanitizer, so
// whatever a version did not have simply comes back empty.
export const BACKUP_VERSION = 4;

/**
 * The largest file a restore will read.
 *
 * Everything a backup carries came out of this site's localStorage, which
 * browsers cap at about five million characters for the whole site – all of
 * its profiles and settings together. Written out as UTF-8, a character takes
 * at most three bytes, and the export's indentation plus the escaping of any
 * stored text it keeps verbatim fit within twice that again. Anything larger
 * is not a file this app wrote, and reading it whole would only freeze the tab.
 */
const LOCAL_STORAGE_QUOTA_CHARACTERS = 5 * 1024 * 1024;
const MAX_UTF8_BYTES_PER_CHARACTER = 3;
const FORMATTING_HEADROOM = 2;
export const MAX_BACKUP_FILE_BYTES =
  LOCAL_STORAGE_QUOTA_CHARACTERS * MAX_UTF8_BYTES_PER_CHARACTER * FORMATTING_HEADROOM;

/** The settings half of a backup: what the profile screen writes. */
export interface PortableSettings {
  region: string | null;
  watchProviderFilter: WatchProviderFilter | null;
  /** Null when an older file did not carry a platform selection. */
  selectedProviderIds: number[] | null;
  /** Absent in older files; false preserves an untouched browser's settings. */
  hasCustomSettings?: boolean;
}

/**
 * The stores one profile owns.
 *
 * Deliberately the same list as `OWNED_KEYS` in `profiles.ts`: that is what a
 * profile switch moves, so it is exactly what a backup has to carry for a
 * profile that is not the active one. Region and platforms are not here – they
 * describe the browser rather than the person, and live at the top level.
 */
export interface PortableStores {
  watchlist: WatchlistItem[];
  watched: WatchedItem[];
  episodeProgress: EpisodeProgress;
  /** The viewer's own scores. Absent from files written before ratings existed. */
  ratings: Ratings;
  /** Named lists. Absent from version 1 files. */
  collections: Collection[];
  /** The pairwise ranking of the watchlist. Absent from version 1 files. */
  ranking: Ranking;
  /** This year's target, if one was set. */
  goal: YearlyGoal | null;
  /** Daily-puzzle history and streak. Absent from files before version 3. */
  dailyGame: DailyGameState;
  /** Best run at higher-or-lower. Absent from files before version 3. */
  higherLower: HigherLowerRecord;
  /**
   * When this profile last acknowledged "since you were last here". Absent
   * from files before version 4, which restore as a first visit.
   */
  lastVisit: string | null;
}

export const EMPTY_STORES: PortableStores = {
  watchlist: [],
  watched: [],
  episodeProgress: {},
  ratings: {},
  collections: [],
  ranking: {},
  goal: null,
  dailyGame: EMPTY_DAILY_GAME,
  higherLower: EMPTY_HIGHER_LOWER,
  lastVisit: null,
};

/** Who a set of stores belongs to. */
export interface ProfileRef {
  id: string;
  name: string;
}

export interface PortableProfile extends ProfileRef, PortableStores {}

/**
 * Something the export could not read.
 *
 * A backup is the only way out of a browser, so it carries everything that
 * can be read rather than refusing to exist over one damaged store – and says
 * exactly what is missing instead of looking complete. The stored text rides
 * along verbatim for manual recovery; a restore never writes it back, because
 * the app could not read it either.
 */
export interface UnreadableData {
  /** Whose data it is; null for the household's settings or the roster. */
  profile: ProfileRef | null;
  /**
   * What could not be read: store fields such as `watched`, settings such as
   * `settings.region`, or `profiles` for the roster. Several when they shared
   * one damaged parked slot, whose text is kept once.
   */
  stores: string[];
  /** The text as stored, or null when the browser refused to read it. */
  raw: string | null;
}

export interface PortableData extends PortableStores {
  format: string;
  version: number;
  exportedAt: string;
  /**
   * The profile the stores above belong to. Null in a version 1 or 2 file, which
   * was written before profiles could be told apart.
   */
  activeProfile: ProfileRef | null;
  /**
   * Every *other* profile in the browser this was exported from. The active one
   * is not repeated here – its stores are the top-level fields.
   */
  otherProfiles: PortableProfile[];
  settings: PortableSettings;
  /** Present only when the export could not read everything. Never restored. */
  unreadable?: UnreadableData[];
}

export interface BackupSummary {
  watchlist: number;
  watched: number;
  showsInProgress: number;
  episodes: number;
  ratings: number;
  collections: number;
  rankedTitles: number;
  /** Profiles beyond the active one. Their own counts are not broken out. */
  otherProfiles: number;
  hasSettings: boolean;
}

export function sanitizePortableSettings(input: unknown): PortableSettings {
  if (!input || typeof input !== "object") {
    return { region: null, watchProviderFilter: null, selectedProviderIds: null };
  }

  const { region, watchProviderFilter, selectedProviderIds, hasCustomSettings } = input as Record<
    string,
    unknown
  >;

  return {
    region: typeof region === "string" && isValidRegion(region) ? region : null,
    watchProviderFilter: isWatchProviderFilter(watchProviderFilter)
      ? watchProviderFilter
      : null,
    selectedProviderIds: Array.isArray(selectedProviderIds)
      ? sanitizeProviderIds(selectedProviderIds)
      : null,
    ...(typeof hasCustomSettings === "boolean" ? { hasCustomSettings } : {}),
  };
}

/**
 * A list's entries with a timestamp that is missing or not a date replaced by
 * `fallback` – except an empty one, which is how storage says "unknown".
 *
 * Storage repairs a bad timestamp to "" rather than inventing one, and every
 * view reads "" as undated: no year in the stats, the bottom of "newest first".
 * A backup used to date those entries to the export instead, so after a round
 * trip they sorted as the newest titles on the list and counted towards the
 * export's year. "" now survives the file both ways.
 */
function withFallbackTimestamps(
  input: unknown,
  key: "addedAt" | "watchedAt",
  fallback: string,
): unknown {
  if (!Array.isArray(input)) return input;
  return input.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const value = (entry as Record<string, unknown>)[key];
    if (value === "" || (typeof value === "string" && !Number.isNaN(Date.parse(value)))) {
      return entry;
    }
    return { ...entry, [key]: fallback };
  });
}

/**
 * Rebuild one profile's stores from whatever a file happens to hold.
 *
 * Every field goes through the sanitizer that owns it, so a field that is
 * missing, renamed or hand-edited comes back as that store's empty value rather
 * than reaching the app as something it cannot render. `fallbackTimestamp`
 * dates list entries that carry no timestamp at all; "" is kept as unknown.
 */
export function sanitizeStores(
  input: unknown,
  fallbackTimestamp: string,
): PortableStores {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};

  return {
    // The app allows lists beyond the standalone sanitizer's default bound.
    // A backup must preserve those lists, including parked profiles at export.
    watchlist: sanitizeWatchlistItems(
      withFallbackTimestamps(record.watchlist, "addedAt", fallbackTimestamp),
      "",
      Number.POSITIVE_INFINITY,
    ),
    watched: sanitizeWatchedItems(
      withFallbackTimestamps(record.watched, "watchedAt", fallbackTimestamp),
      "",
      Number.POSITIVE_INFINITY,
    ),
    episodeProgress: sanitizeProgress(record.episodeProgress),
    ratings: sanitizeRatings(record.ratings),
    collections: sanitizeCollections(record.collections),
    ranking: sanitizeRanking(record.ranking),
    goal: sanitizeGoal(record.goal),
    dailyGame: sanitizeGameState(record.dailyGame),
    higherLower: sanitizeHigherLower(record.higherLower),
    lastVisit: sanitizeLastVisit(record.lastVisit),
  };
}

/**
 * Cap on the *other* profiles read out of a file: the active one has the fifth
 * seat. It used to be `MAX_PROFILES` itself, which let a file promise one more
 * profile than a restore could keep – the summary counted it, the restore wrote
 * its slot, and the roster then dropped it.
 */
const MAX_PORTABLE_PROFILES = MAX_PROFILES - 1;

/**
 * The other profiles a file carries, bounded to what a restore can keep.
 *
 * `excludeId` is the active profile's: a file that repeats it under
 * `otherProfiles` has it dropped *before* the cap counts, so the repeat costs
 * nobody their seat. Filtering afterwards – which is what this used to do – let
 * the duplicate take a place and a real profile lose one.
 */
export function sanitizePortableProfiles(
  input: unknown,
  fallbackTimestamp: string,
  excludeId?: string,
): PortableProfile[] {
  if (!Array.isArray(input)) return [];

  const profiles: PortableProfile[] = [];
  const seen = new Set<string>();

  for (const entry of input) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

    const record = entry as Record<string, unknown>;
    const id = sanitizeProfileId(record.id);
    const name = sanitizeProfileName(record.name);

    // A profile with no id cannot be parked anywhere, and one with no name has
    // nothing to show in the switcher. Either way it is not a profile.
    if (!id || !name || seen.has(id) || id === excludeId) continue;
    seen.add(id);

    profiles.push({ id, name, ...sanitizeStores(record, fallbackTimestamp) });
    if (profiles.length >= MAX_PORTABLE_PROFILES) break;
  }

  return profiles;
}

function sanitizeProfileRef(input: unknown): ProfileRef | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const record = input as Record<string, unknown>;
  const id = sanitizeProfileId(record.id);
  const name = sanitizeProfileName(record.name);

  return id && name ? { id, name } : null;
}

export function buildBackup(parts: {
  stores: PortableStores;
  activeProfile: ProfileRef | null;
  otherProfiles: PortableProfile[];
  settings: PortableSettings;
  exportedAt: string;
}): PortableData {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: parts.exportedAt,
    ...parts.stores,
    activeProfile: parts.activeProfile,
    otherProfiles: parts.otherProfiles,
    settings: parts.settings,
  };
}

/**
 * Read a file back, or return null when it is not one of ours.
 *
 * A newer `version` is still accepted: every field is rebuilt by a sanitizer
 * anyway, so a file from a later release loses whatever this build does not
 * understand instead of being refused outright.
 */
export function parseBackup(input: unknown): PortableData | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const record = input as Record<string, unknown>;
  if (record.format !== BACKUP_FORMAT) return null;

  const version = typeof record.version === "number" || typeof record.version === "string"
    ? Number(record.version)
    : Number.NaN;
  const exportedAt = sanitizeTimestamp(record.exportedAt, "");

  // Entries with no timestamp of their own are dated to the export, which keeps
  // them in a sensible place in a list sorted newest-first.
  const fallbackTimestamp = exportedAt || new Date(0).toISOString();

  const activeProfile = sanitizeProfileRef(record.activeProfile);
  const otherProfiles = sanitizePortableProfiles(
    record.otherProfiles,
    fallbackTimestamp,
    activeProfile?.id,
  );

  // The restore always includes the default profile. Reserve its seat before
  // showing the confirmation, rather than promising a profile the restore
  // would silently drop. An omitted default starts empty, never with this
  // browser's old parked data. A full roster without that seat cannot fit.
  if (!activeProfile && otherProfiles.length > 0) return null;
  if (
    activeProfile &&
    activeProfile.id !== DEFAULT_PROFILE_ID &&
    !otherProfiles.some((profile) => profile.id === DEFAULT_PROFILE_ID)
  ) {
    if (otherProfiles.length >= MAX_PORTABLE_PROFILES) return null;
    otherProfiles.unshift({ ...DEFAULT_PROFILE, ...sanitizeStores({}, fallbackTimestamp) });
  }

  return {
    format: BACKUP_FORMAT,
    version: Number.isFinite(version) ? version : BACKUP_VERSION,
    exportedAt,
    ...sanitizeStores(record, fallbackTimestamp),
    activeProfile,
    otherProfiles,
    settings: sanitizePortableSettings(record.settings),
  };
}

function countEpisodes(progress: EpisodeProgress): number {
  return Object.values(progress).reduce(
    (total, show) =>
      total +
      Object.values(show.seasons).reduce(
        (count, episodes) => count + episodes.length,
        0,
      ),
    0,
  );
}

export function summarizeBackup(data: PortableData): BackupSummary {
  return {
    watchlist: data.watchlist.length,
    watched: data.watched.length,
    showsInProgress: Object.keys(data.episodeProgress).length,
    episodes: countEpisodes(data.episodeProgress),
    ratings: Object.keys(data.ratings).length,
    collections: data.collections.length,
    rankedTitles: Object.keys(data.ranking).length,
    otherProfiles: data.otherProfiles.length,
    hasSettings:
      data.settings.region !== null ||
      data.settings.watchProviderFilter !== null ||
      data.settings.selectedProviderIds !== null ||
      data.settings.hasCustomSettings !== undefined,
  };
}

/**
 * The bridge between a backup and a dormant profile's storage slot.
 *
 * A parked profile is held as the raw JSON strings each store wrote, keyed by
 * the same storage key it uses when live – so moving between that and the
 * structured form a backup carries is a parse or a stringify per store, and
 * nothing else. Keeping both directions here means `profiles.ts` never has to
 * know what a backup looks like, and the component never has to know what a slot
 * looks like.
 */
const SLOT_KEYS = {
  watchlist: WATCHLIST_STORAGE_KEY,
  watched: WATCHED_STORAGE_KEY,
  episodeProgress: EPISODE_PROGRESS_STORAGE_KEY,
  ratings: RATINGS_STORAGE_KEY,
  collections: COLLECTIONS_STORAGE_KEY,
  ranking: RANKING_STORAGE_KEY,
  goal: GOAL_STORAGE_KEY,
  dailyGame: DAILY_GAME_STORAGE_KEY,
  higherLower: HIGHER_LOWER_STORAGE_KEY,
  lastVisit: LAST_VISIT_STORAGE_KEY,
} as const satisfies Record<keyof PortableStores, string>;

/** What each store is called where a person reads about it. */
const STORE_LABELS: Record<keyof PortableStores, string> = {
  watchlist: "watchlist",
  watched: "watched list",
  episodeProgress: "episode progress",
  ratings: "ratings",
  collections: "named lists",
  ranking: "ranking",
  goal: "yearly goal",
  dailyGame: "daily puzzle history",
  higherLower: "higher-or-lower record",
  lastVisit: "last-visit date",
};

/** An unreadable legacy watchlist cookie whose text storage kept. */
const RETIRED_COOKIE_STORE = "legacyWatchlistCookie";

const OTHER_LABELS: Record<string, string> = {
  "settings.region": "region setting",
  "settings.watchProviderFilter": "what-to-show setting",
  "settings.selectedProviderIds": "platform selection",
  "settings.hasCustomSettings": "record of changed settings",
  profiles: "profile list",
  [RETIRED_COOKIE_STORE]: "older saved watchlist",
};

/** The person-facing name of a store, from its storage key; undefined if not a store. */
export function storeLabelForKey(key: string): string | undefined {
  if (key === LEGACY_LAST_VISIT_STORAGE_KEY) return STORE_LABELS.lastVisit;
  if (key === WATCHLIST_COOKIE_RECOVERY_KEY) return OTHER_LABELS[RETIRED_COOKIE_STORE];
  const field = (Object.keys(SLOT_KEYS) as (keyof PortableStores)[])
    .find((candidate) => SLOT_KEYS[candidate] === key);
  return field ? STORE_LABELS[field] : undefined;
}

function joinLabels(labels: string[]): string {
  return labels.length < 2
    ? labels.join("")
    : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/** `watched list for "Sam"`, `the region setting` – one line per unreadable entry. */
export function describeUnreadable(entry: UnreadableData): string {
  const labels = joinLabels(entry.stores.map((store) =>
    STORE_LABELS[store as keyof PortableStores] ?? OTHER_LABELS[store] ?? store));
  return entry.profile ? `${labels} for "${entry.profile.name}"` : `the ${labels}`;
}

/**
 * Export the active stores from storage, without the UI getters' empty fallback.
 * An absent store is valid; a refused read or broken serialization throws
 * rather than making its only saved copy look empty. The backup itself uses
 * `readBackupSnapshot`, which names such a store instead of failing outright.
 */
export function readStoredStores(fallbackTimestamp: string): PortableStores {
  const owner = getProfileStorageOwner();
  const unreadable: UnreadableData[] = [];
  const stores = readProfileStores({ id: owner, name: owner }, fallbackTimestamp, unreadable);
  if (unreadable.length > 0) {
    throw new Error(`Unreadable stored data: ${unreadable.flatMap((entry) => entry.stores).join(", ")}`);
  }
  return stores;
}

/**
 * One profile's stores for a backup. Whatever cannot be read is recorded in
 * `unreadable` and comes back as that store's empty value.
 */
function readProfileStores(
  profile: ProfileRef,
  fallbackTimestamp: string,
  unreadable: UnreadableData[],
): PortableStores {
  const { slot, unreadable: failed } = inspectProfileSlot(profile.id);
  const stores = { ...storesFromSlot(slot, fallbackTimestamp) };

  // The original owner may still have data only in pre-profile storage: the
  // watchlist cookie, whose migration a refusing browser keeps retrying, and
  // the shared last-visit stamp. A malformed cookie is named, never exported
  // as an empty list.
  withProfileStorage(profile.id, () => {
    if (slot[WATCHLIST_STORAGE_KEY] === undefined && !(WATCHLIST_STORAGE_KEY in failed)) {
      try {
        stores.watchlist = sanitizeWatchlistItems(
          getWatchlist({ strict: true }), fallbackTimestamp, Number.POSITIVE_INFINITY,
        );
      } catch (error) {
        console.error("Error reading the legacy watchlist for a backup:", error);
        // The cookie's own text when it is what could not be parsed: null
        // would tell the visitor the browser refused a read it never refused.
        failed[WATCHLIST_STORAGE_KEY] = unreadableWatchlistCookieText();
      }
    }
    if (profile.id === getLegacyProfileStorageOwner()) {
      // An unreadable cookie's text, kept once the list moved on without it.
      try {
        const kept = retiredWatchlistCookieText();
        if (kept !== null) {
          unreadable.push({ profile: { id: profile.id, name: profile.name }, stores: [RETIRED_COOKIE_STORE], raw: kept });
        }
      } catch (error) {
        console.error("Error reading an unreadable legacy watchlist for a backup:", error);
        unreadable.push({ profile: { id: profile.id, name: profile.name }, stores: [RETIRED_COOKIE_STORE], raw: null });
      }
    }
    if (slot[LAST_VISIT_STORAGE_KEY] === undefined && !(LAST_VISIT_STORAGE_KEY in failed)) {
      try {
        stores.lastVisit = readLastVisit(profile.id);
      } catch (error) {
        console.error("Error reading the last visit for a backup:", error);
        failed[LAST_VISIT_STORAGE_KEY] = null;
      }
    }
  });

  // Stores that fell back to one damaged parked slot share its text; keep it
  // once. Refused reads, with no text at all, are listed together too.
  const fields = Object.keys(SLOT_KEYS) as (keyof PortableStores)[];
  for (const field of fields) {
    const key = SLOT_KEYS[field];
    if (!(key in failed)) continue;
    const raw = failed[key];
    const shared = unreadable.find((entry) =>
      entry.profile?.id === profile.id && entry.raw === raw);
    if (shared) shared.stores.push(field);
    else unreadable.push({ profile: { id: profile.id, name: profile.name }, stores: [field], raw });
  }

  return stores;
}

/** Settings for a backup: valid ones as values, the rest named and left null. */
function readSettings(unreadable: UnreadableData[]): PortableSettings {
  const inspected = inspectStoredSettings();
  const value = <T>(name: keyof typeof inspected, setting: StoredSetting<T>): T | null => {
    if (setting.readable) return setting.value;
    unreadable.push({ profile: null, stores: [`settings.${name}`], raw: setting.raw });
    return null;
  };

  const configured = value("hasCustomSettings", inspected.hasCustomSettings);
  return {
    // A null restores nothing, so the destination keeps its own value rather
    // than adopting one this browser could not read.
    region: value("region", inspected.region),
    watchProviderFilter: value("watchProviderFilter", inspected.watchProviderFilter),
    selectedProviderIds: value("selectedProviderIds", inspected.selectedProviderIds),
    ...(configured === null ? {} : { hasCustomSettings: configured }),
  };
}

/**
 * Everything this browser holds, as one backup. Call it with the roster lock
 * held, so the snapshot cannot mix two generations of a restore or an edit.
 *
 * The roster, the active pointer and the legacy owner marker decide whose data
 * is whose, so a refused read of any of them still stops the export. Anything
 * else that cannot be read – a store, a parked slot, a setting, roster entries
 * the app itself repairs away – is listed in `unreadable` with its stored text
 * and the rest is exported. Refusing the whole file over one damaged field
 * left the visitor no copy of anything, and no way out of the browser at all.
 */
export function readBackupSnapshot(exportedAt: string): PortableData {
  const storage = window.localStorage;
  const unreadable: UnreadableData[] = [];

  // Throws on a refused read or a corrupt marker: no store address is knowable.
  getLegacyProfileStorageOwner();

  const rosterText = storage.getItem(PROFILES_STORAGE_KEY);
  const { profiles, canonical } = parseStoredProfiles(rosterText);
  // The export uses the roster the app shows, and keeps what it had to drop.
  if (!canonical) unreadable.push({ profile: null, stores: ["profiles"], raw: rosterText });

  const pointer = storage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
  let activeId = DEFAULT_PROFILE_ID;
  try {
    activeId = resolveProfileStorageOwner(pointer || DEFAULT_PROFILE_ID);
  } catch {
    // An unparseable roster lists only the default profile, which is also the
    // owner every reader falls back to.
  }
  const active = profiles.find((profile) => profile.id === activeId);
  if (!active) throw new Error("The active profile is absent from the stored roster");

  // A roster the app had to repair no longer names everybody with data here.
  // Those people are found from their stores and carried too, rather than left
  // out of the one copy that would let a restore bring them back.
  const everyone = canonical
    ? profiles
    : [...profiles, ...recoverUnlistedProfiles(rosterText, profiles)];

  // Read as storage holds them: an entry storage could not date stays undated
  // ("") in the file, as it is everywhere in the app – never dated to the export.
  const stores = readProfileStores(active, "", unreadable);
  const otherProfiles = everyone
    .filter((profile) => profile.id !== active.id)
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      ...readProfileStores(profile, "", unreadable),
    }));

  const backup = buildBackup({
    stores,
    activeProfile: { id: active.id, name: active.name },
    otherProfiles,
    settings: readSettings(unreadable),
    exportedAt,
  });
  return unreadable.length > 0 ? { ...backup, unreadable } : backup;
}

function parseSlotValue(
  slot: Record<string, string>,
  key: string,
): unknown {
  const raw = slot[key];
  if (typeof raw !== "string") return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    // A slot is as hand-editable as any other storage entry, and one unparseable
    // store must not cost the profile the other eight.
    return undefined;
  }
}

/** A parked profile's slot, as the stores a backup carries. */
export function storesFromSlot(
  slot: unknown,
  fallbackTimestamp: string,
): PortableStores {
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
    return EMPTY_STORES;
  }

  const raw = slot as Record<string, string>;

  return sanitizeStores(
    {
      watchlist: parseSlotValue(raw, SLOT_KEYS.watchlist),
      watched: parseSlotValue(raw, SLOT_KEYS.watched),
      episodeProgress: parseSlotValue(raw, SLOT_KEYS.episodeProgress),
      ratings: parseSlotValue(raw, SLOT_KEYS.ratings),
      collections: parseSlotValue(raw, SLOT_KEYS.collections),
      ranking: parseSlotValue(raw, SLOT_KEYS.ranking),
      goal: parseSlotValue(raw, SLOT_KEYS.goal),
      dailyGame: parseSlotValue(raw, SLOT_KEYS.dailyGame),
      higherLower: parseSlotValue(raw, SLOT_KEYS.higherLower),
      lastVisit: parseSlotValue(raw, SLOT_KEYS.lastVisit),
    },
    fallbackTimestamp,
  );
}

/** The reverse: raw store values for profile-aware restore. */
export function storesToSlot(stores: PortableStores): Record<string, string> {
  const slot: Record<string, string> = {};

  for (const [field, key] of Object.entries(SLOT_KEYS)) {
    const value = stores[field as keyof PortableStores];

    // A null goal is stored as an absent key rather than as "null", which is
    // what `saveGoal` does with it in the live keys.
    if (value === null || value === undefined) continue;

    slot[key] = JSON.stringify(value);
  }

  return slot;
}

/** `watchlist-backup-2026-08-01.json` */
export function backupFilename(exportedAt: string): string {
  const date = Number.isNaN(Date.parse(exportedAt))
    ? "export"
    : exportedAt.slice(0, 10);

  return `watchlist-backup-${date}.json`;
}
