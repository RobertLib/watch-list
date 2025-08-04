"use client";

import { sanitizeStoredWatched, type ListWriteResult } from "./media-list";
import { MediaType } from "@/types/tmdb";

export interface WatchedItem {
  id: number;
  title: string;
  mediaType: MediaType;
  posterPath: string | null;
  voteAverage: number;
  releaseDate: string;
  watchedAt: string;
}

// Unlike the watchlist this lives in localStorage rather than a cookie. A
// watched history only grows, and a cookie that outgrows the ~4KB browser limit
// is rejected in full – the whole history would silently disappear. Nothing on
// the server reads it either: the recommender is handed it by the client.
export const WATCHED_STORAGE_KEY = "watched";

/** Repaired entry by entry on the way out of storage – see `getWatchlist`. */
export function getWatched(): WatchedItem[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(WATCHED_STORAGE_KEY);
    if (!stored) return [];

    return sanitizeStoredWatched(JSON.parse(stored));
  } catch (error) {
    console.error("Error parsing watched list from storage:", error);
    return [];
  }
}

/** False when the browser refused the write – out of quota, or storing nothing. */
export function saveWatched(watched: WatchedItem[]): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(watched));
    return true;
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving watched list to storage:", error);
    return false;
  }
}

export function addToWatched(
  item: Omit<WatchedItem, "watchedAt">,
): ListWriteResult {
  try {
    const currentWatched = getWatched();

    // Check if item already exists
    const exists = currentWatched.some(
      (existing) =>
        existing.id === item.id && existing.mediaType === item.mediaType,
    );

    if (exists) return "duplicate";

    const newItem: WatchedItem = {
      ...item,
      watchedAt: new Date().toISOString(),
    };

    return saveWatched([newItem, ...currentWatched]) ? "ok" : "failed";
  } catch (error) {
    console.error("Error adding to watched list:", error);
    return "failed";
  }
}

export function removeFromWatched(
  id: number,
  mediaType: MediaType,
): ListWriteResult {
  try {
    const currentWatched = getWatched();
    const updatedWatched = currentWatched.filter(
      (item) => !(item.id === id && item.mediaType === mediaType),
    );

    return saveWatched(updatedWatched) ? "ok" : "failed";
  } catch (error) {
    console.error("Error removing from watched list:", error);
    return "failed";
  }
}

export function isWatched(id: number, mediaType: MediaType): boolean {
  try {
    const watched = getWatched();
    return watched.some(
      (item) => item.id === id && item.mediaType === mediaType,
    );
  } catch (error) {
    console.error("Error checking watched list:", error);
    return false;
  }
}

/** False when the browser refused the write – see `clearWatchlist`. */
export function clearWatched(): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.removeItem(WATCHED_STORAGE_KEY);
    return true;
  } catch (error) {
    console.error("Error clearing watched list:", error);
    return false;
  }
}
