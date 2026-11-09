import { getCachedSeasonDetails, getCachedTVShowDetails, type TMDBRequestOptions } from "./tmdb-cache";
import { createSlug } from "./utils";
import { todayLocal } from "./dates";
import { throwIfAllRequestsFailed } from "./tmdb-results";
import { isDateOnly } from "./release-calendar";
import type { Season, SeasonDetails, TVShowDetails } from "@/types/tmdb";
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

/**
 * The regular seasons whose dated episode lists are needed once a special has
 * become the last-aired marker – which used to be every one of them, thirty
 * reads and more for a long-running show.
 *
 * The season list still dates each season by its first episode. A season that
 * has premiered after another one means the earlier one has finished, so only
 * the latest premiered season can be part-way through. Beyond it, a season
 * dated after today has not started; one with no usable date might still hide
 * aired episodes, so it is read rather than guessed at.
 */
function seasonsToDate(
  seasons: Season[],
  today: string,
): { latestPremiered: number; toRead: number[] } {
  const regular = seasons.filter((season) =>
    Number.isInteger(season.season_number) && season.season_number > 0,
  );
  const latestPremiered = Math.max(0, ...regular
    .filter((season) => isDateOnly(season.air_date) && season.air_date <= today)
    .map((season) => season.season_number));

  return {
    latestPremiered,
    toRead: [...new Set(regular
      .filter((season) =>
        season.season_number === latestPremiered ||
        (season.season_number > latestPremiered && !isDateOnly(season.air_date)),
      )
      .map((season) => season.season_number))],
  };
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
    let upNextFrom: Parameters<typeof resolveUpNext>[1] = details;

    // A special can replace the regular run's last-airing marker. Season counts
    // include announced episodes, so the season that may be part-way through
    // needs its dated episode list for both the next available episode and an
    // accurate progress denominator.
    if (details.last_episode_to_air?.season_number === 0) {
      const { latestPremiered, toRead } = seasonsToDate(details.seasons ?? [], today);
      const seasonResults = await Promise.allSettled(
        toRead.map((seasonNumber) => getCachedSeasonDetails(seed.tvId, seasonNumber, options)),
      );
      options.signal?.throwIfAborted();
      // A missing season could change which episode comes next. Do not turn
      // that unknown run into an apparently complete progress bar.
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
      const loaded = datedSeasons;
      upNextFrom = {
        seasons: (details.seasons ?? []).map((season) =>
          loaded.find((dated) => dated.season_number === season.season_number) ?? season,
        ),
        // The latest season to have premiered stands in for the special as the
        // marker, which makes every season before it count as fully aired –
        // what the regular path assumes of the seasons before its own marker.
        // Without one, the special stays: only dated lists can count anything.
        last_episode_to_air: latestPremiered > 0
          ? { season_number: latestPremiered, episode_number: 0 }
          : details.last_episode_to_air,
        // Advancing that stand-in by a scheduled episode would count whole
        // announced seasons as aired; the dated lists already know what has.
        next_episode_to_air: null,
      };
    }

    const resolution = resolveUpNext(seed, upNextFrom, today);
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

  // Regular markers need only the offered season. The special-marker path may
  // already hold it from determining what has aired; an earlier season it
  // counted from the season list alone is read here like any other.
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
