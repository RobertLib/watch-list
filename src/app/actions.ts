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
import { sanitizeFilterOptions, sanitizePage } from "@/lib/discover-filters";
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
//
// Every argument below crosses a public HTTP boundary: a server action is an
// endpoint anyone can POST to, and the declared TypeScript types say nothing
// about what actually arrives. Each one also ends up in a Data Cache tag, so an
// unvalidated value buys an unbounded number of cache entries on top of the
// TMDB error it would trigger. `sanitizePage` clamps to the 1–500 TMDB accepts.

/** A genre the app links to is always a positive TMDB integer id. */
function sanitizeGenreId(genreId: unknown): number {
  const id = Number(genreId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid genre id");
  }

  return id;
}

/** Long enough for any real title, short enough to stay out of trouble. */
const MAX_QUERY_LENGTH = 200;

function sanitizeQuery(query: unknown): string {
  return typeof query === "string" ? query.slice(0, MAX_QUERY_LENGTH) : "";
}

export async function getPopularMovies(page: number) {
  return await tmdbServerApi.getPopularMovies(sanitizePage(page));
}

export async function getTopRatedMovies(page: number) {
  return await tmdbServerApi.getTopRatedMovies(sanitizePage(page));
}

export async function getNowPlayingMovies(page: number) {
  return await tmdbServerApi.getNowPlayingMovies(sanitizePage(page));
}

export async function getPopularTVShows(page: number) {
  return await tmdbServerApi.getPopularTVShows(sanitizePage(page));
}

export async function getTopRatedTVShows(page: number) {
  return await tmdbServerApi.getTopRatedTVShows(sanitizePage(page));
}

export async function getAiringTodayTVShows(page: number) {
  return await tmdbServerApi.getAiringTodayTVShows(sanitizePage(page));
}

export async function getUpcomingMovies(page: number) {
  return await tmdbServerApi.getUpcomingMovies(sanitizePage(page));
}

export async function getTrendingMoviesWeekly(page: number) {
  return await tmdbServerApi.getTrendingMoviesWeekly(sanitizePage(page));
}

export async function getTrendingTVShowsWeekly(page: number) {
  return await tmdbServerApi.getTrendingTVShowsWeekly(sanitizePage(page));
}

export async function discoverMoviesByGenre(genreId: number, page: number) {
  return await tmdbServerApi.discoverMoviesByGenre(
    sanitizeGenreId(genreId),
    sanitizePage(page),
  );
}

export async function searchMulti(query: string, page: number = 1) {
  return await tmdbServerApi.searchMulti(
    sanitizeQuery(query),
    sanitizePage(page),
  );
}

export async function searchPerson(query: string, page: number = 1) {
  return await tmdbServerApi.searchPerson(
    sanitizeQuery(query),
    sanitizePage(page),
  );
}

export async function discoverTVShowsByGenre(genreId: number, page: number) {
  return await tmdbServerApi.discoverTVShowsByGenre(
    sanitizeGenreId(genreId),
    sanitizePage(page),
  );
}

// New filtered discovery actions. The filter payload is rebuilt from scratch
// rather than trusted: it feeds both the TMDB query and the cache tag. The
// parameter stays typed so a typo at a legitimate call site is still a compile
// error – the sanitizer would otherwise drop the unknown field in silence.
export async function discoverMoviesWithFilters(
  page: number,
  filters: FilterOptions,
) {
  return await tmdbServerApi.discoverMovies(
    sanitizePage(page),
    sanitizeFilterOptions(filters, "movie"),
  );
}

export async function discoverTVShowsWithFilters(
  page: number,
  filters: FilterOptions,
) {
  return await tmdbServerApi.discoverTVShows(
    sanitizePage(page),
    sanitizeFilterOptions(filters, "tv"),
  );
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

// Both ids are interpolated into the TMDB *path*, where nothing escapes them –
// so they are checked here rather than left to `getSeasonDetails`. An id of
// "1/../../account" would otherwise walk the request to a different endpoint
// with our bearer token attached.
export async function fetchSeasonDetails(
  tvId: number,
  seasonNumber: number,
): Promise<SeasonDetails | null> {
  const id = Number(tvId);
  const season = Number(seasonNumber);

  // Season 0 is where TMDB keeps the specials, so it has to stay allowed.
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!Number.isInteger(season) || season < 0) return null;

  try {
    return await tmdbApi.getSeasonDetails(id, season);
  } catch {
    return null;
  }
}
