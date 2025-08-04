"use client";

import type { MediaItem, MediaType } from "@/types/tmdb";
import { withProfileRosterLock } from "./profile-roster-lock";
import { isProfileStorageOwnerAvailable, withProfileStorage } from "./profile-storage";
import { addToWatched, getWatched, removeFromWatched } from "./watched";
import { getWatchlist, removeFromWatchlistUnderLock } from "./watchlist";
import { clearRating, getRatingsSnapshot, isRatingValue, saveRatings, setRating } from "./ratings";

export type WatchedActionResult =
  | { status: "ok"; removedFromWatchlist: boolean }
  | { status: "changed" | "failed" | "profile-unavailable" | "watchlist-failed" };

export type RatingActionResult =
  | { status: "ok" | "watchlist-failed"; wasWatched: boolean; wasQueued: boolean }
  | { status: "rating-failed" | "watched-failed" | "failed" | "profile-unavailable" };

function addWatchedTitle(item: MediaItem) {
  return addToWatched({
    id: item.id,
    title: item.title,
    mediaType: item.media_type,
    posterPath: item.poster_path,
    voteAverage: item.vote_average,
    releaseDate: item.release_date,
  });
}

/** Serialize the whole action with restores, rather than only its final removal. */
export function setTitleWatched(
  profileId: string,
  item: MediaItem,
  expectedWatched: boolean,
): Promise<WatchedActionResult> {
  return withProfileRosterLock<WatchedActionResult>(() => withProfileStorage(profileId, () => {
    if (!isProfileStorageOwnerAvailable(profileId)) return { status: "profile-unavailable" };
    const currentlyWatched = getWatched({ strict: true }).some(
      (entry) => entry.id === item.id && entry.mediaType === item.media_type,
    );
    if (currentlyWatched !== expectedWatched) return { status: "changed" };

    if (expectedWatched) {
      return removeFromWatched(item.id, item.media_type) === "ok"
        ? { status: "ok", removedFromWatchlist: false }
        : { status: "failed" };
    }

    const wasQueued = getWatchlist({ strict: true }).some(
      (entry) => entry.id === item.id && entry.mediaType === item.media_type,
    );
    if (addWatchedTitle(item) !== "ok") return { status: "failed" };
    if (wasQueued && removeFromWatchlistUnderLock(item.id, item.media_type) !== "ok") {
      return { status: "watchlist-failed" };
    }
    return { status: "ok", removedFromWatchlist: wasQueued };
  }), { status: "failed" });
}

/** Ratings, watched history and the queue use one fresh snapshot under one lock. */
export function rateTitleAndMarkWatched(
  profileId: string,
  item: MediaItem,
  value: number,
): Promise<RatingActionResult> {
  return withProfileRosterLock<RatingActionResult>(() => withProfileStorage(profileId, () => {
    if (!isProfileStorageOwnerAvailable(profileId)) return { status: "profile-unavailable" };
    // Validate every list before saving the rating: empty rendering fallbacks
    // must not turn a corrupted history or queue into a partly committed edit.
    const wasWatched = getWatched({ strict: true }).some(
      (entry) => entry.id === item.id && entry.mediaType === item.media_type,
    );
    const wasQueued = getWatchlist({ strict: true }).some(
      (entry) => entry.id === item.id && entry.mediaType === item.media_type,
    );
    try {
      if (!isRatingValue(value) || !saveRatings(setRating(getRatingsSnapshot({ strict: true }), item.id, item.media_type, value))) {
        return { status: "rating-failed" };
      }
    } catch (error) {
      console.error("Error reading ratings before saving:", error);
      return { status: "rating-failed" };
    }

    if (!wasWatched && addWatchedTitle(item) === "failed") return { status: "watched-failed" };
    if (wasQueued && removeFromWatchlistUnderLock(item.id, item.media_type) !== "ok") {
      return { status: "watchlist-failed", wasWatched, wasQueued };
    }
    return { status: "ok", wasWatched, wasQueued };
  }), { status: "failed" });
}

/** Clearing a score observes the same ordering as a queued backup restore. */
export function clearTitleRating(profileId: string, id: number, mediaType: MediaType): Promise<boolean> {
  return withProfileRosterLock(() => withProfileStorage(profileId, () =>
    isProfileStorageOwnerAvailable(profileId) &&
    saveRatings(clearRating(getRatingsSnapshot({ strict: true }), id, mediaType)),
  ), false);
}
