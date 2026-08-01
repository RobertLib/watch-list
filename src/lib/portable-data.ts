import { sanitizeProgress, type EpisodeProgress } from "./episode-progress";
import { sanitizeRatings, type Ratings } from "./ratings";
import { sanitizeCollections, type Collection } from "./collections";
import { sanitizeRanking, type Ranking } from "./ranking";
import { sanitizeGoal, type YearlyGoal } from "./goal";
import { isValidRegion } from "./region";
import {
  isWatchProviderFilter,
  sanitizeProviderIds,
  type WatchProviderFilter,
} from "./watch-provider-settings";
import type { MediaType } from "@/types/tmdb";
import type { WatchlistItem } from "./watchlist";
import type { WatchedItem } from "./watched";

/**
 * Backup and restore for everything this app knows about a visitor.
 *
 * There is no account, so browser storage is the only copy that exists: clearing
 * site data, switching to a phone, or reinstalling a browser loses the lot. A
 * file the visitor holds is what makes that recoverable – and it is the reason a
 * lost list does not have to mean a lost visitor.
 */

export const BACKUP_FORMAT = "watch-list-backup";
// 2 added named lists, the pairwise ranking and the yearly goal. A version 1
// file still restores: every field is rebuilt by its own sanitizer, and the
// three new ones simply come back empty.
export const BACKUP_VERSION = 2;

/** Profile settings live in httpOnly cookies, so the server has to supply them. */
export interface PortableSettings {
  region: string | null;
  watchProviderFilter: WatchProviderFilter | null;
  selectedProviderIds: number[];
}

export interface PortableData {
  format: string;
  version: number;
  exportedAt: string;
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
  hasSettings: boolean;
}

// A file is chosen by hand, so nothing here is a hostile payload by default –
// but it is still arbitrary JSON, and one malformed entry would otherwise be
// written straight back into storage and crash every later render.
const MAX_ITEMS_PER_LIST = 2000;
const MAX_TITLE_LENGTH = 200;

function sanitizeMediaType(value: unknown): MediaType | null {
  return value === "movie" || value === "tv" ? value : null;
}

function sanitizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return Number.isNaN(Date.parse(value)) ? fallback : value;
}

/**
 * Both saved lists have the same shape apart from the name of their timestamp,
 * so one walker covers them – with the timestamp key passed in rather than the
 * two functions kept in sync by hand.
 */
function sanitizeItems<K extends string>(
  input: unknown,
  timestampKey: K,
  fallbackTimestamp: string,
): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const items: Array<Record<string, unknown>> = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const id = record.id;
    const mediaType = sanitizeMediaType(record.mediaType);

    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) continue;
    if (!mediaType) continue;

    const key = `${mediaType}-${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const voteAverage = Number(record.voteAverage);

    items.push({
      id,
      mediaType,
      title:
        typeof record.title === "string"
          ? record.title.slice(0, MAX_TITLE_LENGTH)
          : "",
      posterPath:
        typeof record.posterPath === "string" ? record.posterPath : null,
      voteAverage: Number.isFinite(voteAverage) ? voteAverage : 0,
      releaseDate:
        typeof record.releaseDate === "string" ? record.releaseDate : "",
      [timestampKey]: sanitizeTimestamp(
        record[timestampKey],
        fallbackTimestamp,
      ),
    });

    if (items.length >= MAX_ITEMS_PER_LIST) break;
  }

  return items;
}

export function sanitizeWatchlistItems(
  input: unknown,
  fallbackTimestamp: string,
): WatchlistItem[] {
  return sanitizeItems(
    input,
    "addedAt",
    fallbackTimestamp,
  ) as unknown as WatchlistItem[];
}

export function sanitizeWatchedItems(
  input: unknown,
  fallbackTimestamp: string,
): WatchedItem[] {
  return sanitizeItems(
    input,
    "watchedAt",
    fallbackTimestamp,
  ) as unknown as WatchedItem[];
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
    region:
      typeof region === "string" && isValidRegion(region) ? region : null,
    watchProviderFilter: isWatchProviderFilter(watchProviderFilter)
      ? watchProviderFilter
      : null,
    selectedProviderIds: sanitizeProviderIds(selectedProviderIds),
  };
}

export function buildBackup(parts: {
  watchlist: WatchlistItem[];
  watched: WatchedItem[];
  episodeProgress: EpisodeProgress;
  ratings: Ratings;
  collections: Collection[];
  ranking: Ranking;
  goal: YearlyGoal | null;
  settings: PortableSettings;
  exportedAt: string;
}): PortableData {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: parts.exportedAt,
    watchlist: parts.watchlist,
    watched: parts.watched,
    episodeProgress: parts.episodeProgress,
    ratings: parts.ratings,
    collections: parts.collections,
    ranking: parts.ranking,
    goal: parts.goal,
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

  return {
    format: BACKUP_FORMAT,
    version: Number.isFinite(version) ? version : BACKUP_VERSION,
    exportedAt,
    watchlist: sanitizeWatchlistItems(record.watchlist, fallbackTimestamp),
    watched: sanitizeWatchedItems(record.watched, fallbackTimestamp),
    episodeProgress: sanitizeProgress(record.episodeProgress),
    ratings: sanitizeRatings(record.ratings),
    // Absent from a version 1 file, which each sanitizer reads as "nothing".
    collections: sanitizeCollections(record.collections),
    ranking: sanitizeRanking(record.ranking),
    goal: sanitizeGoal(record.goal),
    settings: sanitizePortableSettings(record.settings),
  };
}

export function summarizeBackup(data: PortableData): BackupSummary {
  const shows = Object.values(data.episodeProgress);

  return {
    watchlist: data.watchlist.length,
    watched: data.watched.length,
    showsInProgress: shows.length,
    episodes: shows.reduce(
      (total, show) =>
        total +
        Object.values(show.seasons).reduce(
          (count, episodes) => count + episodes.length,
          0,
        ),
      0,
    ),
    ratings: Object.keys(data.ratings).length,
    collections: data.collections.length,
    rankedTitles: Object.keys(data.ranking).length,
    hasSettings:
      data.settings.region !== null ||
      data.settings.watchProviderFilter !== null ||
      data.settings.selectedProviderIds.length > 0,
  };
}

/** `watchlist-backup-2026-08-01.json` */
export function backupFilename(exportedAt: string): string {
  const date = Number.isNaN(Date.parse(exportedAt))
    ? "export"
    : exportedAt.slice(0, 10);

  return `watchlist-backup-${date}.json`;
}
