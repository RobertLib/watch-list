import { mediaItemKey } from "./utils";
import type { MediaType } from "@/types/tmdb";
import type { Ratings } from "./ratings";

/**
 * What the visitor's own record adds up to.
 *
 * Everything needed for this has been accumulating since the first title was
 * ticked, and none of it has ever been shown back. That is a waste twice over:
 * "you have watched 240 hours this year, mostly thrillers" is the most personal
 * thing this app could possibly say, and a number that only moves by watching
 * something is a reason to come back and move it.
 *
 * Pure, and separate from the TMDB reads in `stats-data.ts`, so every
 * calculation here is testable without a network.
 */

/** The facts about one title that the aggregation needs, resolved from TMDB. */
export interface TitleFacts {
  id: number;
  mediaType: MediaType;
  /** Minutes: a film's length, or one episode of a series. Null when unknown. */
  runtime: number | null;
  genres: string[];
  year: string | null;
}

export interface WatchedEntry {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  /** ISO timestamp of when it was marked watched. */
  watchedAt: string;
}

export interface StatsInput {
  watched: WatchedEntry[];
  /** Episodes ticked, keyed by TV id. Series watched but never ticked count 0. */
  episodesByShow: Record<number, number>;
  ratings: Ratings;
  /** Keyed `${mediaType}-${id}`; a missing entry was not resolved. */
  facts: Record<string, TitleFacts>;
}

export interface Tally {
  name: string;
  count: number;
}

export interface WatchStats {
  totalTitles: number;
  films: number;
  series: number;
  /** Individually ticked episodes, across every series. */
  episodes: number;
  /**
   * Minutes, counted only from runtimes TMDB actually reported.
   *
   * Nothing is invented for the ones it did not: an estimate dressed up as a
   * total is worse than a total that admits what it is missing, and
   * `titlesWithoutRuntime` is what lets the page say so.
   */
  minutes: number;
  titlesWithoutRuntime: number;
  /**
   * Series among the titles whose ticked episodes `minutes` leaves out because
   * they cannot be placed in the period summarised. Always zero all-time; in a
   * year it is every series finished that year with ticked episodes, since a
   * tick carries no date. Kept apart from `titlesWithoutRuntime`: the runtime
   * is known here, and saying it was not would be a different untruth.
   */
  seriesWithUndatedTime: number;
  topGenres: Tally[];
  decades: Tally[];
  /** Index 0 is a score of 1; index 9 a score of 10. */
  ratingHistogram: number[];
  averageRating: number | null;
  ratedCount: number;
  /** Titles finished per calendar year, keyed by year. */
  byYear: Record<string, number>;
  /** The year with the most, for the "your biggest year" line. */
  busiestYear: string | null;
}

export const EMPTY_STATS: WatchStats = {
  totalTitles: 0,
  films: 0,
  series: 0,
  episodes: 0,
  minutes: 0,
  titlesWithoutRuntime: 0,
  seriesWithUndatedTime: 0,
  topGenres: [],
  decades: [],
  ratingHistogram: Array.from({ length: 10 }, () => 0),
  averageRating: null,
  ratedCount: 0,
  byYear: {},
  busiestYear: null,
};

const MAX_TOP_GENRES = 6;

/**
 * The calendar year a title was finished in – on the visitor's calendar.
 *
 * `watchedAt` is an instant: the moment somebody pressed the button. The year it
 * belongs to is the one on their wall at that moment, not Greenwich's, and the
 * two disagree for a few hours either side of every New Year. Read in UTC, a
 * film finished at eight on New Year's Eve in New York had already landed in
 * the next year's review – one the person had not started yet. Local, like the
 * rest of the app's "today" (see `todayLocal`), and unlike the bare TMDB dates
 * `dates.ts` pins to UTC: those name a day and this names a moment.
 */
function yearOf(timestamp: string): string | null {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return null;

  return new Date(parsed).getFullYear().toString();
}

function tally(counts: Map<string, number>, limit?: number): Tally[] {
  const entries = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    // Alphabetical tie-break so two genres on the same count do not swap places
    // between renders.
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return limit === undefined ? entries : entries.slice(0, limit);
}

export function summarize(input: StatsInput): WatchStats {
  const { watched, episodesByShow, ratings, facts } = input;

  if (watched.length === 0 && Object.keys(episodesByShow).length === 0) {
    return EMPTY_STATS;
  }

  const genreCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  const byYear: Record<string, number> = {};
  const ratingHistogram = Array.from({ length: 10 }, () => 0);

  let films = 0;
  let series = 0;
  let minutes = 0;
  let titlesWithoutRuntime = 0;
  let ratingTotal = 0;
  let ratedCount = 0;

  for (const entry of watched) {
    const key = mediaItemKey(entry.id, entry.mediaType);
    const fact = facts[key];

    if (entry.mediaType === "movie") films += 1;
    else series += 1;

    const finishedIn = yearOf(entry.watchedAt);
    if (finishedIn) byYear[finishedIn] = (byYear[finishedIn] ?? 0) + 1;

    const rating = ratings[key]?.rating;
    if (rating !== undefined && rating >= 1 && rating <= 10) {
      ratingHistogram[rating - 1] += 1;
      ratingTotal += rating;
      ratedCount += 1;
    }

    if (!fact) {
      titlesWithoutRuntime += 1;
      continue;
    }

    for (const genre of fact.genres) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }

    if (fact.year && fact.year.length === 4) {
      const decade = `${fact.year.slice(0, 3)}0s`;
      decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
    }

    if (fact.runtime === null) {
      titlesWithoutRuntime += 1;
      continue;
    }

    if (entry.mediaType === "movie") {
      minutes += fact.runtime;
    } else {
      // A series is worth the episodes actually ticked, not its whole run. A show
      // marked watched with nothing ticked contributes no time, which is the
      // honest reading of "I have seen this" with no further detail.
      minutes += fact.runtime * (episodesByShow[entry.id] ?? 0);
    }
  }

  // Episodes of series that were never marked watched as a whole still count –
  // someone part-way through a show has watched those hours.
  let episodes = 0;
  for (const [tvId, count] of Object.entries(episodesByShow)) {
    episodes += count;

    const isAlreadyCounted = watched.some(
      (entry) => entry.mediaType === "tv" && entry.id === Number(tvId),
    );
    if (isAlreadyCounted) continue;

    const fact = facts[mediaItemKey(Number(tvId), "tv")];
    if (!fact || fact.runtime === null) {
      if (count > 0) titlesWithoutRuntime += 1;
      continue;
    }

    minutes += fact.runtime * count;
  }

  const yearEntries = Object.entries(byYear);
  const busiestYear =
    yearEntries.length > 0
      ? yearEntries.sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0][0]
      : null;

  return {
    totalTitles: watched.length,
    films,
    series,
    episodes,
    minutes,
    titlesWithoutRuntime,
    seriesWithUndatedTime: 0,
    topGenres: tally(genreCounts, MAX_TOP_GENRES),
    decades: tally(decadeCounts).sort((a, b) => a.name.localeCompare(b.name)),
    ratingHistogram,
    averageRating: ratedCount > 0 ? ratingTotal / ratedCount : null,
    ratedCount,
    byYear,
    busiestYear,
  };
}

/** The same summary, over one calendar year of finishing things. */
export function summarizeYear(input: StatsInput, year: string): WatchStats {
  const watched = input.watched.filter((entry) => yearOf(entry.watchedAt) === year);
  const stats = summarize({
    ...input,
    watched,
    // Episode ticks carry no date of their own – the store keeps which episodes
    // were ticked, and only when a show was last touched – so a year in review
    // counts the titles finished that year and leaves the episode total to the
    // all-time page rather than reporting a number it cannot attribute.
    episodesByShow: {},
  });

  // The same goes for the time those episodes took. Counting it in the year a
  // series was finished would hand that year every season of a show watched
  // across several; counting nothing, silently, made a finished series look
  // like zero minutes. So it is left out and the summary says how often.
  const seriesWithUndatedTime = watched.filter((entry) => {
    if (entry.mediaType !== "tv" || !((input.episodesByShow[entry.id] ?? 0) > 0)) {
      return false;
    }
    // A series with no known runtime is already reported as exactly that.
    const fact = input.facts[mediaItemKey(entry.id, "tv")];
    return fact !== undefined && fact.runtime !== null;
  }).length;

  return { ...stats, seriesWithUndatedTime };
}

/**
 * The watch time for the shared text, with what it leaves out – a shared
 * "2 hours" travels without the page's note explaining it. Null when there is
 * nothing to say.
 */
function describeWatchTime(stats: WatchStats): string | null {
  const untimed = stats.seriesWithUndatedTime;
  const series = `${untimed} series`;

  if (stats.minutes > 0) {
    const time = formatWatchTime(stats.minutes);
    return untimed > 0 ? `${time}, not counting ${series}` : time;
  }

  return untimed > 0 ? `time on ${series} not counted` : null;
}

/** Every year the record covers, newest first. */
export function yearsCovered(input: StatsInput): string[] {
  const years = new Set<string>();

  for (const entry of input.watched) {
    const year = yearOf(entry.watchedAt);
    if (year) years.add(year);
  }

  return [...years].sort((a, b) => b.localeCompare(a));
}

/** "9 days" reads better than "13,240 minutes" once the number gets big. */
export function formatWatchTime(minutes: number): string {
  // Rounded before the zero check, so a total that is positive but rounds to
  // nothing falls into "no time yet" rather than out the bottom of the ladder.
  const wholeMinutes = Number.isFinite(minutes) ? Math.round(minutes) : 0;
  if (wholeMinutes <= 0) return "no time yet";

  // Under an hour is reported in minutes rather than rounded up into them:
  // `Math.round(20 / 60)` is zero, which is how a single ticked episode – the
  // first thing anyone here ever counts – used to read back as "0 hours".
  if (wholeMinutes < 60) {
    return `${wholeMinutes} minute${wholeMinutes === 1 ? "" : "s"}`;
  }

  const hours = Math.round(wholeMinutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} of screen time`;
}

/** A line worth sharing, built from the numbers rather than from a template. */
export function buildStatsShareText(
  stats: WatchStats,
  label: string,
  url: string,
): string {
  const watchTime = describeWatchTime(stats);
  const parts = [
    `🎬 ${stats.films} film${stats.films === 1 ? "" : "s"}`,
    stats.episodes > 0 ? `📺 ${stats.episodes} episodes` : null,
    watchTime ? `⏱️ ${watchTime}` : null,
    stats.topGenres[0] ? `🏷️ mostly ${stats.topGenres[0].name}` : null,
  ].filter(Boolean);

  return `My WatchList ${label}\n${parts.join("\n")}\n${url}`;
}
