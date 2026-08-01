// Reaches TMDB, so importing it from a Client Component is a build error.
import "server-only";

import { getCachedMovieDetails, getCachedTVShowDetails } from "./tmdb-cache";
import { createSlug } from "./utils";
import {
  isDateOnly,
  selectCalendarCandidates,
  type CalendarSeed,
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
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeName: string | null;
}

// Beyond this the answer stops being "since you were last here" and starts being
// a second release calendar, which the site already has.
const MAX_RESULTS = 12;

export async function getReleasesSince(
  seeds: CalendarSeed[],
  since: string,
  today: string,
): Promise<MissedRelease[]> {
  if (seeds.length === 0 || !isDateOnly(since) || !isDateOnly(today)) return [];

  // The same candidate selection the calendar uses: every followed show, and only
  // films whose stored date makes them worth a request.
  const { shows, movies } = selectCalendarCandidates(seeds, since);
  if (shows.length === 0 && movies.length === 0) return [];

  const [showResults, movieResults] = await Promise.all([
    Promise.allSettled(shows.map((seed) => getCachedTVShowDetails(seed.id))),
    Promise.allSettled(movies.map((seed) => getCachedMovieDetails(seed.id))),
  ]);

  const releases: MissedRelease[] = [];

  showResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    const seed = shows[index];
    const details = result.value;
    const last = details.last_episode_to_air;

    // Only the most recent episode is available without paging the whole season,
    // so a show that aired three episodes during a long absence reports the
    // newest. That is the one someone would go to anyway.
    if (!last || !isDateOnly(last.air_date)) return;
    if (last.air_date < since || last.air_date > today) return;

    const title = details.name || seed.title;

    releases.push({
      key: `tv-${seed.id}-${last.season_number}-${last.episode_number}`,
      id: seed.id,
      mediaType: "tv",
      slug: createSlug(title, seed.id),
      title,
      posterPath: details.poster_path ?? seed.posterPath,
      date: last.air_date,
      seasonNumber: last.season_number,
      episodeNumber: last.episode_number,
      episodeName: last.name || null,
    });
  });

  movieResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    const seed = movies[index];
    const details = result.value;

    if (!isDateOnly(details.release_date)) return;
    if (details.release_date < since || details.release_date > today) return;

    const title = details.title || seed.title;

    releases.push({
      key: `movie-${seed.id}`,
      id: seed.id,
      mediaType: "movie",
      slug: createSlug(title, seed.id),
      title,
      posterPath: details.poster_path ?? seed.posterPath,
      date: details.release_date,
      seasonNumber: null,
      episodeNumber: null,
      episodeName: null,
    });
  });

  return releases
    // Most recent first: it is the one most likely to be watched tonight.
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
    .slice(0, MAX_RESULTS);
}
