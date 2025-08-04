import type { MediaType } from "@/types/tmdb";
import type { WatchlistItem } from "./watchlist";
import type { WatchedItem } from "./watched";

/**
 * What the watchlist and the watched list have in common.
 *
 * The two stores hold the same record under two different timestamp names, so
 * the repair walker and the result of a write both live here rather than being
 * written twice and drifting. The sanitisers used to sit in `portable-data.ts`
 * because a backup file was the only hostile input they had to face; they are
 * here now because browser storage is one too – it is hand-editable, it survives
 * a downgrade, and it is the input every render depends on.
 */

/**
 * How a write to a saved list ended.
 *
 * A boolean could not say this. `false` used to mean "already on the list", and
 * a refused write – a browser out of quota, or one in a mode that stores nothing
 * – returned `true` regardless, so the UI reported a save that never happened.
 */
export type ListWriteResult = "ok" | "duplicate" | "failed";

/**
 * What to tell someone whose write came back "failed".
 *
 * Shared so the four buttons that can hit it say the same thing. There is no
 * retry to offer and nowhere else to put the list, so the message names the
 * cause rather than pretending the click did something.
 */
export const STORAGE_REFUSED_MESSAGE =
  "Your browser would not save that. Check its storage settings.";

// A backup file is chosen by hand, so nothing here is a hostile payload by
// default – but it is still arbitrary JSON, and one malformed entry would
// otherwise be written straight back into storage and crash every later render.
export const MAX_ITEMS_PER_LIST = 2000;
const MAX_TITLE_LENGTH = 200;

/**
 * The bound for reading a list the app itself wrote.
 *
 * Deliberately not `MAX_ITEMS_PER_LIST`: a cap applied on *read* is applied
 * again on the next write, so a list past the limit would be silently truncated
 * and then saved that way. A file being imported is bounded because its size is
 * someone else's choice; the visitor's own list is not.
 */
const NO_LIMIT = Number.POSITIVE_INFINITY;

function sanitizeMediaType(value: unknown): MediaType | null {
  return value === "movie" || value === "tv" ? value : null;
}

export function sanitizeTimestamp(value: unknown, fallback: string): string {
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
  maxItems: number,
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

    if (items.length >= maxItems) break;
  }

  return items;
}

export function sanitizeWatchlistItems(
  input: unknown,
  fallbackTimestamp: string,
  maxItems: number = MAX_ITEMS_PER_LIST,
): WatchlistItem[] {
  return sanitizeItems(
    input,
    "addedAt",
    fallbackTimestamp,
    maxItems,
  ) as unknown as WatchlistItem[];
}

export function sanitizeWatchedItems(
  input: unknown,
  fallbackTimestamp: string,
  maxItems: number = MAX_ITEMS_PER_LIST,
): WatchedItem[] {
  return sanitizeItems(
    input,
    "watchedAt",
    fallbackTimestamp,
    maxItems,
  ) as unknown as WatchedItem[];
}

/** The read path: repair what storage holds, without ever dropping the tail. */
export function sanitizeStoredWatchlist(input: unknown): WatchlistItem[] {
  return sanitizeWatchlistItems(input, "", NO_LIMIT);
}

export function sanitizeStoredWatched(input: unknown): WatchedItem[] {
  return sanitizeWatchedItems(input, "", NO_LIMIT);
}
