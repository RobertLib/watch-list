import { cache } from "react";
import { tmdbApi } from "./tmdb";
import { getCachedDiscoveryRequest, TMDB_CONFIG } from "./tmdb-cache";
import {
  getWatchProviderFilter,
  getSelectedProviderIdsString,
} from "./watch-provider-server";
import { getRegion } from "./region-server";
import { getRegionCode } from "./region";
import type { TMDBResponse, Movie, TVShow, MediaItem } from "@/types/tmdb";
import type { FilterOptions } from "@/types/filters";

// IMPORTANT: Watch providers are now loaded lazily on the client side via /api/watch-providers
// This significantly reduces server-side rendering time, API calls, and memory usage

// Optimized discovery request helper with React cache for deduplication
const makeDiscoveryRequest = cache(
  async (
    endpoint: string,
    params: Record<string, string | number>,
    cacheKey: string
  ): Promise<TMDBResponse<Movie> | TMDBResponse<TVShow>> => {
    // Include provider filter info in cache key for proper cache invalidation
    const watchProviderFilter = await getWatchProviderFilter();
    const selectedProviders = await getSelectedProviderIdsString();
    const region = await getRegion();
    const regionCode = getRegionCode(region);

    const fullCacheKey =
      watchProviderFilter === "streaming-only" && selectedProviders
        ? `${cacheKey}-${regionCode}-providers-${selectedProviders}`
        : `${cacheKey}-${regionCode}-all`;

    const url = await buildFilteredUrl(endpoint, params);
    return (await getCachedDiscoveryRequest(url, fullCacheKey)) as
      | TMDBResponse<Movie>
      | TMDBResponse<TVShow>;
  }
);

async function buildFilteredUrl(
  endpoint: string,
  params: Record<string, string | number> = {},
  filters: FilterOptions = {}
): Promise<string> {
  const region = await getRegion();
  const regionCode = getRegionCode(region);
  const watchProviderFilter = await getWatchProviderFilter();

  const finalParams: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)])
    ),
    region: regionCode,
  };

  // Add watch provider filter if enabled and user has selected providers
  if (watchProviderFilter === "streaming-only") {
    // Use user-selected streaming platforms
    const selectedProviders = await getSelectedProviderIdsString();
    // Only apply filter if user has selected at least one provider
    if (selectedProviders) {
      finalParams.with_watch_providers = selectedProviders;
      finalParams.watch_region = regionCode;
      finalParams.with_watch_monetization_types = "flatrate";
    }
  }

  // Apply additional filters
  if (filters.sortBy) {
    finalParams.sort_by = filters.sortBy;
  }

  if (filters.year) {
    if (endpoint.includes("/movie")) {
      finalParams.primary_release_year = filters.year;
    } else if (endpoint.includes("/tv")) {
      finalParams.first_air_date_year = filters.year;
    }
  }

  if (filters.genre) {
    finalParams.with_genres = filters.genre;
  }

  if (filters.minRating) {
    finalParams["vote_average.gte"] = filters.minRating.toString();
  }

  if (filters.withOriginalLanguage) {
    finalParams.with_original_language = filters.withOriginalLanguage;
  }

  if (filters.primaryReleaseDateGte) {
    finalParams["primary_release_date.gte"] = filters.primaryReleaseDateGte;
  }

  if (filters.primaryReleaseDateLte) {
    finalParams["primary_release_date.lte"] = filters.primaryReleaseDateLte;
  }

  if (filters.voteCountGte) {
    finalParams["vote_count.gte"] = filters.voteCountGte.toString();
  }

  const searchParams = new URLSearchParams(finalParams);
  return `${TMDB_CONFIG.BASE_URL}${endpoint}?${searchParams.toString()}`;
}

/**
 * Server-only TMDB API functions with watch provider filtering
 */
export const tmdbServerApi = {
  // Get popular movies with optional streaming filter
  getPopularMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const data = (await makeDiscoveryRequest(
      "/discover/movie",
      { page, sort_by: "popularity.desc" },
      `popular-movies-${page}`
    )) as TMDBResponse<Movie>;

    // Watch providers are now loaded lazily on client side
    return data;
  },

  // Get popular TV shows with optional streaming filter
  getPopularTVShows: async (
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const data = (await makeDiscoveryRequest(
      "/discover/tv",
      { page, sort_by: "popularity.desc" },
      `popular-tv-${page}`
    )) as TMDBResponse<TVShow>;

    // Watch providers are now loaded lazily on client side
    return data;
  },

  // Get top rated movies with optional streaming filter
  getTopRatedMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const data = (await makeDiscoveryRequest(
      "/discover/movie",
      { page, sort_by: "vote_average.desc", "vote_count.gte": 1000 },
      `top-rated-movies-${page}`
    )) as TMDBResponse<Movie>;

    // Watch providers are now loaded lazily on client side
    return data;
  },

  // Get top rated TV shows with optional streaming filter
  getTopRatedTVShows: async (
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const data = (await makeDiscoveryRequest(
      "/discover/tv",
      { page, sort_by: "vote_average.desc", "vote_count.gte": 100 },
      `top-rated-tv-${page}`
    )) as TMDBResponse<TVShow>;

    // Watch providers are now loaded lazily on client side
    return data;
  },

  // Get now playing movies with optional streaming filter
  getNowPlayingMovies: async (
    page: number = 1
  ): Promise<TMDBResponse<Movie>> => {
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const data = (await makeDiscoveryRequest(
      "/discover/movie",
      {
        page,
        sort_by: "popularity.desc",
        "primary_release_date.gte": thirtyDaysAgo,
        "primary_release_date.lte": today,
      },
      `now-playing-movies-${page}`
    )) as TMDBResponse<Movie>;

    // Watch providers are now loaded lazily on client side
    return data;
  },

  // Get airing today TV shows with optional streaming filter
  getAiringTodayTVShows: async (
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const today = new Date().toISOString().split("T")[0];

    const data = (await makeDiscoveryRequest(
      "/discover/tv",
      {
        page,
        sort_by: "popularity.desc",
        "air_date.gte": today,
        "air_date.lte": today,
      },
      `airing-today-tv-${page}`
    )) as TMDBResponse<TVShow>;

    // Watch providers are now loaded lazily on client side
    return data;
  },

  // Discover movies by genre with optional streaming filter
  discoverMoviesByGenre: async (
    genreId: number,
    page: number = 1
  ): Promise<TMDBResponse<Movie>> => {
    const data = (await makeDiscoveryRequest(
      "/discover/movie",
      { with_genres: genreId, page, sort_by: "popularity.desc" },
      `genre-movies-${genreId}-${page}`
    )) as TMDBResponse<Movie>;

    // Watch providers are now loaded lazily on client side
    return data;
  },

  // Discover TV shows by genre with optional streaming filter
  discoverTVShowsByGenre: async (
    genreId: number,
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const data = (await makeDiscoveryRequest(
      "/discover/tv",
      { with_genres: genreId, page, sort_by: "popularity.desc" },
      `genre-tv-${genreId}-${page}`
    )) as TMDBResponse<TVShow>;

    // Watch providers are now loaded lazily on client side
    return data;
  },

  // Get trending movies and TV shows with optional streaming filter
  getTrending: async (
    mediaType: "all" | "movie" | "tv" = "all",
    timeWindow: "day" | "week" = "week"
  ) => {
    const watchProviderFilter = await getWatchProviderFilter();

    if (watchProviderFilter === "streaming-only") {
      // Use discovery API with streaming filter for better performance
      if (mediaType === "all") {
        const [moviesResponse, tvResponse] = await Promise.all([
          makeDiscoveryRequest(
            "/discover/movie",
            { page: 1, sort_by: "popularity.desc" },
            "trending-movies-streaming"
          ) as Promise<TMDBResponse<Movie>>,
          makeDiscoveryRequest(
            "/discover/tv",
            { page: 1, sort_by: "popularity.desc" },
            "trending-tv-streaming"
          ) as Promise<TMDBResponse<TVShow>>,
        ]);

        // Transform and combine results - watch providers loaded lazily on client
        const movieItems = moviesResponse.results.map((movie: Movie) => ({
          id: movie.id,
          title: movie.title,
          overview: movie.overview,
          poster_path: movie.poster_path,
          backdrop_path: movie.backdrop_path,
          release_date: movie.release_date,
          vote_average: movie.vote_average,
          vote_count: movie.vote_count,
          genre_ids: movie.genre_ids,
          media_type: "movie" as const,
          popularity: movie.popularity,
        }));

        const tvItems = tvResponse.results.map((tv: TVShow) => ({
          id: tv.id,
          title: tv.name,
          overview: tv.overview,
          poster_path: tv.poster_path,
          backdrop_path: tv.backdrop_path,
          release_date: tv.first_air_date,
          vote_average: tv.vote_average,
          vote_count: tv.vote_count,
          genre_ids: tv.genre_ids,
          media_type: "tv" as const,
          popularity: tv.popularity,
        }));

        // Combine and sort by popularity
        const combinedResults = [...movieItems, ...tvItems]
          .sort((a, b) => b.popularity - a.popularity)
          .slice(0, 20);

        return {
          page: 1,
          results: combinedResults,
          total_pages: 1,
          total_results: combinedResults.length,
        };
      } else if (mediaType === "movie") {
        const data = (await makeDiscoveryRequest(
          "/discover/movie",
          { page: 1, sort_by: "popularity.desc" },
          "trending-movies-streaming"
        )) as TMDBResponse<Movie>;

        // Transform results - watch providers loaded lazily on client
        const mediaItems = data.results.map((movie: Movie) => ({
          id: movie.id,
          title: movie.title,
          overview: movie.overview,
          poster_path: movie.poster_path,
          backdrop_path: movie.backdrop_path,
          release_date: movie.release_date,
          vote_average: movie.vote_average,
          vote_count: movie.vote_count,
          genre_ids: movie.genre_ids,
          media_type: "movie" as const,
          popularity: movie.popularity,
        }));

        return {
          ...data,
          results: mediaItems,
        };
      } else {
        const data = (await makeDiscoveryRequest(
          "/discover/tv",
          { page: 1, sort_by: "popularity.desc" },
          "trending-tv-streaming"
        )) as TMDBResponse<TVShow>;

        // Transform results - watch providers loaded lazily on client
        const mediaItems = data.results.map((tv: TVShow) => ({
          id: tv.id,
          title: tv.name,
          overview: tv.overview,
          poster_path: tv.poster_path,
          backdrop_path: tv.backdrop_path,
          release_date: tv.first_air_date,
          vote_average: tv.vote_average,
          vote_count: tv.vote_count,
          genre_ids: tv.genre_ids,
          media_type: "tv" as const,
          popularity: tv.popularity,
        }));

        return {
          ...data,
          results: mediaItems,
        };
      }
    }

    // Use original trending endpoint when no streaming filter
    const data = await tmdbApi.getTrending(mediaType, timeWindow);

    // Watch providers are now loaded lazily on client side
    return data;
  },

  // Discover movies with advanced filters
  discoverMovies: async (
    page: number = 1,
    filters: FilterOptions = {}
  ): Promise<TMDBResponse<Movie>> => {
    // Create cache key based on filters
    const filterKey = Object.entries(filters)
      .map(([key, value]) => `${key}-${value}`)
      .join("_");
    const cacheKey = `discover-movies-${page}-${filterKey}`;

    const url = await buildFilteredUrl("/discover/movie", { page }, filters);
    const data = (await getCachedDiscoveryRequest(
      url,
      cacheKey
    )) as TMDBResponse<Movie>;

    // Watch providers are now loaded lazily on client side
    return data;
  },

  // Discover TV shows with advanced filters
  discoverTVShows: async (
    page: number = 1,
    filters: FilterOptions = {}
  ): Promise<TMDBResponse<TVShow>> => {
    // Create cache key based on filters
    const filterKey = Object.entries(filters)
      .map(([key, value]) => `${key}-${value}`)
      .join("_");
    const cacheKey = `discover-tv-${page}-${filterKey}`;

    const url = await buildFilteredUrl("/discover/tv", { page }, filters);
    const data = (await getCachedDiscoveryRequest(
      url,
      cacheKey
    )) as TMDBResponse<TVShow>;

    // Watch providers are now loaded lazily on client side
    return data;
  },

  // Search for movies and TV shows
  searchMulti: async (
    query: string,
    page: number = 1
  ): Promise<TMDBResponse<MediaItem>> => {
    // Use the client API function since search doesn't need server-side filtering
    return tmdbApi.searchMulti(query, page);
  },
};
