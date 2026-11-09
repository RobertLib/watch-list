/**
 * The rows on the home page, and how each one is loaded.
 *
 * Named here rather than inline in the carousels so the build can load the same
 * rows: the home page's prerendered HTML carries page one of each
 * (`build-time-tmdb.ts`), which is what gives a crawler real titles and links
 * on the site's most-linked page instead of eight skeletons.
 */

import { tmdbDiscoverApi } from "./tmdb-discover";
import {
  convertMovieToMediaItem,
  convertTrendingToMediaItem,
  convertTVShowToMediaItem,
} from "./media-converters";
import type { MediaItem } from "@/types/tmdb";

const HOME_ROW_LOADERS = {
  trending: async () =>
    (await tmdbDiscoverApi.getTrending("all", "week")).results.map(
      convertTrendingToMediaItem,
    ),
  nowPlaying: async () =>
    (await tmdbDiscoverApi.getNowPlayingMovies()).results.map(
      convertMovieToMediaItem,
    ),
  popularMovies: async () =>
    (await tmdbDiscoverApi.getPopularMovies()).results.map(
      convertMovieToMediaItem,
    ),
  upcomingMovies: async () =>
    (await tmdbDiscoverApi.getUpcomingMovies()).results.map(
      convertMovieToMediaItem,
    ),
  topRatedMovies: async () =>
    (await tmdbDiscoverApi.getTopRatedMovies()).results.map(
      convertMovieToMediaItem,
    ),
  airingToday: async () =>
    (await tmdbDiscoverApi.getAiringTodayTVShows()).results.map(
      convertTVShowToMediaItem,
    ),
  popularTVShows: async () =>
    (await tmdbDiscoverApi.getPopularTVShows()).results.map(
      convertTVShowToMediaItem,
    ),
  topRatedTVShows: async () =>
    (await tmdbDiscoverApi.getTopRatedTVShows()).results.map(
      convertTVShowToMediaItem,
    ),
} satisfies Record<string, () => Promise<MediaItem[]>>;

export type HomeRow = keyof typeof HOME_ROW_LOADERS;

export const HOME_ROWS = Object.keys(HOME_ROW_LOADERS) as HomeRow[];

export function loadHomeRow(row: HomeRow): Promise<MediaItem[]> {
  return HOME_ROW_LOADERS[row]();
}
