"use client";

export interface WatchlistItem {
  id: number;
  title: string;
  mediaType: "movie" | "tv";
  posterPath: string | null;
  voteAverage: number;
  releaseDate: string;
  addedAt: string;
}

const WATCHLIST_COOKIE_NAME = "watchlist";
const COOKIE_EXPIRY_DAYS = 365;

export function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;

  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(";").shift() || null;
  }
  return null;
}

export function setCookieValue(
  name: string,
  value: string,
  days: number = COOKIE_EXPIRY_DAYS
): void {
  if (typeof document === "undefined") return;

  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

export function getWatchlist(): WatchlistItem[] {
  try {
    const watchlistData = getCookieValue(WATCHLIST_COOKIE_NAME);
    if (!watchlistData) return [];

    const parsed = JSON.parse(decodeURIComponent(watchlistData));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Error parsing watchlist from cookies:", error);
    return [];
  }
}

export function saveWatchlist(watchlist: WatchlistItem[]): void {
  try {
    const encoded = encodeURIComponent(JSON.stringify(watchlist));
    setCookieValue(WATCHLIST_COOKIE_NAME, encoded);
  } catch (error) {
    console.error("Error saving watchlist to cookies:", error);
  }
}

export function addToWatchlist(item: Omit<WatchlistItem, "addedAt">): boolean {
  try {
    const currentWatchlist = getWatchlist();

    // Check if item already exists
    const exists = currentWatchlist.some(
      (existing) =>
        existing.id === item.id && existing.mediaType === item.mediaType
    );

    if (exists) return false;

    const newItem: WatchlistItem = {
      ...item,
      addedAt: new Date().toISOString(),
    };

    const updatedWatchlist = [newItem, ...currentWatchlist];
    saveWatchlist(updatedWatchlist);
    return true;
  } catch (error) {
    console.error("Error adding to watchlist:", error);
    return false;
  }
}

export function removeFromWatchlist(
  id: number,
  mediaType: "movie" | "tv"
): boolean {
  try {
    const currentWatchlist = getWatchlist();
    const updatedWatchlist = currentWatchlist.filter(
      (item) => !(item.id === id && item.mediaType === mediaType)
    );

    saveWatchlist(updatedWatchlist);
    return true;
  } catch (error) {
    console.error("Error removing from watchlist:", error);
    return false;
  }
}

export function isInWatchlist(id: number, mediaType: "movie" | "tv"): boolean {
  try {
    const watchlist = getWatchlist();
    return watchlist.some(
      (item) => item.id === id && item.mediaType === mediaType
    );
  } catch (error) {
    console.error("Error checking watchlist:", error);
    return false;
  }
}

export function clearWatchlist(): void {
  try {
    setCookieValue(WATCHLIST_COOKIE_NAME, "", -1); // Expire the cookie
  } catch (error) {
    console.error("Error clearing watchlist:", error);
  }
}
