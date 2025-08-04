import { cookies } from "next/headers";
import {
  getWatchProviderFilterCookieName,
  getSelectedProvidersCookieName,
  parseProviderIdsFromCookie,
  type WatchProviderFilter,
} from "./watch-provider-settings";

/**
 * Get the current watch provider filter setting from cookies (server-side only)
 */
export async function getWatchProviderFilter(): Promise<WatchProviderFilter> {
  const cookieStore = await cookies();
  const filter = cookieStore.get(getWatchProviderFilterCookieName())?.value;

  return filter === "streaming-only" ? "streaming-only" : "all";
}

/**
 * Get selected streaming provider IDs from cookies (server-side only)
 * Returns empty array if user hasn't selected any providers yet
 */
export async function getSelectedProviderIds(): Promise<number[]> {
  const cookieStore = await cookies();
  const selectedProviders = cookieStore.get(
    getSelectedProvidersCookieName()
  )?.value;

  if (!selectedProviders) {
    return [];
  }

  return parseProviderIdsFromCookie(selectedProviders);
}

/**
 * Get selected provider IDs as a pipe-separated string for TMDB API
 * Returns empty string if no providers selected
 */
export async function getSelectedProviderIdsString(): Promise<string> {
  const ids = await getSelectedProviderIds();
  return ids.join("|");
}
