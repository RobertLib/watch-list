import { tmdbApi } from "./tmdb";
import {
  getCachedMovieWatchProviders,
  getCachedTVWatchProviders,
} from "./tmdb-cache";
import { getWatchProviderFilter } from "./watch-provider-server";
import { getRegion } from "./region-server";
import { getRegionCode } from "./region";
import type { TMDBResponse, Movie, TVShow, MediaItem } from "@/types/tmdb";
import type { FilterOptions } from "@/types/filters";

const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_TOKEN || "";
const BASE_URL = "https://api.themoviedb.org/3";

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// Helper function to enrich movies with providers data
async function enrichMoviesWithProviders(movies: Movie[]): Promise<Movie[]> {
  const currentRegion = await getRegion();
  const regionCode = getRegionCode(currentRegion);

  // Batch process in chunks of 5 to avoid overwhelming the API
  const CHUNK_SIZE = 5;
  const enrichedMovies: Movie[] = [];

  for (let i = 0; i < movies.length; i += CHUNK_SIZE) {
    const chunk = movies.slice(i, i + CHUNK_SIZE);

    const enrichedChunk = await Promise.all(
      chunk.map(async (movie) => {
        try {
          const watchProviders = await getCachedMovieWatchProviders(
            movie.id,
            regionCode
          );
          const regionProviders = watchProviders.results[regionCode];
          const flatrateProviders = regionProviders?.flatrate || [];

          return {
            ...movie,
            "watch/providers": watchProviders,
            providers: flatrateProviders,
          };
        } catch (error) {
          console.error(
            `Error fetching providers for movie ${movie.id}:`,
            error
          );
          return movie;
        }
      })
    );

    enrichedMovies.push(...enrichedChunk);
  }

  return enrichedMovies;
}

// Helper function to enrich TV shows with providers data
async function enrichTVShowsWithProviders(
  tvShows: TVShow[]
): Promise<TVShow[]> {
  const currentRegion = await getRegion();
  const regionCode = getRegionCode(currentRegion);

  // Batch process in chunks of 5 to avoid overwhelming the API
  const CHUNK_SIZE = 5;
  const enrichedTVShows: TVShow[] = [];

  for (let i = 0; i < tvShows.length; i += CHUNK_SIZE) {
    const chunk = tvShows.slice(i, i + CHUNK_SIZE);

    const enrichedChunk = await Promise.all(
      chunk.map(async (tvShow) => {
        try {
          const watchProviders = await getCachedTVWatchProviders(
            tvShow.id,
            regionCode
          );
          const regionProviders = watchProviders.results[regionCode];
          const flatrateProviders = regionProviders?.flatrate || [];

          return {
            ...tvShow,
            "watch/providers": watchProviders,
            providers: flatrateProviders,
          };
        } catch (error) {
          console.error(
            `Error fetching providers for TV show ${tvShow.id}:`,
            error
          );
          return tvShow;
        }
      })
    );

    enrichedTVShows.push(...enrichedChunk);
  }

  return enrichedTVShows;
}

// Helper function to enrich MediaItems with providers data
async function enrichMediaItemsWithProviders(
  items: MediaItem[],
  regionCode: string
): Promise<MediaItem[]> {
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      try {
        let watchProviders;
        if (item.media_type === "movie") {
          watchProviders = await tmdbApi.getMovieWatchProviders(item.id);
        } else {
          watchProviders = await tmdbApi.getTVWatchProviders(item.id);
        }

        const regionProviders = watchProviders.results[regionCode];
        const flatrateProviders = regionProviders?.flatrate || [];

        return {
          ...item,
          "watch/providers": watchProviders,
          providers: flatrateProviders,
        };
      } catch (error) {
        console.error(
          `Error fetching providers for ${item.media_type} ${item.id}:`,
          error
        );
        return item;
      }
    })
  );

  return enrichedItems;
}

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
      const data = await response.json();

      // Enrich with providers data
      if (data.results) {
        data.results = await enrichMoviesWithProviders(data.results);
      }

      return data;
    }

    const data = await tmdbApi.getPopularMovies(page);

    // Enrich with providers data
    if (data.results) {
      data.results = await enrichMoviesWithProviders(data.results);
    }

    return data;
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
      const data = await response.json();

      // Enrich with providers data
      if (data.results) {
        data.results = await enrichTVShowsWithProviders(data.results);
      }

      return data;
    }

    const data = await tmdbApi.getPopularTVShows(page);

    // Enrich with providers data
    if (data.results) {
      data.results = await enrichTVShowsWithProviders(data.results);
    }

    return data;
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
      const data = await response.json();

      // Enrich with providers data
      if (data.results) {
        data.results = await enrichMoviesWithProviders(data.results);
      }

      return data;
    }

    const data = await tmdbApi.getTopRatedMovies(page);

    // Enrich with providers data
    if (data.results) {
      data.results = await enrichMoviesWithProviders(data.results);
    }

    return data;
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
      const data = await response.json();

      // Enrich with providers data
      if (data.results) {
        data.results = await enrichTVShowsWithProviders(data.results);
      }

      return data;
    }

    const data = await tmdbApi.getTopRatedTVShows(page);

    // Enrich with providers data
    if (data.results) {
      data.results = await enrichTVShowsWithProviders(data.results);
    }

    return data;
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
      const data = await response.json();

      // Enrich with providers data
      if (data.results) {
        data.results = await enrichMoviesWithProviders(data.results);
      }

      return data;
    }

    const data = await tmdbApi.getNowPlayingMovies(page);

    // Enrich with providers data
    if (data.results) {
      data.results = await enrichMoviesWithProviders(data.results);
    }

    return data;
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
      const data = await response.json();

      // Enrich with providers data
      if (data.results) {
        data.results = await enrichTVShowsWithProviders(data.results);
      }

      return data;
    }

    const data = await tmdbApi.getAiringTodayTVShows(page);

    // Enrich with providers data
    if (data.results) {
      data.results = await enrichTVShowsWithProviders(data.results);
    }

    return data;
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
      const data = await response.json();

      // Enrich with providers data
      if (data.results) {
        data.results = await enrichMoviesWithProviders(data.results);
      }

      return data;
    }

    const data = await tmdbApi.discoverMoviesByGenre(genreId, page);

    // Enrich with providers data
    if (data.results) {
      data.results = await enrichMoviesWithProviders(data.results);
    }

    return data;
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
      const data = await response.json();

      // Enrich with providers data
      if (data.results) {
        data.results = await enrichTVShowsWithProviders(data.results);
      }

      return data;
    }

    const data = await tmdbApi.discoverTVShowsByGenre(genreId, page);

    // Enrich with providers data
    if (data.results) {
      data.results = await enrichTVShowsWithProviders(data.results);
    }

    return data;
  },

  // Get trending movies and TV shows with optional streaming filter
  getTrending: async (
    mediaType: "all" | "movie" | "tv" = "all",
    timeWindow: "day" | "week" = "week"
  ) => {
    const watchProviderFilter = await getWatchProviderFilter();
    const currentRegion = await getRegion();
    const regionCode = getRegionCode(currentRegion);

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

        // Enrich with providers data
        const enrichedResults = await enrichMediaItemsWithProviders(
          combinedResults.slice(0, 20),
          regionCode
        );

        return {
          page: 1,
          results: enrichedResults,
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

        // Enrich with providers data
        const enrichedResults = await enrichMediaItemsWithProviders(
          mediaItems,
          regionCode
        );

        return {
          ...data,
          results: enrichedResults,
        };
      } else {
        const url = await buildFilteredUrl("/discover/tv", {
          page: 1,
          sort_by: "popularity.desc",
        });
        const response = await fetch(url, { headers });
        const data: TMDBResponse<TVShow> = await response.json();

        const mediaItems = data.results.map((tv: TVShow) => ({
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
        }));

        // Enrich with providers data
        const enrichedResults = await enrichMediaItemsWithProviders(
          mediaItems,
          regionCode
        );

        return {
          ...data,
          results: enrichedResults,
        };
      }
    }

    const data = await tmdbApi.getTrending(mediaType, timeWindow);

    // Enrich with providers data for non-filtered trending results
    if (data.results) {
      data.results = await enrichMediaItemsWithProviders(
        data.results,
        regionCode
      );
    }

    return data;
  },

  // Discover movies with advanced filters
  discoverMovies: async (
    page: number = 1,
    filters: FilterOptions = {}
  ): Promise<TMDBResponse<Movie>> => {
    const url = await buildFilteredUrl("/discover/movie", { page }, filters);
    const response = await fetch(url, { headers });
    const data = await response.json();

    // Enrich with providers data
    if (data.results) {
      data.results = await enrichMoviesWithProviders(data.results);
    }

    return data;
  },

  // Discover TV shows with advanced filters
  discoverTVShows: async (
    page: number = 1,
    filters: FilterOptions = {}
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildFilteredUrl("/discover/tv", { page }, filters);
    const response = await fetch(url, { headers });
    const data = await response.json();

    // Enrich with providers data
    if (data.results) {
      data.results = await enrichTVShowsWithProviders(data.results);
    }

    return data;
  },
};
