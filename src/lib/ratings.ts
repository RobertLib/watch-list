"use client";

import { mediaItemKey } from "./utils";
import type { MediaType } from "@/types/tmdb";

/**
 * The viewer's own score for a title, out of ten.
 *
 * Kept apart from the watched list rather than added as a field on it: the watched
 * list has a stored shape that the backup format already rebuilds field by field,
 * and a score outlives being on any list. It is also the one signal the
 * recommender has about what someone actually *liked*, as opposed to what they
 * merely saved – TMDB's average says what everyone else thought.
 */

export const RATINGS_STORAGE_KEY = "ratings";

export const MIN_RATING = 1;
export const MAX_RATING = 10;

export interface Rating {
  rating: number;
  ratedAt: string;
}

/** Keyed by `${mediaType}-${id}`. */
export type Ratings = Record<string, Rating>;

const EMPTY: Ratings = {};

export function isRatingValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_RATING &&
    value <= MAX_RATING
  );
}

/**
 * Rebuild stored scores from the fields we understand. A score someone took the
 * trouble to give is worth keeping, so each entry is repaired or dropped on its
 * own rather than the whole record being discarded.
 */
export function sanitizeRatings(input: unknown): Ratings {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const result: Ratings = {};

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    // The key carries the media type as well as the id, and both have to be
    // recognisable for the entry to be addressable at all.
    if (!/^(movie|tv)-\d+$/.test(key)) continue;
    if (!value || typeof value !== "object") continue;

    const { rating, ratedAt } = value as Record<string, unknown>;
    if (!isRatingValue(rating)) continue;

    result[key] = {
      rating,
      ratedAt:
        typeof ratedAt === "string" && !Number.isNaN(Date.parse(ratedAt))
          ? ratedAt
          : "",
    };
  }

  return result;
}

export function getRatingFor(
  ratings: Ratings,
  id: number,
  mediaType: MediaType,
): number | null {
  return ratings[mediaItemKey(id, mediaType)]?.rating ?? null;
}

/** Returns a new map – the caller's copy is React state. */
export function setRating(
  ratings: Ratings,
  id: number,
  mediaType: MediaType,
  rating: number,
  now: string = new Date().toISOString(),
): Ratings {
  if (!isRatingValue(rating)) return ratings;

  return {
    ...ratings,
    [mediaItemKey(id, mediaType)]: { rating, ratedAt: now },
  };
}

export function clearRating(
  ratings: Ratings,
  id: number,
  mediaType: MediaType,
): Ratings {
  const next = { ...ratings };
  delete next[mediaItemKey(id, mediaType)];
  return next;
}

// ── Storage, exposed as an external store ────────────────────────────────────
//
// So components read it with `useSyncExternalStore` instead of copying it into
// their own state on mount: a score given on a detail page then shows up on the
// watchlist without a reload, and there is no second copy to drift.

const listeners = new Set<() => void>();

// The snapshot is compared by identity, so parsing on every call would hand back
// a new object each time and spin forever. Memoised against the raw string.
let cachedRaw: string | null = null;
let cachedRatings: Ratings = EMPTY;

function notifyRatingsChanged(): void {
  for (const listener of listeners) listener();
}

export function subscribeToRatings(onChange: () => void): () => void {
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    // `key` is null when the whole store was cleared, which concerns us too.
    if (event.key !== null && event.key !== RATINGS_STORAGE_KEY) return;
    onChange();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getRatingsSnapshot(): Ratings {
  if (typeof window === "undefined") return EMPTY;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(RATINGS_STORAGE_KEY);
  } catch {
    return EMPTY;
  }

  if (raw === cachedRaw) return cachedRatings;

  cachedRaw = raw;
  cachedRatings = EMPTY;

  if (raw) {
    try {
      cachedRatings = sanitizeRatings(JSON.parse(raw));
    } catch (error) {
      console.error("Error parsing ratings from storage:", error);
    }
  }

  return cachedRatings;
}

/** The server has no storage, so nothing is rated as far as it knows. */
export function getServerRatingsSnapshot(): Ratings {
  return EMPTY;
}

export function saveRatings(ratings: Ratings): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(ratings));
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving ratings to storage:", error);
  }

  // A `storage` event fires only in *other* tabs, so this one announces its own
  // writes.
  notifyRatingsChanged();
}
