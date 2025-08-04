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
import { WATCHLIST_STORAGE_KEY, type WatchlistItem } from "./watchlist";
import { WATCHED_STORAGE_KEY, type WatchedItem } from "./watched";

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
 * loaded. A profile that is not active has its stores parked in a slot rather
 * than in the live keys (see `profiles.ts`), so a backup built from the live keys
 * alone silently omits the rest of the household – and does it at exactly the
 * moment the visitor believes they are safe.
 */

export const BACKUP_FORMAT = "watch-list-backup";
// 2 added named lists, the pairwise ranking and the yearly goal.
// 3 added the profiles that are not active, the streaks every profile owns, and
//   the name of the profile the top-level stores belong to.
//
// Older files still restore: every field is rebuilt by its own sanitizer, so
// whatever a version did not have simply comes back empty.
export const BACKUP_VERSION = 3;

/** The settings half of a backup: what the profile screen writes. */
export interface PortableSettings {
  region: string | null;
  watchProviderFilter: WatchProviderFilter | null;
  selectedProviderIds: number[];
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
};

/** Who a set of stores belongs to. */
export interface ProfileRef {
  id: string;
  name: string;
}

export interface PortableProfile extends ProfileRef, PortableStores {}

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
    return { region: null, watchProviderFilter: null, selectedProviderIds: [] };
  }

  const { region, watchProviderFilter, selectedProviderIds } = input as Record<
    string,
    unknown
  >;

  return {
    region: typeof region === "string" && isValidRegion(region) ? region : null,
    watchProviderFilter: isWatchProviderFilter(watchProviderFilter)
      ? watchProviderFilter
      : null,
    selectedProviderIds: sanitizeProviderIds(selectedProviderIds),
  };
}

/**
 * Rebuild one profile's stores from whatever a file happens to hold.
 *
 * Every field goes through the sanitizer that owns it, so a field that is
 * missing, renamed or hand-edited comes back as that store's empty value rather
 * than reaching the app as something it cannot render.
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
    watchlist: sanitizeWatchlistItems(record.watchlist, fallbackTimestamp),
    watched: sanitizeWatchedItems(record.watched, fallbackTimestamp),
    episodeProgress: sanitizeProgress(record.episodeProgress),
    ratings: sanitizeRatings(record.ratings),
    collections: sanitizeCollections(record.collections),
    ranking: sanitizeRanking(record.ranking),
    goal: sanitizeGoal(record.goal),
    dailyGame: sanitizeGameState(record.dailyGame),
    higherLower: sanitizeHigherLower(record.higherLower),
  };
}

/** Cap on profiles read out of a file, matching `MAX_PROFILES`. */
const MAX_PORTABLE_PROFILES = 5;

function sanitizeProfileName(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\p{C}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

export function sanitizePortableProfiles(
  input: unknown,
  fallbackTimestamp: string,
): PortableProfile[] {
  if (!Array.isArray(input)) return [];

  const profiles: PortableProfile[] = [];
  const seen = new Set<string>();

  for (const entry of input) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.slice(0, 64) : "";
    const name = sanitizeProfileName(record.name);

    // A profile with no id cannot be parked anywhere, and one with no name has
    // nothing to show in the switcher. Either way it is not a profile.
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);

    profiles.push({ id, name, ...sanitizeStores(record, fallbackTimestamp) });
    if (profiles.length >= MAX_PORTABLE_PROFILES) break;
  }

  return profiles;
}

function sanitizeProfileRef(input: unknown): ProfileRef | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const record = input as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.slice(0, 64) : "";
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

  const version = Number(record.version);
  const exportedAt = sanitizeTimestamp(record.exportedAt, "");

  // Entries with no timestamp of their own are dated to the export, which keeps
  // them in a sensible place in a list sorted newest-first.
  const fallbackTimestamp = exportedAt || new Date(0).toISOString();

  const activeProfile = sanitizeProfileRef(record.activeProfile);
  const otherProfiles = sanitizePortableProfiles(
    record.otherProfiles,
    fallbackTimestamp,
  ).filter((profile) => profile.id !== activeProfile?.id);

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
      data.settings.selectedProviderIds.length > 0,
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
} as const satisfies Record<keyof PortableStores, string>;

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
    },
    fallbackTimestamp,
  );
}

/** The reverse, ready to be written into `profile-data:<id>`. */
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
