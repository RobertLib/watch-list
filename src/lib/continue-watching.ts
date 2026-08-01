// Types and pure logic only. The TMDB reads live in `continue-watching-server.ts`
// so that the row's Client Component can import these types and helpers without
// dragging in a `server-only` module, which is a hard error rather than a
// warning.
import type { Episode, Season } from "@/types/tmdb";

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

// A row nobody scrolls to the end of does not need more, and every entry costs
// two TMDB reads.
const MAX_SHOWS = 12;
// Guards against a hand-edited store: the seeds drive loops below.
const MAX_SEASONS_PER_SHOW = 100;
const MAX_EPISODES_PER_SEASON = 2000;
const MAX_NAME_LENGTH = 200;

function episodeKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}-${episodeNumber}`;
}

/**
 * A server action is a public endpoint and the payload comes straight out of
 * browser storage, so nothing here is trusted: the seeds are rebuilt from the
 * fields we understand, bounded, and ordered newest activity first so the cap
 * keeps the shows someone is actually working through.
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

  return seeds
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_SHOWS);
}

/** A season/episode pair that has already been broadcast. */
export interface AiredEpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
}

/**
 * How many episodes of a season have aired, according to `last_episode_to_air`.
 *
 * `episode_count` counts a whole ordered season, including episodes still weeks
 * away, so it cannot answer this on its own – offering next Thursday's episode
 * as "up next" would be worse than offering nothing. A `last_episode_to_air`
 * that points at season 0 (a special aired most recently) says nothing about the
 * regular run, so in that case the counts are taken at face value.
 */
function airedCountForSeason(
  season: Pick<Season, "season_number" | "episode_count">,
  lastAired: Pick<Episode, "season_number" | "episode_number">,
): number {
  const total = Math.min(
    Math.max(season.episode_count, 0),
    MAX_EPISODES_PER_SEASON,
  );

  if (lastAired.season_number < 1) return total;
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
  seasons: Pick<Season, "season_number" | "episode_count">[],
  lastAired: Pick<Episode, "season_number" | "episode_number"> | null,
): AiredEpisodeRef[] {
  if (!lastAired) return [];

  const ordered = seasons
    .filter((season) => season.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number);

  const aired: AiredEpisodeRef[] = [];

  for (const season of ordered) {
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
  // Narrowed to the two fields this actually reads rather than to the whole
  // `TVShowDetails`, which a full detail response still satisfies.
  details: {
    seasons?: Pick<Season, "season_number" | "episode_count">[];
    last_episode_to_air: Pick<
      Episode,
      "season_number" | "episode_number"
    > | null;
  },
): UpNextResolution | null {
  const aired = airedEpisodes(
    details.seasons ?? [],
    details.last_episode_to_air,
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
