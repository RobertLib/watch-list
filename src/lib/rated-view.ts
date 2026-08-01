import type { MediaType } from "@/types/tmdb";
import type { Ratings } from "./ratings";

/**
 * The scores, read as a list in their own right.
 *
 * This deliberately does not go through the watchlist or the watched list. Rating
 * something adds it to watched, but nothing removes the score when the title
 * leaves that list again – clearing the watched tab, or restoring a backup taken
 * at a different moment, both leave scores with nothing to hang off. Those are
 * exactly the ones a "what have I rated" page has to show, so the ratings store
 * is the only honest source for it.
 *
 * The store holds a score and a date and nothing else: no title, no poster. Those
 * are resolved from TMDB by id, the same way a shared list is.
 */

export interface RatedRef {
  id: number;
  mediaType: MediaType;
  rating: number;
  /** ISO timestamp, or an empty string on entries written before it was kept. */
  ratedAt: string;
}

export type RatedSort = "score" | "recent" | "lowest";

export const RATED_SORT_LABELS: Record<RatedSort, string> = {
  score: "Highest score",
  lowest: "Lowest score",
  recent: "Recently rated",
};

export function isRatedSort(value: unknown): value is RatedSort {
  return value === "score" || value === "recent" || value === "lowest";
}

/** Each entry costs one cached TMDB read, so the page resolves a bounded slice. */
export const MAX_RATED_SHOWN = 200;

/**
 * Turn the stored map into a list.
 *
 * Keys carry the media type as well as the id – TMDB numbers films and shows
 * separately – and anything unrecognisable is skipped rather than guessed at.
 */
export function ratedRefs(ratings: Ratings): RatedRef[] {
  const refs: RatedRef[] = [];

  for (const [key, value] of Object.entries(ratings)) {
    const match = /^(movie|tv)-(\d+)$/.exec(key);
    if (!match) continue;

    const id = Number(match[2]);
    if (!Number.isSafeInteger(id) || id <= 0) continue;

    refs.push({
      id,
      mediaType: match[1] as MediaType,
      rating: value.rating,
      ratedAt: value.ratedAt,
    });
  }

  return refs;
}

/**
 * Sort a copy, never in place.
 *
 * Every comparison falls back to the id so two titles scored the same on the same
 * day keep a stable order instead of shuffling between renders.
 */
export function sortRated(refs: RatedRef[], sort: RatedSort): RatedRef[] {
  const byId = (a: RatedRef, b: RatedRef) => a.id - b.id;

  return [...refs].sort((a, b) => {
    switch (sort) {
      case "lowest":
        return a.rating - b.rating || byId(a, b);
      case "recent":
        // An entry with no date sorts last rather than first: an empty string
        // would otherwise win every comparison against a real timestamp.
        if (a.ratedAt === b.ratedAt) return byId(a, b);
        if (!a.ratedAt) return 1;
        if (!b.ratedAt) return -1;
        return b.ratedAt.localeCompare(a.ratedAt);
      case "score":
      default:
        return b.rating - a.rating || byId(a, b);
    }
  });
}

export interface RatedSummary {
  total: number;
  films: number;
  series: number;
  average: number | null;
}

export function summarizeRated(refs: RatedRef[]): RatedSummary {
  if (refs.length === 0) {
    return { total: 0, films: 0, series: 0, average: null };
  }

  let films = 0;
  let total = 0;

  for (const ref of refs) {
    if (ref.mediaType === "movie") films += 1;
    total += ref.rating;
  }

  return {
    total: refs.length,
    films,
    series: refs.length - films,
    average: total / refs.length,
  };
}
