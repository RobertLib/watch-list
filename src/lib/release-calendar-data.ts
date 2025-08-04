import { getCachedMovieDetails, getCachedTVShowDetails } from "./tmdb-cache";
import { createSlug } from "./utils";
import {
  isDateOnly,
  selectCalendarCandidates,
  type AwaitedShow,
  type CalendarEvent,
  type CalendarSeed,
  type ReleaseCalendar,
} from "./release-calendar";

/**
 * Build the release calendar for everything the visitor follows.
 *
 * Only dates from today onwards are returned: a calendar of things that already
 * happened is what the "Continue Watching" row and the watchlist are for.
 */
export async function getReleaseCalendarFor(
  seeds: CalendarSeed[],
  today: string,
): Promise<ReleaseCalendar> {
  const empty: ReleaseCalendar = { events: [], awaiting: [], today };
  if (seeds.length === 0) return empty;

  const { shows, movies } = selectCalendarCandidates(seeds, today);
  if (shows.length === 0 && movies.length === 0) return empty;

  const [showResults, movieResults] = await Promise.all([
    Promise.allSettled(shows.map((seed) => getCachedTVShowDetails(seed.id))),
    Promise.allSettled(movies.map((seed) => getCachedMovieDetails(seed.id))),
  ]);

  const events: CalendarEvent[] = [];
  const awaiting: AwaitedShow[] = [];

  showResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    const seed = shows[index];
    const details = result.value;
    const title = details.name || seed.title;
    const slug = createSlug(title, seed.id);
    const posterPath = details.poster_path ?? seed.posterPath;
    const next = details.next_episode_to_air;

    if (next && isDateOnly(next.air_date) && next.air_date >= today) {
      events.push({
        key: `tv-${seed.id}-${next.season_number}-${next.episode_number}`,
        id: seed.id,
        mediaType: "tv",
        slug,
        title,
        posterPath,
        date: next.air_date,
        seasonNumber: next.season_number,
        episodeNumber: next.episode_number,
        episodeName: next.name || null,
        stillPath: next.still_path ?? null,
      });
      return;
    }

    // No episode scheduled. Worth listing only while the show is actually
    // coming back – a finished series has nothing left to wait for.
    if (details.in_production || details.status === "Returning Series") {
      awaiting.push({
        id: seed.id,
        slug,
        title,
        posterPath,
        status: details.status || "Returning Series",
      });
    }
  });

  movieResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    const seed = movies[index];
    const details = result.value;
    // TMDB is the authority here, not the date the client cached: a film pushed
    // to next spring is precisely what this page exists to report.
    if (!isDateOnly(details.release_date) || details.release_date < today) {
      return;
    }

    const title = details.title || seed.title;
    events.push({
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
  };
}
