"use server";

import { setRegion, type Region } from "@/lib/region-server";
import { isValidRegion } from "@/lib/region";
import {
  getWatchProviderFilterCookieName,
  getSelectedProvidersCookieName,
  isWatchProviderFilter,
  providerIdsToCookieValue,
  sanitizeProviderIds,
  type WatchProviderFilter,
} from "@/lib/watch-provider-settings";
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { tmdbApi } from "@/lib/tmdb";
import {
  getRecommendationsFromWatchlist,
  sanitizeSeeds,
  type RecommendationsResult,
} from "@/lib/recommendations";
import type { FilterOptions } from "@/types/filters";
import type { SeasonDetails } from "@/types/tmdb";

const SETTINGS_COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 24 * 365, // 1 year
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
} as const;

// Mark that user has made settings (will hide welcome panel)
async function markUserHasSettings() {
  const cookieStore = await cookies();
  cookieStore.set("user-has-settings", "true", SETTINGS_COOKIE_OPTIONS);
}

export async function changeRegion(region: Region) {
  if (!region || !isValidRegion(region)) {
    throw new Error("Invalid region");
  }

  await setRegion(region);
  await markUserHasSettings();

  // Settings are saved on change, so the router needs the updated server state
  refresh();
}

export async function changeWatchProviderFilter(filter: WatchProviderFilter) {
  if (!isWatchProviderFilter(filter)) {
    throw new Error("Invalid watch provider filter");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    getWatchProviderFilterCookieName(),
    filter,
    SETTINGS_COOKIE_OPTIONS,
  );

  await markUserHasSettings();
  refresh();
}

export async function changeSelectedProviders(providerIds: number[]) {
  const cookieStore = await cookies();
  cookieStore.set(
    getSelectedProvidersCookieName(),
    providerIdsToCookieValue(sanitizeProviderIds(providerIds)),
    SETTINGS_COOKIE_OPTIONS,
  );

  await markUserHasSettings();
  refresh();
}

// Server actions for pagination
export async function getPopularMovies(page: number) {
  return await tmdbServerApi.getPopularMovies(page);
}

export async function getTopRatedMovies(page: number) {
  return await tmdbServerApi.getTopRatedMovies(page);
}

export async function getNowPlayingMovies(page: number) {
  return await tmdbServerApi.getNowPlayingMovies(page);
}

export async function getPopularTVShows(page: number) {
  return await tmdbServerApi.getPopularTVShows(page);
}

export async function getTopRatedTVShows(page: number) {
  return await tmdbServerApi.getTopRatedTVShows(page);
}

export async function getAiringTodayTVShows(page: number) {
  return await tmdbServerApi.getAiringTodayTVShows(page);
}

export async function getUpcomingMovies(page: number) {
  return await tmdbServerApi.getUpcomingMovies(page);
}

export async function getTrendingMoviesWeekly(page: number) {
  return await tmdbServerApi.getTrendingMoviesWeekly(page);
}

export async function getTrendingTVShowsWeekly(page: number) {
  return await tmdbServerApi.getTrendingTVShowsWeekly(page);
}

export async function discoverMoviesByGenre(genreId: number, page: number) {
  return await tmdbServerApi.discoverMoviesByGenre(genreId, page);
}

export async function searchMulti(query: string, page: number = 1) {
  return await tmdbServerApi.searchMulti(query, page);
}

export async function searchPerson(query: string, page: number = 1) {
  return await tmdbServerApi.searchPerson(query, page);
}

export async function discoverTVShowsByGenre(genreId: number, page: number) {
  return await tmdbServerApi.discoverTVShowsByGenre(genreId, page);
}

// New filtered discovery actions
export async function discoverMoviesWithFilters(
  page: number,
  filters: FilterOptions,
) {
  return await tmdbServerApi.discoverMovies(page, filters);
}

export async function discoverTVShowsWithFilters(
  page: number,
  filters: FilterOptions,
) {
  return await tmdbServerApi.discoverTVShows(page, filters);
}

// Check if user has custom settings
export async function hasUserCustomSettings(): Promise<boolean> {
  const cookieStore = await cookies();

  // Check if user has explicitly interacted with settings
  const hasSettingsCookie = cookieStore.get("user-has-settings");
  if (hasSettingsCookie) {
    return true;
  }

  // Check if user has set a custom region (not default US)
  const regionCookie = cookieStore.get("tmdb-region");
  const hasCustomRegion = regionCookie && regionCookie.value !== "US";

  // Check if user has set watch provider filter to streaming-only
  const watchProviderCookie = cookieStore.get(
    getWatchProviderFilterCookieName(),
  );
  const hasCustomWatchProvider =
    watchProviderCookie && watchProviderCookie.value === "streaming-only";

  return Boolean(hasCustomRegion || hasCustomWatchProvider);
}

// Personalised picks derived from the watchlist and the watched list. Both live
// in browser storage the client owns, so they are sent in rather than read here
// – that keeps the (statically rendered) home page out of dynamic rendering.
export async function getWatchlistRecommendations(
  watchlist: unknown,
  watched: unknown,
): Promise<RecommendationsResult> {
  return getRecommendationsFromWatchlist(
    sanitizeSeeds(watchlist),
    sanitizeSeeds(watched),
  );
}

export async function fetchSeasonDetails(
  tvId: number,
  seasonNumber: number,
): Promise<SeasonDetails | null> {
  try {
    return await tmdbApi.getSeasonDetails(tvId, seasonNumber);
  } catch {
    return null;
  }
}
