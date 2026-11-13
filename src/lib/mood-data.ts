/**
 * One page of a mood's picks – what `/mood/easy-watch` shows.
 *
 * Shared by the browser and the build for the same reason as
 * `genre-listing-data.ts`: the build loads page one into the prerendered HTML,
 * and it has to be the same listing the browser would load.
 */

import { tmdbDiscoverApi } from "./tmdb-discover";
import {
  convertMovieToMediaItem,
  convertTVShowToMediaItem,
} from "./media-converters";
import {
  streamingPlatformProviderFilter,
  type StreamingPlatform,
} from "./streaming-landing";
import type { Mood } from "./moods";
import type { FilterOptions } from "@/types/filters";
import type { MediaItem } from "@/types/tmdb";

/** How deep the pager goes. The value of these pages is the first screenful. */
export const MAX_MOOD_PAGE = 10;

export interface MoodPicksPage {
  movies: MediaItem[];
  shows: MediaItem[];
  moviesFailed: boolean;
  showsFailed: boolean;
  totalPages: number;
  /**
   * Films and series together, across every page – what decides whether a
   * mood's landing for one platform has enough on it to be indexed
   * (`isIndexableLanding`). Counts only the halves that answered.
   */
  totalResults: number;
}

/**
 * One half's filters, narrowed to a platform where the page is a landing for
 * one. The platform is pinned the way a genre landing pins it: by the filter
 * bar's own key, which wins over the visitor's saved services – the page is
 * about that platform, whatever they subscribe to.
 */
function withPlatform(
  filters: FilterOptions,
  platform: StreamingPlatform | undefined,
): FilterOptions {
  return platform
    ? { ...filters, watchProviders: streamingPlatformProviderFilter(platform) }
    : filters;
}

export async function loadMoodPicks(
  mood: Mood,
  page: number,
  platform?: StreamingPlatform,
): Promise<MoodPicksPage> {
  // Both halves are fetched together where the mood has both; a failure in
  // either leaves the other section available and offers a retry. A half the
  // mood does not have is not asked for at all – `discoverMovies` with no
  // filters is every film on TMDB, not none.
  const [movieResult, showResult] = await Promise.allSettled([
    mood.movie
      ? tmdbDiscoverApi.discoverMovies(page, withPlatform(mood.movie, platform))
      : Promise.resolve(null),
    mood.tv
      ? tmdbDiscoverApi.discoverTVShows(page, withPlatform(mood.tv, platform))
      : Promise.resolve(null),
  ]);

  const movies = movieResult.status === "fulfilled" ? movieResult.value : null;
  const shows = showResult.status === "fulfilled" ? showResult.value : null;

  return {
    movies: movies ? movies.results.map(convertMovieToMediaItem) : [],
    shows: shows ? shows.results.map(convertTVShowToMediaItem) : [],
    moviesFailed: movieResult.status === "rejected",
    showsFailed: showResult.status === "rejected",
    totalPages: Math.min(
      MAX_MOOD_PAGE,
      Math.max(1, movies?.total_pages ?? 0, shows?.total_pages ?? 0),
    ),
    totalResults: (movies?.total_results ?? 0) + (shows?.total_results ?? 0),
  };
}
