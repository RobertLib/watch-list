import { getCachedMovieDetails, getCachedTVShowDetails } from "./tmdb-cache";
import { createSlug, mediaItemKey } from "./utils";
import { throwIfAllRequestsFailed } from "./tmdb-results";
import { getRegion } from "./settings";
import { getRegionCode } from "./region";
import { movieRelease } from "./movie-release-date";
import {
  isDateOnly,
  selectCalendarCandidates,
  type AwaitedTitle,
  type CalendarEvent,
  type CalendarSeed,
  type ReleaseCalendar,
} from "./release-calendar";

function isMissingTitle(error: unknown): boolean {
  return error instanceof Error && /^TMDB API error: 404\b/.test(error.message);
}

/**
 * Build the release calendar for everything the visitor follows.
 *
 * Only dates from today onwards are returned: a calendar of things that already
 * happened is what the "Continue Watching" row and the watchlist are for.
 */
export async function getReleaseCalendarFor(
  seeds: CalendarSeed[],
  today: string,
  region = getRegionCode(getRegion()),
  signal?: AbortSignal,
): Promise<ReleaseCalendar> {
  signal?.throwIfAborted();
  const empty: ReleaseCalendar = {
    events: [],
    awaiting: [],
    today,
    checked: 0,
    eligible: 0,
  };
  if (seeds.length === 0) return empty;

  const { shows, movies, eligible } = selectCalendarCandidates(seeds, today, {
    includeReleasedMovies: true,
  });
  if (shows.length === 0 && movies.length === 0) return empty;

  // A calendar is a bulk enrichment. Interactive searches take the next free
  // slot, and leaving the page releases work no other caller still needs.
  const options = { signal, priority: "background" as const };
  const [showResults, movieResults] = await Promise.all([
    Promise.allSettled(shows.map((seed) => getCachedTVShowDetails(seed.id, options))),
    Promise.allSettled(movies.map((seed) => getCachedMovieDetails(seed.id, "release_dates", options))),
  ]);
  // Cancellation ends this load even when an earlier detail already succeeded.
  signal?.throwIfAborted();
  throwIfAllRequestsFailed([...showResults, ...movieResults]);

  const events: CalendarEvent[] = [];
  const awaiting: AwaitedTitle[] = [];
  const failedKeys: string[] = [];
  // A 404 answers the question for a removed title. An outage does not, and
  // must remain distinguishable from titles outside the bounded lookup.
  let checked = 0;

  showResults.forEach((result, index) => {
    const seed = shows[index];
    if (result.status !== "fulfilled") {
      if (isMissingTitle(result.reason)) checked += 1;
      else failedKeys.push(mediaItemKey(seed.id, seed.mediaType));
      return;
    }
    checked += 1;

    const details = result.value;
    const title = details.name || seed.title;
    const slug = createSlug(title, seed.id);
    const posterPath = details.poster_path ?? seed.posterPath;
    const last = details.last_episode_to_air;
    const next = details.next_episode_to_air;

    // TMDB can advance its next marker during the air date itself. Keep that
    // day's released episode on the calendar, including an ended show's finale.
    const scheduled = [
      ...(last?.air_date === today ? [last] : []),
      ...(next && isDateOnly(next.air_date) && next.air_date >= today ? [next] : []),
    ];
    const seenEpisodes = new Set<string>();
    for (const episode of scheduled) {
      if (!isDateOnly(episode.air_date)) continue;
      const key = `tv-${seed.id}-${episode.season_number}-${episode.episode_number}`;
      if (seenEpisodes.has(key)) continue;
      seenEpisodes.add(key);
      events.push({
        key,
        id: seed.id,
        mediaType: "tv",
        slug,
        title,
        posterPath,
        date: episode.air_date,
        movieReleaseSource: null,
        seasonNumber: episode.season_number,
        episodeNumber: episode.episode_number,
        episodeName: episode.name || null,
        stillPath: episode.still_path ?? null,
      });
    }
    if (seenEpisodes.size > 0) return;

    // No episode scheduled. Worth listing only while the show is actually
    // coming back – a finished series has nothing left to wait for.
    if (details.in_production || details.status === "Returning Series") {
      awaiting.push({
        id: seed.id,
        mediaType: "tv",
        slug,
        title,
        posterPath,
        status: details.status || "Returning Series",
      });
    }
  });

  movieResults.forEach((result, index) => {
    const seed = movies[index];
    if (result.status !== "fulfilled") {
      if (isMissingTitle(result.reason)) checked += 1;
      else failedKeys.push(mediaItemKey(seed.id, seed.mediaType));
      return;
    }
    checked += 1;

    const details = result.value;
    // TMDB is the authority here, not the date the client cached: a film pushed
    // to next spring is precisely what this page exists to report.
    const release = movieRelease(details, region);
    const title = details.title || seed.title;
    if (!release && ["Rumored", "Planned", "In Production", "Post Production"].includes(details.status)) {
      awaiting.push({
        id: seed.id,
        mediaType: "movie",
        slug: createSlug(title, seed.id),
        title,
        posterPath: details.poster_path ?? seed.posterPath,
        status: details.status,
      });
    }
    if (!release || release.date < today) {
      return;
    }

    events.push({
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
      stillPath: null,
    });
  });

  return {
    // Soonest first, with a stable tie-break so two titles on the same day do
    // not swap places between refetches.
    events: events.sort(
      (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
    ),
    awaiting: awaiting.sort((a, b) => a.title.localeCompare(b.title)),
    today,
    checked,
    eligible,
    ...(failedKeys.length > 0 ? { failedKeys } : {}),
  };
}
