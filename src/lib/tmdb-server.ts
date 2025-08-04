import { tmdbApi } from "./tmdb";
import {
  getCachedMovieWatchProviders,
  getCachedTVWatchProviders,
  getCachedDiscoveryRequest,
  TMDB_CONFIG,
} from "./tmdb-cache";
import { getWatchProviderFilter } from "./watch-provider-server";
import { getRegion } from "./region-server";
import { getRegionCode } from "./region";
import type { TMDBResponse, Movie, TVShow, MediaItem } from "@/types/tmdb";
import type { FilterOptions } from "@/types/filters";

// Helper function to enrich movies with providers data - optimized version
async function enrichMoviesWithProviders(movies: Movie[]): Promise<Movie[]> {
  const currentRegion = await getRegion();
  const regionCode = getRegionCode(currentRegion);

  // Only fetch providers for movies that don't already have them from discover API
  const moviesToEnrich = movies.filter(
    (movie) => !movie.providers && !movie["watch/providers"]
  );

  if (moviesToEnrich.length === 0) {
    return movies;
  }

  // Batch process in chunks of 10 to avoid overwhelming the API
  const CHUNK_SIZE = 10;
  const enrichedMovies: Movie[] = [...movies];

  for (let i = 0; i < moviesToEnrich.length; i += CHUNK_SIZE) {
    const chunk = moviesToEnrich.slice(i, i + CHUNK_SIZE);

    await Promise.all(
      chunk.map(async (movie) => {
        try {
          const watchProviders = await getCachedMovieWatchProviders(
            movie.id,
            regionCode
          );
          const regionProviders = watchProviders.results[regionCode];
          const flatrateProviders = regionProviders?.flatrate || [];

          const movieIndex = enrichedMovies.findIndex((m) => m.id === movie.id);
          if (movieIndex !== -1) {
            enrichedMovies[movieIndex] = {
              ...enrichedMovies[movieIndex],
              "watch/providers": watchProviders,
              providers: flatrateProviders,
            };
          }
        } catch (error) {
          console.error(
            `Error fetching providers for movie ${movie.id}:`,
            error
          );
        }
      })
    );
  }

  return enrichedMovies;
}

// Helper function to enrich TV shows with providers data - optimized version
async function enrichTVShowsWithProviders(
  tvShows: TVShow[]
): Promise<TVShow[]> {
  const currentRegion = await getRegion();
  const regionCode = getRegionCode(currentRegion);

  // Only fetch providers for TV shows that don't already have them from discover API
  const tvShowsToEnrich = tvShows.filter(
    (tvShow) => !tvShow.providers && !tvShow["watch/providers"]
  );

  if (tvShowsToEnrich.length === 0) {
    return tvShows;
  }

  // Batch process in chunks of 10 to avoid overwhelming the API
  const CHUNK_SIZE = 10;
  const enrichedTVShows: TVShow[] = [...tvShows];

  for (let i = 0; i < tvShowsToEnrich.length; i += CHUNK_SIZE) {
    const chunk = tvShowsToEnrich.slice(i, i + CHUNK_SIZE);

    await Promise.all(
      chunk.map(async (tvShow) => {
        try {
          const watchProviders = await getCachedTVWatchProviders(
            tvShow.id,
            regionCode
          );
          const regionProviders = watchProviders.results[regionCode];
          const flatrateProviders = regionProviders?.flatrate || [];

          const tvShowIndex = enrichedTVShows.findIndex(
            (tv) => tv.id === tvShow.id
          );
          if (tvShowIndex !== -1) {
            enrichedTVShows[tvShowIndex] = {
              ...enrichedTVShows[tvShowIndex],
              "watch/providers": watchProviders,
              providers: flatrateProviders,
            };
          }
        } catch (error) {
          console.error(
            `Error fetching providers for TV show ${tvShow.id}:`,
            error
          );
        }
      })
    );
  }

  return enrichedTVShows;
}

// Helper function to enrich MediaItems with providers data - optimized version
async function enrichMediaItemsWithProviders(
  items: MediaItem[],
  regionCode: string
): Promise<MediaItem[]> {
  // Skip enrichment if items already have provider data
  const itemsToEnrich = items.filter(
    (item) => !item.providers && !item["watch/providers"]
  );

  if (itemsToEnrich.length === 0) {
    return items;
  }

  const enrichedItems = await Promise.all(
    itemsToEnrich.map(async (item) => {
      try {
        let watchProviders;
        if (item.media_type === "movie") {
          watchProviders = await getCachedMovieWatchProviders(
            item.id,
            regionCode
          );
        } else {
          watchProviders = await getCachedTVWatchProviders(item.id, regionCode);
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

  // Merge back with original items
  const result = [...items];
  enrichedItems.forEach((enrichedItem) => {
    const index = result.findIndex((item) => item.id === enrichedItem.id);
    if (index !== -1) {
      result[index] = enrichedItem;
    }
  });

  return result;
}

// Optimized discovery request helper
async function makeDiscoveryRequest(
  endpoint: string,
  params: Record<string, string | number>,
  cacheKey: string
): Promise<TMDBResponse<Movie> | TMDBResponse<TVShow>> {
  const url = await buildFilteredUrl(endpoint, params);
  return (await getCachedDiscoveryRequest(url, cacheKey)) as
    | TMDBResponse<Movie>
    | TMDBResponse<TVShow>;
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

    // Enrich with providers data only if needed (when not using streaming filter)
    if (data.results) {
      data.results = await enrichMoviesWithProviders(data.results);
    }

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

    // Enrich with providers data only if needed
    if (data.results) {
      data.results = await enrichTVShowsWithProviders(data.results);
    }

    return data;
  },

  // Get top rated movies with optional streaming filter
  getTopRatedMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const data = (await makeDiscoveryRequest(
      "/discover/movie",
      { page, sort_by: "vote_average.desc", "vote_count.gte": 1000 },
      `top-rated-movies-${page}`
    )) as TMDBResponse<Movie>;

    // Enrich with providers data only if needed
    if (data.results) {
      data.results = await enrichMoviesWithProviders(data.results);
    }

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

    // Enrich with providers data only if needed
    if (data.results) {
      data.results = await enrichTVShowsWithProviders(data.results);
    }

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

    // Enrich with providers data only if needed
    if (data.results) {
      data.results = await enrichMoviesWithProviders(data.results);
    }

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

    // Enrich with providers data only if needed
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
    const data = (await makeDiscoveryRequest(
      "/discover/movie",
      { with_genres: genreId, page, sort_by: "popularity.desc" },
      `genre-movies-${genreId}-${page}`
    )) as TMDBResponse<Movie>;

    // Enrich with providers data only if needed
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
    const data = (await makeDiscoveryRequest(
      "/discover/tv",
      { with_genres: genreId, page, sort_by: "popularity.desc" },
      `genre-tv-${genreId}-${page}`
    )) as TMDBResponse<TVShow>;

    // Enrich with providers data only if needed
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

        // Enrich with providers data
        const [enrichedMovies, enrichedTVShows] = await Promise.all([
          enrichMoviesWithProviders(moviesResponse.results),
          enrichTVShowsWithProviders(tvResponse.results),
        ]);

        // Transform and combine results
        const movieItems = enrichedMovies.map((movie: Movie) => ({
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
          providers: movie.providers,
          "watch/providers": movie["watch/providers"],
        }));

        const tvItems = enrichedTVShows.map((tv: TVShow) => ({
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
          providers: tv.providers,
          "watch/providers": tv["watch/providers"],
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

        // Enrich with providers data
        const enrichedMovies = await enrichMoviesWithProviders(data.results);

        const mediaItems = enrichedMovies.map((movie: Movie) => ({
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
          providers: movie.providers,
          "watch/providers": movie["watch/providers"],
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

        // Enrich with providers data
        const enrichedTVShows = await enrichTVShowsWithProviders(data.results);

        const mediaItems = enrichedTVShows.map((tv: TVShow) => ({
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
          providers: tv.providers,
          "watch/providers": tv["watch/providers"],
        }));

        return {
          ...data,
          results: mediaItems,
        };
      }
    }

    // Use original trending endpoint when no streaming filter
    const data = await tmdbApi.getTrending(mediaType, timeWindow);

    // Enrich with providers data only if needed
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

    // Enrich with providers data
    if (data.results) {
      data.results = await enrichTVShowsWithProviders(data.results);
    }

    return data;
  },
};
