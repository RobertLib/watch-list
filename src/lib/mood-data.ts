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
import type { Mood } from "./moods";
import type { MediaItem } from "@/types/tmdb";

/** How deep the pager goes. The value of these pages is the first screenful. */
export const MAX_MOOD_PAGE = 10;

export interface MoodPicksPage {
  movies: MediaItem[];
  shows: MediaItem[];
  moviesFailed: boolean;
  showsFailed: boolean;
  totalPages: number;
}

export async function loadMoodPicks(
  mood: Mood,
  page: number,
): Promise<MoodPicksPage> {
  // Both halves are fetched together where the mood has a television side; a
  // failure in either leaves the other section available and offers a retry.
  const [movieResult, showResult] = await Promise.allSettled([
    tmdbDiscoverApi.discoverMovies(page, mood.movie),
    mood.tv
      ? tmdbDiscoverApi.discoverTVShows(page, mood.tv)
      : Promise.resolve(null),
  ]);

  return {
    movies:
      movieResult.status === "fulfilled"
        ? movieResult.value.results.map(convertMovieToMediaItem)
        : [],
    shows:
      showResult.status === "fulfilled" && showResult.value
        ? showResult.value.results.map(convertTVShowToMediaItem)
        : [],
    moviesFailed: movieResult.status === "rejected",
    showsFailed: showResult.status === "rejected",
    totalPages: Math.min(
      MAX_MOOD_PAGE,
      Math.max(
        1,
        movieResult.status === "fulfilled" ? movieResult.value.total_pages : 0,
        showResult.status === "fulfilled" && showResult.value
          ? showResult.value.total_pages
          : 0,
      ),
    ),
  };
}
