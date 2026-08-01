import { getCachedSeasonDetails, getCachedTVShowDetails } from "./tmdb-cache";
import { createSlug } from "./utils";
import {
  resolveUpNext,
  type ContinueWatchingSeed,
  type UpNextEpisode,
} from "./continue-watching";

/**
 * Turn ticked episodes into the "Continue Watching" row.
 *
 * Seed order is preserved: the client sends the shows it last touched first, and
 * that is the order someone expects to find them in.
 */
export async function getContinueWatchingEpisodes(
  seeds: ContinueWatchingSeed[],
): Promise<UpNextEpisode[]> {
  if (seeds.length === 0) return [];

  const detailResults = await Promise.allSettled(
    seeds.map((seed) => getCachedTVShowDetails(seed.tvId)),
  );

  const resolved = seeds.flatMap((seed, index) => {
    const result = detailResults[index];
    if (result.status !== "fulfilled") return [];

    const resolution = resolveUpNext(seed, result.value);
    if (!resolution) return [];

    return [{ seed, details: result.value, resolution }];
  });

  // The season is fetched only for the episode actually being offered, so a show
  // with fifteen seasons still costs one extra read.
  const seasonResults = await Promise.allSettled(
    resolved.map((entry) =>
      getCachedSeasonDetails(entry.seed.tvId, entry.resolution.next.seasonNumber),
    ),
  );

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
