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
import {
  pickRatingDuel,
  sanitizeSeenIds,
  settleRatingDuel,
  type RatingDuel,
  type RatingDuelResult,
} from "@/lib/rating-duel-server";
import { isPlayableDay, todayUtc } from "@/lib/daily-puzzle";
import {
  getWatchlistAvailability,
  sanitizeAvailabilityRefs,
  type WatchlistAvailability,
} from "@/lib/watchlist-availability";
import {
  getTonightCandidates,
  sanitizeTonightRefs,
} from "@/lib/tonight-server";
import type { TonightCandidate } from "@/lib/tonight";
import { getTitleFacts, sanitizeFactRefs } from "@/lib/stats-server";
import { getSharedListItems } from "@/lib/shared-list-server";
import type { TitleFacts } from "@/lib/stats";
import { getReleaseCalendarFor } from "@/lib/release-calendar-server";
import {
  isDateOnly,
  sanitizeCalendarSeeds,
  shiftDate,
  type ReleaseCalendar,
} from "@/lib/release-calendar";
import {
  getReleasesSince,
  type MissedRelease,
} from "@/lib/since-last-visit-server";
import { sanitizeFilterOptions, sanitizePage } from "@/lib/discover-filters";
import type { FilterOptions } from "@/types/filters";
import type { MediaItem, SeasonDetails } from "@/types/tmdb";

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

/**
 * Which day a puzzle request is allowed to be about.
 *
 * The archive lets a player go back, so the day can no longer be pinned to today
 * – but it still decides which film is served, and the schedule is a pure
 * function of it. Anything that is not a past day collapses to today rather than
 * erroring: a stale tab that asks for "yesterday" after midnight should get a
 * puzzle, and nobody should be able to ask for tomorrow's.
 */
function resolvePuzzleDay(day: unknown): string {
  const today = todayUtc();
  return isPlayableDay(day, today) ? day : today;
}

// The daily puzzle. `day` is validated rather than trusted: it is what selects
// the film, so an unchecked value would hand out tomorrow's answer to anyone
// willing to edit a payload.
export async function getDailyPuzzle(
  day: unknown,
  guessCount: unknown,
  isOver: unknown,
): Promise<DailyPuzzleView | null> {
  return getDailyPuzzleView(
    resolvePuzzleDay(day),
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
export async function checkDailyGuess(
  day: unknown,
  movieId: unknown,
): Promise<boolean> {
  if (typeof movieId !== "number" || !Number.isInteger(movieId) || movieId <= 0) {
    return false;
  }

  return isCorrectGuess(resolvePuzzleDay(day), movieId);
}

/**
 * Two films to rank by rating, for the endless side game.
 *
 * The second film's score is withheld – it is the answer. Returning both and
 * filtering in the browser would put it in the network tab, which is the same
 * mistake the daily puzzle avoids by proxying its image.
 */
export async function getRatingDuel(
  seenIds: unknown,
  withChampion: unknown,
): Promise<RatingDuel | null> {
  try {
    return await pickRatingDuel(sanitizeSeenIds(seenIds), withChampion === true);
  } catch (error) {
    console.error("Error building a rating duel:", error);
    return null;
  }
}

/** Settle one round, and hand back the score that was being withheld. */
export async function resolveRatingDuel(
  championId: unknown,
  challengerId: unknown,
  guess: unknown,
): Promise<RatingDuelResult | null> {
  try {
    return await settleRatingDuel(championId, challengerId, guess);
  } catch (error) {
    console.error("Error resolving a rating duel:", error);
    return null;
  }
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

// Saved titles resolved into what a "what should I watch tonight" decision needs:
// runtime, genre and where it can be played. The watchlist stores none of those,
// and the browser asking title by title would be sixty requests.
export async function getTonightShortlist(
  refs: unknown,
): Promise<TonightCandidate[]> {
  try {
    return await getTonightCandidates(sanitizeTonightRefs(refs));
  } catch (error) {
    console.error("Error building the tonight shortlist:", error);
    return [];
  }
}

/**
 * Episodes and releases that landed while the visitor was away.
 *
 * `since` comes from the browser because only the browser knows when it was last
 * here – but it is bounded rather than trusted: an unbounded window would turn
 * one page view into a scan of every followed title's whole history, and a date
 * in the future would quietly return nothing.
 */
export async function getReleasesSinceLastVisit(
  seeds: unknown,
  since: unknown,
): Promise<MissedRelease[]> {
  const today = new Date().toISOString().slice(0, 10);

  if (!isDateOnly(since)) return [];

  // Ninety days back at most. Past that "since you were last here" is not the
  // question anyone is asking.
  const earliest = shiftDate(today, -90);
  const from = since < earliest ? earliest : since;
  if (from > today) return [];

  try {
    return await getReleasesSince(sanitizeCalendarSeeds(seeds), from, today);
  } catch (error) {
    console.error("Error loading releases since the last visit:", error);
    return [];
  }
}

/**
 * Resolve rated titles into renderable cards.
 *
 * The ratings store holds a score and a date keyed by id – no title, no poster,
 * because a score outlives being on any list. So the page that lists them has to
 * look them up, exactly as a shared list does with the ids in its URL.
 */
export async function getTitlesByRefs(refs: unknown): Promise<MediaItem[]> {
  try {
    return await getSharedListItems(sanitizeFactRefs(refs));
  } catch (error) {
    console.error("Error resolving titles:", error);
    return [];
  }
}

// Runtime, genre and year for everything on the watched list – none of which the
// browser stores, and all of which the totals on the stats page are built from.
export async function getWatchStatsFacts(
  refs: unknown,
): Promise<Record<string, TitleFacts>> {
  try {
    return await getTitleFacts(sanitizeFactRefs(refs));
  } catch (error) {
    console.error("Error loading title facts for stats:", error);
    return {};
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
