"use client";

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
const WATCHED_STORAGE_KEY = "watched";

export function getWatched(): WatchedItem[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(WATCHED_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Error parsing watched list from storage:", error);
    return [];
  }
}

export function saveWatched(watched: WatchedItem[]): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(watched));
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving watched list to storage:", error);
  }
}

export function addToWatched(item: Omit<WatchedItem, "watchedAt">): boolean {
  try {
    const currentWatched = getWatched();

    // Check if item already exists
    const exists = currentWatched.some(
      (existing) =>
        existing.id === item.id && existing.mediaType === item.mediaType,
    );

    if (exists) return false;

    const newItem: WatchedItem = {
      ...item,
      watchedAt: new Date().toISOString(),
    };

    saveWatched([newItem, ...currentWatched]);
    return true;
  } catch (error) {
    console.error("Error adding to watched list:", error);
    return false;
  }
}

export function removeFromWatched(id: number, mediaType: MediaType): boolean {
  try {
    const currentWatched = getWatched();
    const updatedWatched = currentWatched.filter(
      (item) => !(item.id === id && item.mediaType === mediaType),
    );

    saveWatched(updatedWatched);
    return true;
  } catch (error) {
    console.error("Error removing from watched list:", error);
    return false;
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

export function clearWatched(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(WATCHED_STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing watched list:", error);
  }
}
