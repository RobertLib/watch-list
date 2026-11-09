/**
 * Discovery listings, filtered by the visitor's region and streaming platforms.
 *
 * This was `tmdb-server.ts`: the filters it applies came from httpOnly cookies,
 * so it could only ever run on a server. They come from local storage now, which
 * is what let the whole module move into the browser – the queries themselves
 * are unchanged.
 */

import { tmdbApi } from "./tmdb";
import { getCachedDiscoveryRequest, TMDB_CONFIG, type TMDBRequestOptions } from "./tmdb-cache";
import { TTL, tmdbFetchJson } from "./tmdb-cache";
import { convertMovieToMediaItem } from "./media-converters";
import { shiftDate, shiftYears, todayLocal } from "./dates";
import {
  getRegion,
  getSelectedProviderIdsString,
  getWatchProviderFilter,
} from "./settings";
import {
  ANY_PROVIDERS,
  MY_PROVIDERS,
  sanitizeWatchProvidersFilter,
} from "./watch-provider-settings";
import { getRegionCode } from "./region";
import { STREAMING_MONETIZATION_TYPES } from "./watch-provider-availability";
import type {
  TMDBResponse,
  Movie,
  TVShow,
  MediaItem,
  Person,
} from "@/types/tmdb";
import type { FilterOptions } from "@/types/filters";

// IMPORTANT: Watch providers are loaded lazily per card rather than folded into
// these listings, which keeps a page of results to one request.

/**
 * One discovery request.
 *
 * There is no separate cache key any more. The URL is the key, and every input
 * that changes the answer – region, chosen platforms, page, every filter – is
 * already a parameter in it.
 */
async function makeDiscoveryRequest(
  endpoint: string,
  params: Record<string, string | number>,
  filters: FilterOptions = {},
  options?: TMDBRequestOptions,
): Promise<TMDBResponse<Movie> | TMDBResponse<TVShow>> {
  const url = buildFilteredUrl(endpoint, params, filters);
  return (await getCachedDiscoveryRequest(url, options)) as
    | TMDBResponse<Movie>
    | TMDBResponse<TVShow>;
}

/**
 * Turn an endpoint, its parameters and the visitor's filters into one TMDB URL.
 *
 * Exported because it is the whole of this module's logic: everything below is a
 * thin call through it, and the URL is also the cache key – so a parameter that
 * is wrong here is both a wrong answer and a wrong answer that gets remembered.
 */
export function buildFilteredUrl(
  endpoint: string,
  params: Record<string, string | number> = {},
  filters: FilterOptions = {},
): string {
  const regionCode = getRegionCode(getRegion());
  const watchProviderFilter = getWatchProviderFilter();

  const finalParams: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ),
    region: regionCode,
  };

  // A platform picked in the filter bar wins over the profile-wide setting –
  // that is what makes it possible to look outside your own subscriptions.
  // The value can arrive straight from the URL, so it is re-validated.
  const providerFilter = sanitizeWatchProvidersFilter(filters.watchProviders);

  if (providerFilter && providerFilter !== MY_PROVIDERS && providerFilter !== ANY_PROVIDERS) {
    finalParams.with_watch_providers = providerFilter;
    finalParams.watch_region = regionCode;
    // Deliberately no monetization type: storefronts such as Apple TV or
    // Google Play only ever rent/sell, so a flatrate-only query returns nothing.
  } else if (
    providerFilter === MY_PROVIDERS ||
    (!providerFilter && watchProviderFilter === "streaming-only")
  ) {
    // Use user-selected streaming platforms
    const selectedProviders = getSelectedProviderIdsString();
    // Only apply filter if user has selected at least one provider
    if (selectedProviders) {
      finalParams.with_watch_providers = selectedProviders;
      finalParams.watch_region = regionCode;
      finalParams.with_watch_monetization_types = STREAMING_MONETIZATION_TYPES;
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

  // Each date pair only on the endpoint it belongs to, as with the year above:
  // the sanitised filters carry both pairs whatever the media type
  // (`discover-filters.ts`), and this is where the choice is made.
  if (endpoint.includes("/movie")) {
    if (filters.primaryReleaseDateGte) {
      finalParams["primary_release_date.gte"] = filters.primaryReleaseDateGte;
    }

    if (filters.primaryReleaseDateLte) {
      finalParams["primary_release_date.lte"] = filters.primaryReleaseDateLte;
    }
  }

  if (filters.voteCountGte) {
    finalParams["vote_count.gte"] = filters.voteCountGte.toString();
  }

  if (filters.voteCountLte) {
    finalParams["vote_count.lte"] = filters.voteCountLte.toString();
  }

  if (filters.popularityLte) {
    finalParams["popularity.lte"] = filters.popularityLte.toString();
  }

  if (endpoint.includes("/tv")) {
    if (filters.firstAirDateGte) {
      finalParams["first_air_date.gte"] = filters.firstAirDateGte;
    }

    if (filters.firstAirDateLte) {
      finalParams["first_air_date.lte"] = filters.firstAirDateLte;
    }
  }

  // Returning Series is code 0, so this filter must not use a truthiness check.
  if (endpoint === "/discover/tv" && filters.withStatus !== undefined) {
    finalParams.with_status = String(filters.withStatus);
  }

  if (filters.withRuntimeGte) {
    finalParams["with_runtime.gte"] = filters.withRuntimeGte.toString();
  }

  if (filters.withRuntimeLte) {
    finalParams["with_runtime.lte"] = filters.withRuntimeLte.toString();
  }

  if (filters.withKeywords) {
    finalParams.with_keywords = filters.withKeywords;
  }

  const searchParams = new URLSearchParams(finalParams);
  return `${TMDB_CONFIG.BASE_URL}${endpoint}?${searchParams.toString()}`;
}

// Without a selected platform, keep the original catalogue and its release
// dates. Switching to discovery is only needed for an actual platform filter.
function hasSelectedPlatformFilter(): boolean {
  return getWatchProviderFilter() === "streaming-only" &&
    getSelectedProviderIdsString().length > 0;
}

export const tmdbDiscoverApi = {
  // Get popular movies with optional streaming filter.
  // Capped to last 15 years so very old titles with high-traffic pages
  // (e.g. anniversary re-releases) don't dominate the list.
  getPopularMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const today = todayLocal();
    const fifteenYearsAgo = shiftYears(today, -15);

    const data = (await makeDiscoveryRequest(
      "/discover/movie",
      {
        page,
        sort_by: "popularity.desc",
        "primary_release_date.gte": fifteenYearsAgo,
        "primary_release_date.lte": today,
      },
    )) as TMDBResponse<Movie>;

    return data;
  },

  // Get popular TV shows with optional streaming filter.
  // first_air_date.gte is capped to ~10 years ago so that daily soap operas
  // that have been airing since the 80s/90s (e.g. Home and Away, Neighbours)
  // cannot dominate the list purely by episode-count-driven popularity score.
  getPopularTVShows: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const today = todayLocal();
    const tenYearsAgo = shiftYears(today, -10);
    const data = (await makeDiscoveryRequest(
      "/discover/tv",
      {
        page,
        sort_by: "popularity.desc",
        "first_air_date.gte": tenYearsAgo,
        "first_air_date.lte": today,
      },
    )) as TMDBResponse<TVShow>;

    return data;
  },

  // Get top rated movies
  // Always use /discover for full control over the vote_count threshold.
  // A minimum of 5 000 votes ensures only well-established films appear.
  getTopRatedMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const data = (await makeDiscoveryRequest(
      "/discover/movie",
      { page, sort_by: "vote_average.desc", "vote_count.gte": 5000 },
    )) as TMDBResponse<Movie>;
    return data;
  },

  // Get top rated TV shows
  // Always use /discover for full control over the vote_count threshold.
  // A minimum of 500 votes ensures only established series appear.
  getTopRatedTVShows: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const data = (await makeDiscoveryRequest(
      "/discover/tv",
      { page, sort_by: "vote_average.desc", "vote_count.gte": 500 },
    )) as TMDBResponse<TVShow>;
    return data;
  },

  // Get now playing movies
  // When streaming filter is active, use discover with a 30-day date window.
  // Otherwise use the official /movie/now_playing endpoint (real theatrical availability).
  getNowPlayingMovies: async (
    page: number = 1,
  ): Promise<TMDBResponse<Movie>> => {
    if (hasSelectedPlatformFilter()) {
      const today = todayLocal();
      const thirtyDaysAgo = shiftDate(today, -30);

      const data = (await makeDiscoveryRequest(
        "/discover/movie",
        {
          page,
          sort_by: "popularity.desc",
          "primary_release_date.gte": thirtyDaysAgo,
          "primary_release_date.lte": today,
        },
      )) as TMDBResponse<Movie>;
      return data;
    }

    return tmdbApi.getNowPlayingMovies(page);
  },

  // Get airing today TV shows
  // When streaming filter is active, use discover with today's air date range.
  // Otherwise use the official /tv/airing_today endpoint.
  getAiringTodayTVShows: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    if (hasSelectedPlatformFilter()) {
      const today = todayLocal();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const data = (await makeDiscoveryRequest(
        "/discover/tv",
        {
          page,
          sort_by: "popularity.desc",
          "air_date.gte": today,
          "air_date.lte": today,
          timezone,
        },
      )) as TMDBResponse<TVShow>;
      return data;
    }

    return tmdbApi.getAiringTodayTVShows(page);
  },

  // Get upcoming movies
  // When streaming filter is active, use discover with future date window (today → +60 days).
  // Otherwise use the official /movie/upcoming endpoint.
  getUpcomingMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    if (hasSelectedPlatformFilter()) {
      const today = todayLocal();
      const sixtyDaysAhead = shiftDate(today, 60);

      const data = (await makeDiscoveryRequest(
        "/discover/movie",
        {
          page,
          sort_by: "popularity.desc",
          "primary_release_date.gte": today,
          "primary_release_date.lte": sixtyDaysAhead,
        },
      )) as TMDBResponse<Movie>;
      return data;
    }

    return tmdbApi.getUpcomingMovies(page);
  },

  // Get trending movies this week (paginated)
  // When streaming filter is active, fall back to discover with popularity sort + date ceiling.
  getTrendingMoviesWeekly: async (
    page: number = 1,
  ): Promise<TMDBResponse<Movie>> => {
    if (hasSelectedPlatformFilter()) {
      const today = todayLocal();
      const data = (await makeDiscoveryRequest(
        "/discover/movie",
        {
          page,
          sort_by: "popularity.desc",
          "primary_release_date.lte": today,
        },
      )) as TMDBResponse<Movie>;
      return data;
    }

    return tmdbApi.getTrendingMovies(page);
  },

  // Get trending TV shows this week (paginated)
  // When streaming filter is active, fall back to discover with popularity sort + date bounds.
  getTrendingTVShowsWeekly: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    if (hasSelectedPlatformFilter()) {
      const today = todayLocal();
      const tenYearsAgo = shiftYears(today, -10);
      const data = (await makeDiscoveryRequest(
        "/discover/tv",
        {
          page,
          sort_by: "popularity.desc",
          "first_air_date.gte": tenYearsAgo,
          "first_air_date.lte": today,
        },
      )) as TMDBResponse<TVShow>;
      return data;
    }

    return tmdbApi.getTrendingTVShows(page);
  },

  // Discover movies by genre with optional streaming filter.
  // Upper date bound prevents unreleased/future movies from appearing.
  // `filters` come from the genre page filter bar and override the defaults.
  discoverMoviesByGenre: async (
    genreId: number,
    page: number = 1,
    filters: FilterOptions = {},
  ): Promise<TMDBResponse<Movie>> => {
    const today = todayLocal();
    // The page genre always applies; a genre picked in the filter bar narrows
    // results further (comma-separated genres are AND-ed by TMDB).
    const mergedFilters: FilterOptions = {
      ...filters,
      genre: filters.genre ? `${genreId},${filters.genre}` : String(genreId),
    };
    const data = (await makeDiscoveryRequest(
      "/discover/movie",
      {
        page,
        sort_by: "popularity.desc",
        "primary_release_date.lte": today,
      },
      mergedFilters,
    )) as TMDBResponse<Movie>;

    return data;
  },

  // Discover TV shows by genre with optional streaming filter.
  // first_air_date bounds keep soap operas and future shows out of results.
  // `filters` come from the genre page filter bar and override the defaults.
  discoverTVShowsByGenre: async (
    genreId: number,
    page: number = 1,
    filters: FilterOptions = {},
  ): Promise<TMDBResponse<TVShow>> => {
    const today = todayLocal();
    const tenYearsAgo = shiftYears(today, -10);
    const mergedFilters: FilterOptions = {
      ...filters,
      genre: filters.genre ? `${genreId},${filters.genre}` : String(genreId),
    };
    const data = (await makeDiscoveryRequest(
      "/discover/tv",
      {
        page,
        sort_by: "popularity.desc",
        // The 10-year floor is only a default for the unfiltered listing – it
        // would wipe out the results whenever an older year is requested.
        ...(filters.year ? {} : { "first_air_date.gte": tenYearsAgo }),
        "first_air_date.lte": today,
      },
      mergedFilters,
    )) as TMDBResponse<TVShow>;

    return data;
  },

  // Get trending movies and TV shows with optional streaming filter
  getTrending: async (
    mediaType: "all" | "movie" | "tv" = "all",
    timeWindow: "day" | "week" = "week",
  ) => {
    if (hasSelectedPlatformFilter()) {
      // Use discovery API with streaming filter for better performance
      if (mediaType === "all") {
        const todayStr = todayLocal();
        const tenYrsAgo = shiftYears(todayStr, -10);
        const [moviesResponse, tvResponse] = await Promise.all([
          makeDiscoveryRequest(
            "/discover/movie",
            {
              page: 1,
              sort_by: "popularity.desc",
              "primary_release_date.lte": todayStr,
            },
          ) as Promise<TMDBResponse<Movie>>,
          makeDiscoveryRequest(
            "/discover/tv",
            {
              page: 1,
              sort_by: "popularity.desc",
              "first_air_date.gte": tenYrsAgo,
              "first_air_date.lte": todayStr,
            },
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
          release_date: tv.first_air_date ?? "",
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
        const todayStr = todayLocal();
        const data = (await makeDiscoveryRequest(
          "/discover/movie",
          {
            page: 1,
            sort_by: "popularity.desc",
            "primary_release_date.lte": todayStr,
          },
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
        const todayStr = todayLocal();
        const tenYearsAgo = shiftYears(todayStr, -10);
        const data = (await makeDiscoveryRequest(
          "/discover/tv",
          {
            page: 1,
            sort_by: "popularity.desc",
            "first_air_date.gte": tenYearsAgo,
            "first_air_date.lte": todayStr,
          },
        )) as TMDBResponse<TVShow>;

        // Transform results - watch providers loaded lazily on client
        const mediaItems = data.results.map((tv: TVShow) => ({
          id: tv.id,
          title: tv.name,
          overview: tv.overview,
          poster_path: tv.poster_path,
          backdrop_path: tv.backdrop_path,
          release_date: tv.first_air_date ?? "",
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

  // Discover movies with advanced filters. Routed through
  // `makeDiscoveryRequest` like every other listing, so the region and the
  // provider scope reach the query the same way they do everywhere else.
  discoverMovies: async (
    page: number = 1,
    filters: FilterOptions = {},
    options?: TMDBRequestOptions,
  ): Promise<TMDBResponse<Movie>> => {
    return (await makeDiscoveryRequest(
      "/discover/movie",
      { page },
      filters,
      options,
    )) as TMDBResponse<Movie>;
  },

  // Discover TV shows with advanced filters
  discoverTVShows: async (
    page: number = 1,
    filters: FilterOptions = {},
    options?: TMDBRequestOptions,
  ): Promise<TMDBResponse<TVShow>> => {
    return (await makeDiscoveryRequest(
      "/discover/tv",
      { page },
      filters,
      options,
    )) as TMDBResponse<TVShow>;
  },

  // Search for movies and TV shows
  searchMulti: async (
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<MediaItem>> => {
    // Use the client API function since search doesn't need server-side filtering
    return tmdbApi.searchMulti(query, page);
  },

  // Search for people
  searchPerson: async (
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<Person>> => {
    return tmdbApi.searchPerson(query, page);
  },

  // Search for films only, for the daily puzzle's guess box. Filtering a mixed
  // page down to films is not the same thing: for "Friends" or "Ray" the first
  // page of /search/multi is mostly series and people, and the film being
  // guessed can fall off it entirely. No region either – a guess has to be
  // findable whichever country the visitor picked.
  searchMovies: async (
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<MediaItem>> => {
    const params = new URLSearchParams({ query, page: String(page) });
    const url = `${TMDB_CONFIG.BASE_URL}/search/movie?${params}`;
    const data = await tmdbFetchJson<TMDBResponse<Movie>>(url, TTL.SHORT);

    return {
      ...data,
      results: data.results.map((movie) => ({
        ...convertMovieToMediaItem(movie),
        // An unreleased film can come back without one; empty is what the rest
        // of the app reads as "no date".
        release_date: movie.release_date ?? "",
      })),
    };
  },
};
