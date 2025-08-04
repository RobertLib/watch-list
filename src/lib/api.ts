/**
 * The app's data-loading surface.
 *
 * This is what `app/actions.ts` used to be. Every function here was a Server
 * Action – an HTTP endpoint the browser called – and every one is now a plain
 * async function the browser runs itself, talking to TMDB directly. The names
 * and signatures are unchanged, so the components calling them did not have to
 * care.
 *
 * The sanitisers survived the move. They used to guard a public endpoint; they
 * now guard against a hand-edited URL, which is where most of these arguments
 * still come from – a page number, a genre id, a filter set. A crafted value
 * would otherwise become a nonsense TMDB request rather than an empty section.
 */

import { tmdbDiscoverApi } from "./tmdb-discover";
import { tmdbApi } from "./tmdb";
import {
  getRecommendationsFromWatchlist,
  sanitizeSeeds,
  type RecommendationsResult,
} from "./recommendations";
import { getContinueWatchingEpisodes } from "./continue-watching-data";
import {
  sanitizeContinueWatchingSeeds,
  type UpNextEpisode,
} from "./continue-watching";
import {
  getDailyPuzzleView,
  isCorrectGuess,
  type DailyPuzzleView,
} from "./daily-puzzle-data";
import {
  pickRatingDuel,
  sanitizeSeenIds,
  settleRatingDuel,
  type RatingDuel,
  type RatingDuelResult,
} from "./rating-duel-data";
import { isPlayableDay, todayUtc } from "./daily-puzzle";
import {
  getWatchlistAvailability,
  sanitizeAvailabilityRefs,
  type WatchlistAvailability,
} from "./watchlist-availability";
import { getTonightCandidates, sanitizeTonightRefs } from "./tonight-data";
import type { TonightCandidate } from "./tonight";
import { getTitleFacts, sanitizeFactRefs } from "./stats-data";
import { getSharedListItems } from "./shared-list-data";
import type { TitleFacts } from "./stats";
import { getReleaseCalendarFor } from "./release-calendar-data";
import {
  isDateOnly,
  sanitizeCalendarSeeds,
  type ReleaseCalendar,
} from "./release-calendar";
import { shiftDate, todayLocal } from "./dates";
import { getReleasesSince, type MissedRelease } from "./since-last-visit-data";
import { sanitizeFilterOptions, sanitizePage } from "./discover-filters";
import type { FilterOptions } from "@/types/filters";
import type { MediaItem, SeasonDetails } from "@/types/tmdb";

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

// Paginated listings. Each one is the "load more" function of a section.

export function getPopularMovies(page: number) {
  return tmdbDiscoverApi.getPopularMovies(sanitizePage(page));
}

export function getTopRatedMovies(page: number) {
  return tmdbDiscoverApi.getTopRatedMovies(sanitizePage(page));
}

export function getNowPlayingMovies(page: number) {
  return tmdbDiscoverApi.getNowPlayingMovies(sanitizePage(page));
}

export function getPopularTVShows(page: number) {
  return tmdbDiscoverApi.getPopularTVShows(sanitizePage(page));
}

export function getTopRatedTVShows(page: number) {
  return tmdbDiscoverApi.getTopRatedTVShows(sanitizePage(page));
}

export function getAiringTodayTVShows(page: number) {
  return tmdbDiscoverApi.getAiringTodayTVShows(sanitizePage(page));
}

export function getUpcomingMovies(page: number) {
  return tmdbDiscoverApi.getUpcomingMovies(sanitizePage(page));
}

export function getTrendingMoviesWeekly(page: number) {
  return tmdbDiscoverApi.getTrendingMoviesWeekly(sanitizePage(page));
}

export function getTrendingTVShowsWeekly(page: number) {
  return tmdbDiscoverApi.getTrendingTVShowsWeekly(sanitizePage(page));
}

export function discoverMoviesByGenre(genreId: number, page: number) {
  return tmdbDiscoverApi.discoverMoviesByGenre(
    sanitizeGenreId(genreId),
    sanitizePage(page),
  );
}

export function discoverTVShowsByGenre(genreId: number, page: number) {
  return tmdbDiscoverApi.discoverTVShowsByGenre(
    sanitizeGenreId(genreId),
    sanitizePage(page),
  );
}

export function searchMulti(query: string, page: number = 1) {
  return tmdbDiscoverApi.searchMulti(sanitizeQuery(query), sanitizePage(page));
}

export function searchPerson(query: string, page: number = 1) {
  return tmdbDiscoverApi.searchPerson(sanitizeQuery(query), sanitizePage(page));
}

// Filtered discovery. The filter payload is rebuilt from scratch rather than
// trusted: it comes out of the query string. The parameter stays typed so a typo
// at a legitimate call site is still a compile error – the sanitiser would
// otherwise drop the unknown field in silence.
export function discoverMoviesWithFilters(
  page: number,
  filters: FilterOptions,
) {
  return tmdbDiscoverApi.discoverMovies(
    sanitizePage(page),
    sanitizeFilterOptions(filters, "movie"),
  );
}

export function discoverTVShowsWithFilters(
  page: number,
  filters: FilterOptions,
) {
  return tmdbDiscoverApi.discoverTVShows(
    sanitizePage(page),
    sanitizeFilterOptions(filters, "tv"),
  );
}

// Personalised picks derived from the watchlist and the watched list. Both live
// in browser storage, and are passed in rather than read here so that this stays
// a pure function of its arguments – the caller is the component that owns them.
export function getWatchlistRecommendations(
  watchlist: unknown,
  watched: unknown,
): Promise<RecommendationsResult> {
  return getRecommendationsFromWatchlist(
    sanitizeSeeds(watchlist),
    sanitizeSeeds(watched),
  );
}

/** The next unwatched episode of every show the visitor has started. */
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

/** Where every saved title can be watched, in one pass rather than one per card. */
export function getWatchlistAvailabilityFor(
  refs: unknown,
): Promise<WatchlistAvailability> {
  return getWatchlistAvailability(sanitizeAvailabilityRefs(refs));
}

/**
 * Which day a puzzle request is allowed to be about.
 *
 * The archive lets a player go back, so the day is not pinned to today – but it
 * still decides which film is served. Anything that is not a past day collapses
 * to today rather than erroring: a stale tab that asks for "yesterday" after
 * midnight should get a puzzle, and nobody should be handed tomorrow's.
 */
function resolvePuzzleDay(day: unknown): string {
  const today = todayUtc();
  return isPlayableDay(day, today) ? day : today;
}

/**
 * The daily puzzle.
 *
 * The answer used to be withheld by a server. It cannot be, now: the pool ships
 * in the bundle and the schedule is a pure function of the date, so a determined
 * player can read today's film out of devtools. What is left is the honest
 * version of what the puzzle always was – the board still only reveals what has
 * been earned, and spoiling it spoils it for the person who went looking.
 */
export function getDailyPuzzle(
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

/** Check one guess. */
export function checkDailyGuess(day: unknown, movieId: unknown): boolean {
  if (
    typeof movieId !== "number" ||
    !Number.isInteger(movieId) ||
    movieId <= 0
  ) {
    return false;
  }

  return isCorrectGuess(resolvePuzzleDay(day), movieId);
}

/** Two films to rank by rating, for the endless side game. */
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

/**
 * Upcoming episodes and cinema releases for everything the visitor follows.
 */
export async function getReleaseCalendar(
  seeds: unknown,
): Promise<ReleaseCalendar> {
  // The visitor's own calendar day, not Greenwich's. This is what fills the
  // "Today" bucket, and in UTC it named the wrong day for a stretch of every
  // evening in the Americas and every small hour east of Greenwich.
  const today = todayLocal();

  try {
    return await getReleaseCalendarFor(sanitizeCalendarSeeds(seeds), today);
  } catch (error) {
    console.error("Error building release calendar:", error);
    return { events: [], awaiting: [], today };
  }
}

// Saved titles resolved into what a "what should I watch tonight" decision needs:
// runtime, genre and where it can be played. The watchlist stores none of those.
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
 * The window is bounded rather than trusted: an unbounded one would turn one
 * page view into a scan of every followed title's whole history.
 */
export async function getReleasesSinceLastVisit(
  seeds: unknown,
  since: unknown,
): Promise<MissedRelease[]> {
  const today = todayLocal();

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
// "1/../../account" would otherwise walk the request to a different endpoint.
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
