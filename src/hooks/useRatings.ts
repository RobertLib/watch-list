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
import { DEFAULT_PROFILE_ID, getActiveProfileId, subscribeProfiles } from "@/lib/profiles";
import { isProfileStorageOwnerAvailable, withProfileStorage } from "@/lib/profile-storage";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";

const getServerProfileId = () => DEFAULT_PROFILE_ID;

/**
 * The viewer's own scores, shared across the page.
 *
 * Server-rendered HTML cannot know them, so everything starts unrated and fills
 * in once the browser takes over.
 */
export function useRatings(): {
  ratings: Ratings;
  /** Owner of these scores and their write callbacks. */
  profileId: string;
  ratingFor: (id: number, mediaType: MediaType) => number | null;
  rate: (id: number, mediaType: MediaType, rating: number) => Promise<boolean>;
  unrate: (id: number, mediaType: MediaType) => Promise<boolean>;
} {
  const profileId = useSyncExternalStore(
    subscribeProfiles,
    getActiveProfileId,
    getServerProfileId,
  );
  const readRatings = useCallback(
    () => withProfileStorage(profileId, getRatingsSnapshot),
    [profileId],
  );
  const ratings = useSyncExternalStore(
    subscribeToRatings,
    readRatings,
    getServerRatingsSnapshot,
  );

  const ratingFor = useCallback(
    (id: number, mediaType: MediaType) => getRatingFor(ratings, id, mediaType),
    [ratings],
  );

  const rate = useCallback(
    (id: number, mediaType: MediaType, rating: number) => {
      return withProfileRosterLock(() => withProfileStorage(profileId, () => {
        if (!isProfileStorageOwnerAvailable(profileId)) return false;
        return saveRatings(setRating(getRatingsSnapshot({ strict: true }), id, mediaType, rating));
      }), false);
    },
    [profileId],
  );

  const unrate = useCallback((id: number, mediaType: MediaType) => {
    // Read after acquiring the shared lock so other tabs' edits and restores
    // cannot be overwritten by this callback's older rendered map.
    return withProfileRosterLock(() => withProfileStorage(profileId, () => {
      if (!isProfileStorageOwnerAvailable(profileId)) return false;
      return saveRatings(clearRating(getRatingsSnapshot({ strict: true }), id, mediaType));
    }), false);
  }, [profileId]);

  return { ratings, profileId, ratingFor, rate, unrate };
}
