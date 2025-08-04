import { getCachedSeasonDetails, getCachedTVShowDetails, type TMDBRequestOptions } from "./tmdb-cache";
import { createSlug } from "./utils";
import { todayLocal } from "./dates";
import { throwIfAllRequestsFailed } from "./tmdb-results";
import type { SeasonDetails, TVShowDetails } from "@/types/tmdb";
import {
  resolveUpNext,
  type ContinueWatchingSeed,
  type UpNextEpisode,
  type UpNextResolution,
} from "./continue-watching";

const MAX_EPISODES = 12;
const SHOWS_PER_BATCH = 12;

interface ResolvedShow {
  seed: ContinueWatchingSeed;
  details: TVShowDetails;
  resolution: UpNextResolution;
  datedSeasons?: SeasonDetails[];
}

async function resolveShows(
  seeds: ContinueWatchingSeed[],
  today: string,
  options: TMDBRequestOptions,
): Promise<PromiseSettledResult<ResolvedShow | null>[]> {
  const detailResults = await Promise.allSettled(
    seeds.map((seed) => getCachedTVShowDetails(seed.tvId, options)),
  );
  options.signal?.throwIfAborted();

  return Promise.allSettled(seeds.map(async (seed, index) => {
    const result = detailResults[index];
    if (result.status !== "fulfilled") throw result.reason;

    const details = result.value;
    let datedSeasons: SeasonDetails[] | undefined;

    // A special can replace the regular run's last-airing marker. Season counts
    // include announced episodes, so only dated episode lists can establish
    // both the next available episode and an accurate progress denominator.
    if (details.last_episode_to_air?.season_number === 0) {
      const seasonResults = await Promise.allSettled(
        (details.seasons ?? [])
          .filter((season) => season.season_number > 0)
          .map((season) => getCachedSeasonDetails(seed.tvId, season.season_number, options)),
      );
      options.signal?.throwIfAborted();
      // A missing earlier season could change which episode comes next. Do not
      // turn that unknown run into an apparently complete progress bar.
      const failedSeason = seasonResults.find((season) => season.status === "rejected");
      if (failedSeason?.status === "rejected") {
        // Even a season's 404 leaves this existing show's aired run unknown;
        // only a 404 on the show itself can be treated as a removed title.
        throw new Error(`Could not load aired episodes for TV show ${seed.tvId}`, {
          cause: failedSeason.reason,
        });
      }
      datedSeasons = seasonResults.flatMap((season) =>
        season.status === "fulfilled" ? [season.value] : [],
      );
    }

    const resolution = resolveUpNext(seed, {
      ...details,
      seasons: datedSeasons ?? details.seasons,
    }, today);
    if (!resolution) return null;

    return { seed, details, resolution, datedSeasons };
  }));
}

/**
 * Turn ticked episodes into the "Continue Watching" row.
 *
 * Walk the history in bounded batches until twelve actual continuations are
 * found. Completed shows keep their ticks, so capping the seeds would let those
 * shows crowd an older unfinished series out of the row forever.
 * Seed order is preserved: the client sends the shows it last touched first.
 */
export async function getContinueWatchingEpisodes(
  seeds: ContinueWatchingSeed[],
  today = todayLocal(),
  signal?: AbortSignal,
): Promise<UpNextEpisode[]> {
  signal?.throwIfAborted();
  if (seeds.length === 0) return [];

  const entries: PromiseSettledResult<ResolvedShow | null>[] = [];
  const resolved: ResolvedShow[] = [];
  const options = { signal, priority: "background" as const };

  for (
    let offset = 0;
    offset < seeds.length && resolved.length < MAX_EPISODES;
    offset += SHOWS_PER_BATCH
  ) {
    signal?.throwIfAborted();
    const batch = await resolveShows(seeds.slice(offset, offset + SHOWS_PER_BATCH), today, options);
    signal?.throwIfAborted();
    entries.push(...batch);
    for (const entry of batch) {
      if (entry.status !== "fulfilled" || !entry.value) continue;
      resolved.push(entry.value);
      if (resolved.length === MAX_EPISODES) break;
    }
  }

  // A caught-up show has no card to preserve. It must not hide failed lookups
  // when no continuation could be resolved, including required dated seasons
  // after a special. Available cards and confirmed removed shows still survive.
  throwIfAllRequestsFailed(entries.filter(
    (entry) => entry.status !== "fulfilled" || entry.value !== null,
  ));

  // Regular markers need only the offered season. The special-marker path has
  // already fetched its episode metadata while determining what has aired.
  const seasonResults = await Promise.allSettled(
    resolved.map((entry) => {
      const seasonNumber = entry.resolution.next.seasonNumber;
      const loadedSeason = entry.datedSeasons?.find(
        (season) => season.season_number === seasonNumber,
      );
      return loadedSeason
        ? Promise.resolve(loadedSeason)
        : getCachedSeasonDetails(entry.seed.tvId, seasonNumber, options);
    }),
  );
  signal?.throwIfAborted();

  return resolved.map((entry, index) => {
    const { seed, details, resolution } = entry;
    const { seasonNumber, episodeNumber } = resolution.next;

    const seasonResult = seasonResults[index];
    const episode =
      seasonResult.status === "fulfilled"
        ? seasonResult.value.episodes?.find(
            (candidate) => candidate.episode_number === episodeNumber,
          )
        : undefined;

    // TMDB is preferred over the stored copy for both: a show renamed or
    // re-postered upstream should not keep the version saved months ago.
    const showName = details.name || seed.name;

    return {
      tvId: seed.tvId,
      slug: createSlug(showName, seed.tvId),
      showName,
      posterPath: details.poster_path ?? seed.posterPath,
      seasonNumber,
      episodeNumber,
      episodeName: episode?.name ?? null,
      stillPath: episode?.still_path ?? null,
      airDate: episode?.air_date ?? null,
      runtime: episode?.runtime ?? null,
      watchedCount: resolution.watchedCount,
      airedCount: resolution.airedCount,
    };
  });
}
