import { tmdbApi } from "./tmdb";
import { getWatchProviderFilter } from "./watch-provider-server";
import { getRegion } from "./region-server";
import { getRegionCode } from "./region";
import type { TMDBResponse, Movie, TVShow } from "@/types/tmdb";
import type { FilterOptions } from "@/types/filters";

const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_TOKEN || "";
const BASE_URL = "https://api.themoviedb.org/3";

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

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

  // Add watch provider filter if enabled
  if (watchProviderFilter === "streaming-only") {
    // Major streaming platforms (Netflix, Amazon Prime, Disney+, HBO Max, Apple TV+, Hulu, Paramount+)
    finalParams.with_watch_providers = "8|9|337|384|350|15|531";
    finalParams.watch_region = regionCode;
    finalParams.with_watch_monetization_types = "flatrate";
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
  return `${BASE_URL}${endpoint}?${searchParams.toString()}`;
}

/**
 * Server-only TMDB API functions with watch provider filtering
 */
export const tmdbServerApi = {
  // Get popular movies with optional streaming filter
  getPopularMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const watchProviderFilter = await getWatchProviderFilter();

    if (watchProviderFilter === "streaming-only") {
      const url = await buildFilteredUrl("/discover/movie", {
        page,
        sort_by: "popularity.desc",
      });
      const response = await fetch(url, { headers });
      return response.json();
    }

    return tmdbApi.getPopularMovies(page);
  },

  // Get popular TV shows with optional streaming filter
  getPopularTVShows: async (
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const watchProviderFilter = await getWatchProviderFilter();

    if (watchProviderFilter === "streaming-only") {
      const url = await buildFilteredUrl("/discover/tv", {
        page,
        sort_by: "popularity.desc",
      });
      const response = await fetch(url, { headers });
      return response.json();
    }

    return tmdbApi.getPopularTVShows(page);
  },

  // Get top rated movies with optional streaming filter
  getTopRatedMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const watchProviderFilter = await getWatchProviderFilter();

    if (watchProviderFilter === "streaming-only") {
      const url = await buildFilteredUrl("/discover/movie", {
        page,
        sort_by: "vote_average.desc",
        "vote_count.gte": 1000,
      });
      const response = await fetch(url, { headers });
      return response.json();
    }

    return tmdbApi.getTopRatedMovies(page);
  },

  // Get top rated TV shows with optional streaming filter
  getTopRatedTVShows: async (
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const watchProviderFilter = await getWatchProviderFilter();

    if (watchProviderFilter === "streaming-only") {
      const url = await buildFilteredUrl("/discover/tv", {
        page,
        sort_by: "vote_average.desc",
        "vote_count.gte": 100,
      });
      const response = await fetch(url, { headers });
      return response.json();
    }

    return tmdbApi.getTopRatedTVShows(page);
  },

  // Get now playing movies with optional streaming filter
  getNowPlayingMovies: async (
    page: number = 1
  ): Promise<TMDBResponse<Movie>> => {
    const watchProviderFilter = await getWatchProviderFilter();

    if (watchProviderFilter === "streaming-only") {
      const url = await buildFilteredUrl("/discover/movie", {
        page,
        sort_by: "popularity.desc",
        "primary_release_date.gte": new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .split("T")[0],
        "primary_release_date.lte": new Date().toISOString().split("T")[0],
      });
      const response = await fetch(url, { headers });
      return response.json();
    }

    return tmdbApi.getNowPlayingMovies(page);
  },

  // Get airing today TV shows with optional streaming filter
  getAiringTodayTVShows: async (
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const watchProviderFilter = await getWatchProviderFilter();

    if (watchProviderFilter === "streaming-only") {
      const today = new Date().toISOString().split("T")[0];
      const url = await buildFilteredUrl("/discover/tv", {
        page,
        sort_by: "popularity.desc",
        "air_date.gte": today,
        "air_date.lte": today,
      });
      const response = await fetch(url, { headers });
      return response.json();
    }

    return tmdbApi.getAiringTodayTVShows(page);
  },

  // Discover movies by genre with optional streaming filter
  discoverMoviesByGenre: async (
    genreId: number,
    page: number = 1
  ): Promise<TMDBResponse<Movie>> => {
    const watchProviderFilter = await getWatchProviderFilter();

    if (watchProviderFilter === "streaming-only") {
      const url = await buildFilteredUrl("/discover/movie", {
        with_genres: genreId,
        page,
        sort_by: "popularity.desc",
      });
      const response = await fetch(url, { headers });
      return response.json();
    }

    return tmdbApi.discoverMoviesByGenre(genreId, page);
  },

  // Discover TV shows by genre with optional streaming filter
  discoverTVShowsByGenre: async (
    genreId: number,
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const watchProviderFilter = await getWatchProviderFilter();

    if (watchProviderFilter === "streaming-only") {
      const url = await buildFilteredUrl("/discover/tv", {
        with_genres: genreId,
        page,
        sort_by: "popularity.desc",
      });
      const response = await fetch(url, { headers });
      return response.json();
    }

    return tmdbApi.discoverTVShowsByGenre(genreId, page);
  },

  // Get trending movies and TV shows with optional streaming filter
  getTrending: async (
    mediaType: "all" | "movie" | "tv" = "all",
    timeWindow: "day" | "week" = "week"
  ) => {
    const watchProviderFilter = await getWatchProviderFilter();

    if (watchProviderFilter === "streaming-only") {
      // When streaming-only filter is enabled, we need to get trending content from both movies and TV
      // and then combine and sort by popularity since TMDB doesn't support watch provider filtering on trending endpoint

      if (mediaType === "all") {
        const [moviesResponse, tvResponse] = await Promise.all([
          (async () => {
            const url = await buildFilteredUrl("/discover/movie", {
              page: 1,
              sort_by: "popularity.desc",
            });
            const response = await fetch(url, { headers });
            const data: TMDBResponse<Movie> = await response.json();
            // Transform movies to MediaItem format
            return {
              ...data,
              results: data.results.map((movie: Movie) => ({
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
              })),
            };
          })(),
          (async () => {
            const url = await buildFilteredUrl("/discover/tv", {
              page: 1,
              sort_by: "popularity.desc",
            });
            const response = await fetch(url, { headers });
            const data: TMDBResponse<TVShow> = await response.json();
            // Transform TV shows to MediaItem format
            return {
              ...data,
              results: data.results.map((tv: TVShow) => ({
                id: tv.id,
                title: tv.name, // TV shows use 'name' but we need 'title' for MediaItem
                overview: tv.overview,
                poster_path: tv.poster_path,
                backdrop_path: tv.backdrop_path,
                release_date: tv.first_air_date, // TV shows use 'first_air_date' but we need 'release_date'
                vote_average: tv.vote_average,
                vote_count: tv.vote_count,
                genre_ids: tv.genre_ids,
                media_type: "tv" as const,
                popularity: tv.popularity,
              })),
            };
          })(),
        ]);

        // Combine and sort by popularity
        const combinedResults = [
          ...moviesResponse.results,
          ...tvResponse.results,
        ].sort((a, b) => b.popularity - a.popularity);

        return {
          page: 1,
          results: combinedResults.slice(0, 20), // Take top 20 most popular
          total_pages: Math.max(
            moviesResponse.total_pages,
            tvResponse.total_pages
          ),
          total_results:
            moviesResponse.total_results + tvResponse.total_results,
        };
      } else if (mediaType === "movie") {
        const url = await buildFilteredUrl("/discover/movie", {
          page: 1,
          sort_by: "popularity.desc",
        });
        const response = await fetch(url, { headers });
        const data: TMDBResponse<Movie> = await response.json();
        return {
          ...data,
          results: data.results.map((movie: Movie) => ({
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
          })),
        };
      } else {
        const url = await buildFilteredUrl("/discover/tv", {
          page: 1,
          sort_by: "popularity.desc",
        });
        const response = await fetch(url, { headers });
        const data: TMDBResponse<TVShow> = await response.json();
        return {
          ...data,
          results: data.results.map((tv: TVShow) => ({
            id: tv.id,
            title: tv.name, // TV shows use 'name' but we need 'title' for MediaItem
            overview: tv.overview,
            poster_path: tv.poster_path,
            backdrop_path: tv.backdrop_path,
            release_date: tv.first_air_date, // TV shows use 'first_air_date' but we need 'release_date'
            vote_average: tv.vote_average,
            vote_count: tv.vote_count,
            genre_ids: tv.genre_ids,
            media_type: "tv" as const,
            popularity: tv.popularity,
          })),
        };
      }
    }

    return tmdbApi.getTrending(mediaType, timeWindow);
  },

  // Discover movies with advanced filters
  discoverMovies: async (
    page: number = 1,
    filters: FilterOptions = {}
  ): Promise<TMDBResponse<Movie>> => {
    const url = await buildFilteredUrl("/discover/movie", { page }, filters);
    const response = await fetch(url, { headers });
    return response.json();
  },

  // Discover TV shows with advanced filters
  discoverTVShows: async (
    page: number = 1,
    filters: FilterOptions = {}
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildFilteredUrl("/discover/tv", { page }, filters);
    const response = await fetch(url, { headers });
    return response.json();
  },
};
