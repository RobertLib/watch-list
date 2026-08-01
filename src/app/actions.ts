"use server";

import { getRegion, setRegion, type Region } from "@/lib/region-server";
import {
  getSelectedProviderIds,
  getWatchProviderFilter,
} from "@/lib/watch-provider-server";
import {
  sanitizePortableSettings,
  type PortableSettings,
} from "@/lib/portable-data";
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
import { getContinueWatchingEpisodes } from "@/lib/continue-watching-server";
import {
  sanitizeContinueWatchingSeeds,
  type UpNextEpisode,
} from "@/lib/continue-watching";
import {
  getDailyPuzzleView,
  isCorrectGuess,
  type DailyPuzzleView,
} from "@/lib/daily-puzzle-server";
import { todayUtc } from "@/lib/daily-puzzle";
import {
  getWatchlistAvailability,
  sanitizeAvailabilityRefs,
  type WatchlistAvailability,
} from "@/lib/watchlist-availability";
import { getReleaseCalendarFor } from "@/lib/release-calendar-server";
import {
  sanitizeCalendarSeeds,
  type ReleaseCalendar,
} from "@/lib/release-calendar";
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

// The next unwatched episode of every show the visitor has started. Episode
// ticks live in browser storage, so they are sent in for the same reason the
// watchlist is: the home page stays statically rendered.
export async function getContinueWatching(
  progress: unknown,
): Promise<UpNextEpisode[]> {
  try {
    return await getContinueWatchingEpisodes(
      sanitizeContinueWatchingSeeds(progress),
    );
  } catch (error) {
    // One failing show should not take the whole row down; the per-show reads are
    // already settled individually, so anything reaching here is systemic.
    console.error("Error building continue watching row:", error);
    return [];
  }
}

// Where every saved title can be watched, in one call rather than one per title.
// The region and the chosen platforms come from httpOnly cookies, so this has to
// happen here regardless.
export async function getWatchlistAvailabilityFor(
  refs: unknown,
): Promise<WatchlistAvailability> {
  return getWatchlistAvailability(sanitizeAvailabilityRefs(refs));
}

// The daily puzzle. The day is decided here rather than accepted from the client:
// it is what selects the film, so taking it from a payload would let anyone ask
// for tomorrow's answer.
export async function getDailyPuzzle(
  guessCount: unknown,
  isOver: unknown,
): Promise<DailyPuzzleView | null> {
  return getDailyPuzzleView(
    todayUtc(),
    typeof guessCount === "number" ? guessCount : 0,
    isOver === true,
  );
}

/**
 * Check one guess.
 *
 * Only ever answers yes or no – the film itself comes back through
 * `getDailyPuzzle` once the browser reports the board as finished. A player
 * determined to cheat can claim to be finished, which spoils their own puzzle and
 * nobody else's; that is a fair trade for keeping the whole thing stateless.
 */
export async function checkDailyGuess(movieId: unknown): Promise<boolean> {
  if (typeof movieId !== "number" || !Number.isInteger(movieId) || movieId <= 0) {
    return false;
  }

  return isCorrectGuess(todayUtc(), movieId);
}

// Profile settings live in httpOnly cookies, which browser JavaScript cannot
// read or write – so a backup that is meant to move someone to a new device has
// to go through the server for these two round trips.
export async function getPortableSettings(): Promise<PortableSettings> {
  const [region, watchProviderFilter, selectedProviderIds] = await Promise.all([
    getRegion(),
    getWatchProviderFilter(),
    getSelectedProviderIds(),
  ]);

  return { region, watchProviderFilter, selectedProviderIds };
}

export async function applyPortableSettings(settings: unknown): Promise<void> {
  const { region, watchProviderFilter, selectedProviderIds } =
    sanitizePortableSettings(settings);

  // A backup written before these were configured carries nulls, and restoring
  // a null must leave the current setting alone rather than reset it.
  if (region) await setRegion(region);

  const cookieStore = await cookies();

  if (watchProviderFilter) {
    cookieStore.set(
      getWatchProviderFilterCookieName(),
      watchProviderFilter,
      SETTINGS_COOKIE_OPTIONS,
    );
  }

  if (selectedProviderIds.length > 0) {
    cookieStore.set(
      getSelectedProvidersCookieName(),
      providerIdsToCookieValue(selectedProviderIds),
      SETTINGS_COOKIE_OPTIONS,
    );
  }

  if (region || watchProviderFilter || selectedProviderIds.length > 0) {
    await markUserHasSettings();
    refresh();
  }
}

// Upcoming episodes and cinema releases for everything the visitor follows.
// "Today" is decided here rather than accepted from the payload: it bounds the
// window, and a device with a wrong clock would otherwise move it.
export async function getReleaseCalendar(
  seeds: unknown,
): Promise<ReleaseCalendar> {
  const today = new Date().toISOString().slice(0, 10);

  try {
    return await getReleaseCalendarFor(sanitizeCalendarSeeds(seeds), today);
  } catch (error) {
    console.error("Error building release calendar:", error);
    return { events: [], awaiting: [], today };
  }
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
