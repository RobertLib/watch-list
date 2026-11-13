/**
 * What an import is about to do, counted before anything is looked up – and
 * the cut that keeps a very large one to a size that can be.
 */

import type { ImportEntry } from "./types";

export interface ImportSummary {
  /** Titles that would go on the watchlist. */
  toWatch: number;
  /** Titles that would go into the watched history. */
  watched: number;
  ratings: number;
  /** Series with ticked episodes, and how many episodes. */
  shows: number;
  episodes: number;
}

function isWatched(entry: ImportEntry): boolean {
  return Boolean(entry.watched) || entry.rating !== undefined;
}

export function summariseEntries(entries: ImportEntry[]): ImportSummary {
  const summary: ImportSummary = { toWatch: 0, watched: 0, ratings: 0, shows: 0, episodes: 0 };
  for (const entry of entries) {
    const episodes = entry.episodes?.length ?? 0;
    if (isWatched(entry)) summary.watched++;
    else if ((entry.watchlist || entry.followed) && episodes === 0) summary.toWatch++;
    if (entry.rating !== undefined) summary.ratings++;
    if (episodes > 0) {
      summary.shows++;
      summary.episodes += episodes;
    }
  }
  return summary;
}

/**
 * The most titles one import looks up.
 *
 * Every title is a request to TMDB, and the lists they go into hold two
 * thousand each – so past this an import would spend minutes matching titles
 * it then has no room to store.
 */
export const MAX_IMPORT_TITLES = 5000;

/**
 * The entries to look up when there are more than can be: what the visitor
 * means to watch first (a watchlist is the reason to move at all), then
 * series in progress, then what they scored, then the rest of the history,
 * most recent first.
 */
export function capEntries(
  entries: ImportEntry[],
  limit: number = MAX_IMPORT_TITLES,
): { entries: ImportEntry[]; dropped: number } {
  if (entries.length <= limit) return { entries, dropped: 0 };

  const rank = (entry: ImportEntry) => {
    if (!isWatched(entry) && (entry.watchlist || entry.followed)) return 0;
    if (entry.episodes?.length) return 1;
    if (entry.rating !== undefined) return 2;
    return 3;
  };
  const date = (entry: ImportEntry) => entry.watchedAt ?? entry.ratedAt ?? entry.watchlistAt ?? "";

  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        rank(a.entry) - rank(b.entry) ||
        (date(a.entry) < date(b.entry) ? 1 : date(a.entry) > date(b.entry) ? -1 : 0) ||
        a.index - b.index,
    );

  return {
    entries: ordered.slice(0, limit).map(({ entry }) => entry),
    dropped: entries.length - limit,
  };
}
