"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  clearRating,
  getRatingFor,
  getRatingsSnapshot,
  getServerRatingsSnapshot,
  saveRatings,
  setRating,
  subscribeToRatings,
  type Ratings,
} from "@/lib/ratings";
import type { MediaType } from "@/types/tmdb";

/**
 * The viewer's own scores, shared across the page.
 *
 * Server-rendered HTML cannot know them, so everything starts unrated and fills
 * in once the browser takes over.
 */
export function useRatings(): {
  ratings: Ratings;
  ratingFor: (id: number, mediaType: MediaType) => number | null;
  rate: (id: number, mediaType: MediaType, rating: number) => void;
  unrate: (id: number, mediaType: MediaType) => void;
} {
  const ratings = useSyncExternalStore(
    subscribeToRatings,
    getRatingsSnapshot,
    getServerRatingsSnapshot,
  );

  const ratingFor = useCallback(
    (id: number, mediaType: MediaType) => getRatingFor(ratings, id, mediaType),
    [ratings],
  );

  const rate = useCallback(
    (id: number, mediaType: MediaType, rating: number) => {
      saveRatings(setRating(getRatingsSnapshot(), id, mediaType, rating));
    },
    [],
  );

  const unrate = useCallback((id: number, mediaType: MediaType) => {
    // Read through the snapshot rather than the render-time copy, so two quick
    // changes cannot overwrite each other with a stale map.
    saveRatings(clearRating(getRatingsSnapshot(), id, mediaType));
  }, []);

  return { ratings, ratingFor, rate, unrate };
}
