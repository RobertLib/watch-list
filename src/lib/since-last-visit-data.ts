// The TMDB reads behind the "while you were away" row, kept apart from the pure
// date logic in `release-calendar.ts`.
//
// The split used to be a boundary as well as a separation: this half was
// `server-only`, so importing it from a Client Component was a build error and
// the bearer token could not reach the bundle. Neither survives the static
// export – this runs in the browser like everything else, token included. What
// it still buys is that the other half is pure functions over dates, and its
// tests need no network.

import { getCachedMovieDetails, getCachedTVShowDetails } from "./tmdb-cache";
import { createSlug } from "./utils";
import { getRegion } from "./settings";
import { getRegionCode } from "./region";
import { movieRelease } from "./movie-release-date";
import type { Episode } from "@/types/tmdb";
import {
  isDateOnly,
  type CalendarSeed,
  type MovieReleaseSource,
} from "./release-calendar";

/**
 * What happened while the visitor was away.
 *
 * The release calendar looks forward; this looks back, over exactly the window
 * between one visit and the next. It is the difference between a home page that
 * looks identical every time and one that has something to say the moment it
 * opens – which is the whole of what "worth coming back to" means.
 *
 * Same reads as the calendar, so the six-hour cache is already warm.
 */

export interface MissedRelease {
  key: string;
  id: number;
  mediaType: "movie" | "tv";
  slug: string;
  title: string;
  posterPath: string | null;
  /** `YYYY-MM-DD`, as TMDB reports it. */
  date: string;
  movieReleaseSource: MovieReleaseSource | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeName: string | null;
}

// Beyond this the answer stops being "since you were last here" and starts being
// a second release calendar, which the site already has.
const MAX_RESULTS = 12;
// Bound queued work per batch, while checking every followed title before the
// caller advances the last-visit timestamp.
const TITLES_PER_BATCH = 60;

export async function getReleasesSince(
  seeds: CalendarSeed[],
  since: string,
  today: string,
  region = getRegionCode(getRegion()),
  signal?: AbortSignal,
): Promise<MissedRelease[]> {
  signal?.throwIfAborted();
  if (seeds.length === 0 || !isDateOnly(since) || !isDateOnly(today)) return [];

  // A primary release can precede its local cinema premiere by months, so old
  // stored dates remain eligible. Calendar candidate caps cannot apply here:
  // acknowledging only part of this list would permanently skip its releases.
  const releases: MissedRelease[] = [];
  for (let start = 0; start < seeds.length; start += TITLES_PER_BATCH) {
    signal?.throwIfAborted();
    const batch = await getReleasesSinceBatch(
      seeds.slice(start, start + TITLES_PER_BATCH), since, today, region, signal,
    );
    signal?.throwIfAborted();
    releases.push(...batch);
  }

  return releases
    // Most recent first, including releases found in later batches.
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
    .slice(0, MAX_RESULTS);
}

async function getReleasesSinceBatch(
  seeds: CalendarSeed[],
  since: string,
  today: string,
  region: string,
  signal?: AbortSignal,
): Promise<MissedRelease[]> {
  const shows = seeds.filter((seed) => seed.mediaType === "tv");
  const movies = seeds.filter((seed) => seed.mediaType === "movie");
  const options = { signal, priority: "background" as const };

  const [showResults, movieResults] = await Promise.all([
    Promise.allSettled(shows.map((seed) => getCachedTVShowDetails(seed.id, options))),
    Promise.allSettled(movies.map((seed) => getCachedMovieDetails(seed.id, "release_dates", options))),
  ]);
  signal?.throwIfAborted();

  // The caller acknowledges this interval only after a complete check. A
  // transient failure, even beside usable results, must preserve the old
  // baseline so that unseen releases remain eligible for the next attempt.
  const failure = [...showResults, ...movieResults].find((result) =>
    result.status === "rejected" && !(
      result.reason instanceof Error && /^TMDB API error: 404\b/.test(result.reason.message)
    ),
  );
  if (failure?.status === "rejected") throw failure.reason;

  const releases: MissedRelease[] = [];

  showResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    const seed = shows[index];
    const details = result.value;
    // A warm detail can still call an episode "next" after its air date.
    // Check both markers before acknowledging the interval, keeping only the
    // newest eligible episode rather than letting a future next hide the last.
    const latest = [details.last_episode_to_air, details.next_episode_to_air]
      .filter((episode): episode is Episode & { air_date: string } =>
        episode !== null && episode !== undefined &&
        isDateOnly(episode.air_date) &&
        episode.air_date >= since && episode.air_date <= today &&
        Number.isInteger(episode.season_number) && episode.season_number >= 0 &&
        Number.isInteger(episode.episode_number) && episode.episode_number > 0,
      )
      .sort((a, b) => b.air_date.localeCompare(a.air_date) ||
        b.season_number - a.season_number || b.episode_number - a.episode_number)[0];
    if (!latest) return;

    const title = details.name || seed.title;

    releases.push({
      key: `tv-${seed.id}-${latest.season_number}-${latest.episode_number}`,
      id: seed.id,
      mediaType: "tv",
      slug: createSlug(title, seed.id),
      title,
      posterPath: details.poster_path ?? seed.posterPath,
      date: latest.air_date,
      movieReleaseSource: null,
      seasonNumber: latest.season_number,
      episodeNumber: latest.episode_number,
      episodeName: latest.name || null,
    });
  });

  movieResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    const seed = movies[index];
    const details = result.value;

    const release = movieRelease(details, region);
    if (!release || release.date < since || release.date > today) return;

    const title = details.title || seed.title;

    releases.push({
      key: `movie-${seed.id}`,
      id: seed.id,
      mediaType: "movie",
      slug: createSlug(title, seed.id),
      title,
      posterPath: details.poster_path ?? seed.posterPath,
      date: release.date,
      movieReleaseSource: release.source,
      seasonNumber: null,
      episodeNumber: null,
      episodeName: null,
    });
  });

  return releases;
}
