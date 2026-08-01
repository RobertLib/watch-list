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
 * Pure, and separate from the TMDB reads in `stats-server.ts`, so every
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
  topGenres: [],
  decades: [],
  ratingHistogram: Array.from({ length: 10 }, () => 0),
  averageRating: null,
  ratedCount: 0,
  byYear: {},
  busiestYear: null,
};

const MAX_TOP_GENRES = 6;

function yearOf(timestamp: string): string | null {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return null;

  return new Date(parsed).getUTCFullYear().toString();
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
    if (fact?.runtime) minutes += fact.runtime * count;
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
  return summarize({
    ...input,
    watched: input.watched.filter((entry) => yearOf(entry.watchedAt) === year),
    // Episode ticks carry no date of their own, so a year in review counts the
    // titles finished that year and leaves the episode total to the all-time
    // page rather than reporting a number it cannot actually attribute.
    episodesByShow: {},
  });
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
  if (minutes <= 0) return "no time yet";

  const hours = Math.round(minutes / 60);
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
  const parts = [
    `🎬 ${stats.films} film${stats.films === 1 ? "" : "s"}`,
    stats.episodes > 0 ? `📺 ${stats.episodes} episodes` : null,
    stats.minutes > 0 ? `⏱️ ${formatWatchTime(stats.minutes)}` : null,
    stats.topGenres[0] ? `🏷️ mostly ${stats.topGenres[0].name}` : null,
  ].filter(Boolean);

  return `My WatchList ${label}\n${parts.join("\n")}\n${url}`;
}
