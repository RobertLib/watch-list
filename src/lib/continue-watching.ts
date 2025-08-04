// Types and pure logic only, kept apart from the TMDB reads in
// `continue-watching-data.ts`. Originally so the row could import these types
// without dragging in a `server-only` module; now because everything here is a
// pure function over a season and a set of ticks, and testable as one.
import type { Episode, Season } from "@/types/tmdb";
import { isDateOnly } from "./release-calendar";
import { todayLocal } from "./dates";

/** One show's ticked episodes, as the client sends them. */
export interface ContinueWatchingSeed {
  tvId: number;
  name: string;
  posterPath: string | null;
  /** Watched episode numbers, keyed by season number. */
  seasons: Record<string, number[]>;
  updatedAt: string;
}

/** The next episode someone can actually watch, plus what a card needs to show it. */
export interface UpNextEpisode {
  tvId: number;
  /** Ready-made href target for the show's detail page. */
  slug: string;
  showName: string;
  posterPath: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtime: number | null;
  /** Ticked episodes and aired episodes, for the progress bar. */
  watchedCount: number;
  airedCount: number;
}

// Guards against a hand-edited store: the seeds drive loops below.
const MAX_SEASONS_PER_SHOW = 100;
const MAX_EPISODES_PER_SEASON = 2000;
const MAX_NAME_LENGTH = 200;

function episodeKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}-${episodeNumber}`;
}

/**
 * The payload comes straight out of browser storage, which anyone can edit, so
 * nothing here is trusted: the seeds are rebuilt from the fields we understand,
 * bounded per show, and ordered newest activity first. The full history must
 * survive here: only the resolver knows which shows still have something to
 * watch, and it caps those results rather than the seeds.
 */
export function sanitizeContinueWatchingSeeds(
  input: unknown,
): ContinueWatchingSeed[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<number>();
  const seeds: ContinueWatchingSeed[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;

    const { tvId, name, posterPath, seasons, updatedAt } = entry as Record<
      string,
      unknown
    >;

    // Strict about the type, unlike the season keys below: a season number is a
    // JSON object key and therefore always a string, while an id that arrives as
    // one did not come from our own store.
    if (typeof tvId !== "number" || !Number.isInteger(tvId) || tvId <= 0) {
      continue;
    }

    const id = tvId;
    if (seen.has(id)) continue;
    if (!seasons || typeof seasons !== "object" || Array.isArray(seasons)) {
      continue;
    }

    const cleanSeasons: Record<string, number[]> = {};

    for (const [seasonKey, episodes] of Object.entries(
      seasons as Record<string, unknown>,
    ).slice(0, MAX_SEASONS_PER_SHOW)) {
      const seasonNumber = Number(seasonKey);
      // Season 0 holds the specials on TMDB, so it stays allowed.
      if (!Number.isInteger(seasonNumber) || seasonNumber < 0) continue;
      if (!Array.isArray(episodes)) continue;

      const cleaned = [
        ...new Set(
          episodes.filter(
            (episode): episode is number =>
              Number.isInteger(episode) &&
              episode >= 0 &&
              episode <= MAX_EPISODES_PER_SEASON,
          ),
        ),
      ].sort((a, b) => a - b);

      if (cleaned.length > 0) cleanSeasons[String(seasonNumber)] = cleaned;
    }

    if (Object.keys(cleanSeasons).length === 0) continue;

    seen.add(id);
    seeds.push({
      tvId: id,
      name: typeof name === "string" ? name.slice(0, MAX_NAME_LENGTH) : "",
      posterPath: typeof posterPath === "string" ? posterPath : null,
      seasons: cleanSeasons,
      updatedAt: typeof updatedAt === "string" ? updatedAt : "",
    });
  }

  return seeds.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** A season/episode pair that has already been broadcast. */
export interface AiredEpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
}

type AiredSeason = Pick<Season, "season_number" | "episode_count"> & {
  episodes?: Pick<Episode, "episode_number" | "air_date">[];
};

/**
 * How many episodes of a season have aired, according to `last_episode_to_air`.
 *
 * `episode_count` counts a whole ordered season, including episodes still weeks
 * away, so it cannot answer this on its own – offering next Thursday's episode
 * as "up next" would be worse than offering nothing. A `last_episode_to_air`
 * that points at season 0 (a special aired most recently) says nothing about the
 * regular run. That case needs the individual episodes' broadcast dates.
 */
function airedCountForSeason(
  season: Pick<Season, "season_number" | "episode_count">,
  lastAired: Pick<Episode, "season_number" | "episode_number">,
): number {
  const total = Math.min(
    Math.max(season.episode_count, 0),
    MAX_EPISODES_PER_SEASON,
  );

  if (lastAired.season_number < 1) return 0;
  if (season.season_number > lastAired.season_number) return 0;
  if (season.season_number < lastAired.season_number) return total;

  // The season currently airing: the marker is the authority, not the count.
  return Math.max(
    0,
    Math.min(lastAired.episode_number, MAX_EPISODES_PER_SEASON),
  );
}

/**
 * Every aired episode of the regular run, in broadcast order.
 *
 * Specials are left out deliberately: they are optional viewing, and letting one
 * sit between two seasons would stall the row on an episode most people never
 * intend to watch.
 */
export function airedEpisodes(
  seasons: AiredSeason[],
  lastAired: Pick<Episode, "season_number" | "episode_number"> | null,
  today = todayLocal(),
): AiredEpisodeRef[] {
  if (!lastAired) return [];

  const ordered = seasons
    .filter((season) => season.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number);

  const aired: AiredEpisodeRef[] = [];

  for (const season of ordered) {
    if (season.episodes) {
      const numbers = [...new Set(
        season.episodes
          .filter((episode) =>
            Number.isInteger(episode.episode_number) &&
            episode.episode_number > 0 &&
            episode.episode_number <= MAX_EPISODES_PER_SEASON &&
            isDateOnly(episode.air_date) &&
            episode.air_date <= today,
          )
          .map((episode) => episode.episode_number),
      )].sort((a, b) => a - b);
      for (const episodeNumber of numbers) {
        aired.push({ seasonNumber: season.season_number, episodeNumber });
      }
      continue;
    }

    const count = airedCountForSeason(season, lastAired);
    for (let episode = 1; episode <= count; episode++) {
      aired.push({
        seasonNumber: season.season_number,
        episodeNumber: episode,
      });
    }
  }

  return aired;
}

export interface UpNextResolution {
  next: AiredEpisodeRef;
  watchedCount: number;
  airedCount: number;
}

/**
 * The first aired episode the viewer has not ticked, or null when they are
 * caught up. Being caught up is not an error – it just means the show has
 * nothing to continue, and upcoming episodes belong in the release calendar
 * rather than in this row.
 */
export function resolveUpNext(
  seed: Pick<ContinueWatchingSeed, "seasons">,
  // Narrowed to the fields this actually reads rather than to the whole
  // `TVShowDetails`, which a full detail response still satisfies.
  details: {
    seasons?: AiredSeason[];
    last_episode_to_air: Pick<
      Episode,
      "season_number" | "episode_number"
    > | null;
    next_episode_to_air?: Pick<
      Episode,
      "season_number" | "episode_number" | "air_date"
    > | null;
  },
  today = todayLocal(),
): UpNextResolution | null {
  let lastAired = details.last_episode_to_air;
  const scheduled = details.next_episode_to_air;
  const scheduledDay = scheduled?.air_date;
  const scheduledDate = isDateOnly(scheduledDay)
    ? new Date(`${scheduledDay}T00:00:00.000Z`)
    : null;
  // Details may still be cached from yesterday. A known regular episode whose
  // air date has arrived can advance the marker without another network read.
  // A last-airing special still requires individual season dates: advancing it
  // would otherwise turn whole announced seasons into an assumed aired run.
  if (
    scheduled &&
    Number.isInteger(scheduled.season_number) && scheduled.season_number > 0 &&
    Number.isInteger(scheduled.episode_number) && scheduled.episode_number > 0 &&
    scheduled.episode_number <= MAX_EPISODES_PER_SEASON &&
    isDateOnly(scheduledDay) &&
    scheduledDate && Number.isFinite(scheduledDate.getTime()) &&
    scheduledDate.toISOString().slice(0, 10) === scheduledDay &&
    scheduledDay <= today &&
    (!lastAired || (
      lastAired.season_number > 0 && (
        scheduled.season_number > lastAired.season_number ||
        (scheduled.season_number === lastAired.season_number &&
          scheduled.episode_number > lastAired.episode_number)
      )
    ))
  ) {
    lastAired = scheduled;
  }
  const aired = airedEpisodes(
    details.seasons ?? [],
    lastAired,
    today,
  );
  if (aired.length === 0) return null;

  const watched = new Set<string>();
  for (const [seasonKey, episodes] of Object.entries(seed.seasons)) {
    for (const episode of episodes) {
      watched.add(episodeKey(Number(seasonKey), episode));
    }
  }

  const next = aired.find(
    (ref) => !watched.has(episodeKey(ref.seasonNumber, ref.episodeNumber)),
  );
  if (!next) return null;

  return {
    next,
    // Only ticks inside the aired run count, so the bar can never read 11/10
    // after TMDB renumbers a season.
    watchedCount: aired.filter((ref) =>
      watched.has(episodeKey(ref.seasonNumber, ref.episodeNumber)),
    ).length,
    airedCount: aired.length,
  };
}
