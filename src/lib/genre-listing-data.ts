/**
 * One page of a genre listing – what `/genres/movie/action-28` shows.
 *
 * Shared by the two places that read it: the browser, which loads it for the
 * visitor's own region, filters and page, and the build, which loads page one
 * with no filters so the prerendered HTML has the titles in it rather than a
 * skeleton (see `build-time-tmdb.ts`). One function is what keeps the snapshot
 * the same listing the browser would have shown a first-time visitor.
 */

import { tmdbDiscoverApi } from "./tmdb-discover";
import {
  convertMovieToMediaItem,
  convertTVShowToMediaItem,
} from "./media-converters";
import {
  discoverFiltersToFilterOptions,
  type DiscoverFilters,
} from "./discover-filters";
import {
  streamingPlatformProviderFilter,
  type StreamingPlatform,
} from "./streaming-landing";
import type { MediaItem, MediaType, Movie, TVShow } from "@/types/tmdb";

/** How deep the pager goes. TMDB caps at 500; nothing useful lives that far in. */
export const MAX_GENRE_PAGE = 20;

/** The same, for a genre narrowed to one platform – a much smaller catalogue. */
export const MAX_PLATFORM_PAGE = 10;

export interface GenreListingPage {
  items: MediaItem[];
  totalPages: number;
  totalResults: number;
}

export async function loadGenreListing({
  mediaType,
  genreId,
  page,
  platform,
  filters,
}: {
  mediaType: MediaType;
  genreId: number;
  page: number;
  platform?: StreamingPlatform;
  filters: DiscoverFilters;
}): Promise<GenreListingPage> {
  // A platform landing is the plain listing with one filter pinned, so the
  // filter bar's own choices are deliberately not merged in: the page is
  // about that platform.
  const options = platform
    ? {
        watchProviders: streamingPlatformProviderFilter(platform),
        sortBy: "popularity.desc",
      }
    : discoverFiltersToFilterOptions(filters, mediaType);

  const listing =
    mediaType === "movie"
      ? await tmdbDiscoverApi.discoverMoviesByGenre(genreId, page, options)
      : await tmdbDiscoverApi.discoverTVShowsByGenre(genreId, page, options);

  return {
    items: listing.results.map((item) =>
      mediaType === "movie"
        ? convertMovieToMediaItem(item as Movie)
        : convertTVShowToMediaItem(item as TVShow),
    ),
    totalPages: Math.min(
      listing.total_pages,
      platform ? MAX_PLATFORM_PAGE : MAX_GENRE_PAGE,
    ),
    totalResults: listing.total_results,
  };
}
