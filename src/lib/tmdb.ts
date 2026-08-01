import {
  Movie,
  TVShow,
  TMDBResponse,
  Genre,
  MediaItem,
  MovieDetails,
  TVShowDetails,
  Credits,
  VideosResponse,
  TranslationsResponse,
  TVTranslationsResponse,
  PersonDetails,
  PersonMovieCredits,
  PersonTVCredits,
  Person,
  CollectionDetails,
  SeasonDetails,
} from "@/types/tmdb";
import { getRegion } from "@/lib/region-server";
import { getRegionCode } from "./region";
import { TMDB_CONFIG, tmdbFetchJson } from "./tmdb-cache";
import { getImageUrl } from "./tmdb-image";

async function buildUrl(
  endpoint: string,
  params: Record<string, string | number> = {},
): Promise<string> {
  const region = await getRegion();
  const regionCode = getRegionCode(region);

  const finalParams: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ),
    region: regionCode,
  };

  const queryString = new URLSearchParams(finalParams).toString();
  return `${TMDB_CONFIG.BASE_URL}${endpoint}?${queryString}`;
}

// URL builder for detail pages – no region/cookies so the route stays static.
function buildDetailUrl(
  endpoint: string,
  params: Record<string, string | number> = {},
): string {
  const finalParams: Record<string, string> = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
  const queryString = new URLSearchParams(finalParams).toString();
  return `${TMDB_CONFIG.BASE_URL}${endpoint}${queryString ? `?${queryString}` : ""}`;
}

// Cached API request helper for basic TMDB calls
async function cachedFetch(
  url: string,
  cacheKey: string,
  revalidateTime: number = 21600,
): Promise<unknown> {
  return tmdbFetchJson<unknown>(url, {
    headers: TMDB_CONFIG.headers,
    next: {
      revalidate: revalidateTime,
      tags: ["tmdb", cacheKey],
    },
  });
}

// Fetch for detail pages – no HTTP cache (detail queries rarely repeat).
async function detailFetch(url: string): Promise<unknown> {
  return tmdbFetchJson<unknown>(url, {
    headers: TMDB_CONFIG.headers,
    cache: "no-store",
  });
}

// Listing endpoints that are cached but not tagged individually.
async function listFetch(
  url: string,
  revalidateTime: number,
): Promise<unknown> {
  return tmdbFetchJson<unknown>(url, {
    headers: TMDB_CONFIG.headers,
    next: { revalidate: revalidateTime },
  });
}

export const tmdbApi = {
  // Get trending movies and TV shows
  getTrending: async (
    mediaType: "all" | "movie" | "tv" = "all",
    timeWindow: "day" | "week" = "week",
  ): Promise<TMDBResponse<MediaItem>> => {
    const url = await buildUrl(`/trending/${mediaType}/${timeWindow}`);
    const cacheKey = `trending-${mediaType}-${timeWindow}`;
    const data = (await cachedFetch(url, cacheKey, 3600)) as TMDBResponse<
      (Movie | TVShow) & { media_type: string }
    >;

    return {
      ...data,
      results: data.results.map(
        (item: (Movie | TVShow) & { media_type: string }) => ({
          ...item,
          title: "title" in item ? item.title : item.name,
          release_date:
            "release_date" in item ? item.release_date : item.first_air_date,
          media_type: item.media_type === "movie" ? "movie" : "tv",
        }),
      ),
    };
  },

  // Get popular movies
  getPopularMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl("/movie/popular", { page });
    return listFetch(url, 3600) as Promise<TMDBResponse<Movie>>; // 1 hour
  },

  // Get popular TV shows
  getPopularTVShows: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildUrl("/tv/popular", { page });
    return listFetch(url, 3600) as Promise<TMDBResponse<TVShow>>; // 1 hour
  },

  // Get top rated movies
  getTopRatedMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl("/movie/top_rated", { page });
    // 24 hours – top-rated list changes slowly
    return listFetch(url, 86400) as Promise<TMDBResponse<Movie>>;
  },

  // Get top rated TV shows
  getTopRatedTVShows: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildUrl("/tv/top_rated", { page });
    // 24 hours – top-rated list changes slowly
    return listFetch(url, 86400) as Promise<TMDBResponse<TVShow>>;
  },

  // Get now playing movies
  getNowPlayingMovies: async (
    page: number = 1,
  ): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl("/movie/now_playing", { page });
    // 1 hour – now-playing changes more often
    return listFetch(url, 3600) as Promise<TMDBResponse<Movie>>;
  },

  // Get airing today TV shows
  getAiringTodayTVShows: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildUrl("/tv/airing_today", { page });
    // 1 hour – airing today changes frequently
    return listFetch(url, 3600) as Promise<TMDBResponse<TVShow>>;
  },

  // Get upcoming movies
  getUpcomingMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl("/movie/upcoming", { page });
    return listFetch(url, 3600) as Promise<TMDBResponse<Movie>>;
  },

  // Get trending movies this week (paginated, returns raw Movie objects)
  getTrendingMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl("/trending/movie/week", { page });
    return (await cachedFetch(
      url,
      `trending-movies-week-${page}`,
      3600,
    )) as TMDBResponse<Movie>;
  },

  // Get trending TV shows this week (paginated, returns raw TVShow objects)
  getTrendingTVShows: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildUrl("/trending/tv/week", { page });
    return (await cachedFetch(
      url,
      `trending-tv-week-${page}`,
      3600,
    )) as TMDBResponse<TVShow>;
  },

  // Get movie genres
  getMovieGenres: async (): Promise<{ genres: Genre[] }> => {
    const url = await buildUrl("/genre/movie/list");
    const cacheKey = "movie-genres";
    return cachedFetch(url, cacheKey, 86400) as Promise<{ genres: Genre[] }>; // 24 hours cache
  },

  // Get TV genres
  getTVGenres: async (): Promise<{ genres: Genre[] }> => {
    const url = await buildUrl("/genre/tv/list");
    const cacheKey = "tv-genres";
    return cachedFetch(url, cacheKey, 86400) as Promise<{ genres: Genre[] }>; // 24 hours cache
  },

  // Search for movies and TV shows
  searchMulti: async (
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<MediaItem>> => {
    const url = await buildUrl("/search/multi", {
      query,
      page,
    });
    const cacheKey = `search-multi-${query}-${page}`;
    const data = (await cachedFetch(url, cacheKey, 3600)) as TMDBResponse<
      (Movie | TVShow) & { media_type: string }
    >;

    return {
      ...data,
      results: data.results
        .filter(
          (item: { media_type: string }) =>
            item.media_type === "movie" || item.media_type === "tv",
        )
        .map((item: (Movie | TVShow) & { media_type: string }) => ({
          ...item,
          title: "title" in item ? item.title : item.name,
          release_date:
            "release_date" in item ? item.release_date : item.first_air_date,
          media_type: item.media_type === "movie" ? "movie" : "tv",
        })),
    };
  },

  // Get image URL – lives in tmdb-image.ts so client components can use it
  // without pulling this server-only module into the browser bundle.
  getImageUrl,

  // Get movie details with optional append_to_response
  getMovieDetails: async (
    movieId: number,
    appendToResponse?: string,
  ): Promise<MovieDetails> => {
    const params: Record<string, string | number> = {};
    if (appendToResponse) {
      params.append_to_response = appendToResponse;
    }
    const url = buildDetailUrl(`/movie/${movieId}`, params);
    return detailFetch(url) as Promise<MovieDetails>;
  },

  // Get TV show details with optional append_to_response
  getTVShowDetails: async (
    tvId: number,
    appendToResponse?: string,
  ): Promise<TVShowDetails> => {
    const params: Record<string, string | number> = {};
    if (appendToResponse) {
      params.append_to_response = appendToResponse;
    }
    const url = buildDetailUrl(`/tv/${tvId}`, params);
    return detailFetch(url) as Promise<TVShowDetails>;
  },

  // Get movie credits
  getMovieCredits: async (movieId: number): Promise<Credits> => {
    const url = await buildUrl(`/movie/${movieId}/credits`);
    const cacheKey = `movie-credits-${movieId}`;
    return cachedFetch(url, cacheKey, 7200) as Promise<Credits>; // 2 hours cache
  },

  // Get TV show credits
  getTVShowCredits: async (tvId: number): Promise<Credits> => {
    const url = await buildUrl(`/tv/${tvId}/credits`);
    const cacheKey = `tv-credits-${tvId}`;
    return cachedFetch(url, cacheKey, 7200) as Promise<Credits>; // 2 hours cache
  },

  // Get movie videos
  getMovieVideos: async (movieId: number): Promise<VideosResponse> => {
    const url = await buildUrl(`/movie/${movieId}/videos`);
    const cacheKey = `movie-videos-${movieId}`;
    return cachedFetch(url, cacheKey, 7200) as Promise<VideosResponse>; // 2 hours cache
  },

  // Get TV show videos
  getTVShowVideos: async (tvId: number): Promise<VideosResponse> => {
    const url = await buildUrl(`/tv/${tvId}/videos`);
    const cacheKey = `tv-videos-${tvId}`;
    return cachedFetch(url, cacheKey, 7200) as Promise<VideosResponse>; // 2 hours cache
  },

  // Get similar movies
  getSimilarMovies: async (movieId: number): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl(`/movie/${movieId}/similar`);
    const cacheKey = `similar-movies-${movieId}`;
    return cachedFetch(url, cacheKey, 3600) as Promise<TMDBResponse<Movie>>; // 1 hour cache
  },

  // Get similar TV shows
  getSimilarTVShows: async (tvId: number): Promise<TMDBResponse<TVShow>> => {
    const url = await buildUrl(`/tv/${tvId}/similar`);
    const cacheKey = `similar-tv-${tvId}`;
    return cachedFetch(url, cacheKey, 3600) as Promise<TMDBResponse<TVShow>>; // 1 hour cache
  },

  // Get movies recommended for a movie – TMDB's own "viewers also liked" list,
  // which blends genre, cast and audience overlap rather than metadata alone.
  getMovieRecommendations: async (
    movieId: number,
  ): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl(`/movie/${movieId}/recommendations`);
    const cacheKey = `movie-recommendations-${movieId}`;
    return cachedFetch(url, cacheKey, 21600) as Promise<TMDBResponse<Movie>>; // 6 hours cache
  },

  // Get TV shows recommended for a TV show
  getTVShowRecommendations: async (
    tvId: number,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildUrl(`/tv/${tvId}/recommendations`);
    const cacheKey = `tv-recommendations-${tvId}`;
    return cachedFetch(url, cacheKey, 21600) as Promise<TMDBResponse<TVShow>>; // 6 hours cache
  },

  // Discover movies by genre
  discoverMoviesByGenre: async (
    genreId: number,
    page: number = 1,
  ): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl("/discover/movie", {
      with_genres: genreId,
      page,
      sort_by: "popularity.desc",
    });
    const cacheKey = `discover-movies-genre-${genreId}-${page}`;
    return cachedFetch(url, cacheKey, 3600) as Promise<TMDBResponse<Movie>>; // 1 hour cache
  },

  // Discover TV shows by genre
  discoverTVShowsByGenre: async (
    genreId: number,
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildUrl("/discover/tv", {
      with_genres: genreId,
      page,
      sort_by: "popularity.desc",
    });
    const cacheKey = `discover-tv-genre-${genreId}-${page}`;
    return cachedFetch(url, cacheKey, 3600) as Promise<TMDBResponse<TVShow>>; // 1 hour cache
  },

  // Get movie translations
  getMovieTranslations: async (
    movieId: number,
  ): Promise<TranslationsResponse> => {
    const url = await buildUrl(`/movie/${movieId}/translations`);
    const cacheKey = `movie-translations-${movieId}`;
    return cachedFetch(url, cacheKey, 86400) as Promise<TranslationsResponse>; // 24 hours cache
  },

  // Get TV show translations
  getTVShowTranslations: async (
    tvId: number,
  ): Promise<TVTranslationsResponse> => {
    const url = await buildUrl(`/tv/${tvId}/translations`);
    const cacheKey = `tv-translations-${tvId}`;
    return cachedFetch(url, cacheKey, 86400) as Promise<TVTranslationsResponse>; // 24 hours cache
  },

  // Get person details
  getPersonDetails: async (personId: number): Promise<PersonDetails> => {
    const url = buildDetailUrl(`/person/${personId}`);
    return detailFetch(url) as Promise<PersonDetails>;
  },

  // Get person movie credits
  getPersonMovieCredits: async (
    personId: number,
  ): Promise<PersonMovieCredits> => {
    const url = buildDetailUrl(`/person/${personId}/movie_credits`);
    return detailFetch(url) as Promise<PersonMovieCredits>;
  },

  // Get person TV credits
  getPersonTVCredits: async (personId: number): Promise<PersonTVCredits> => {
    const url = buildDetailUrl(`/person/${personId}/tv_credits`);
    return detailFetch(url) as Promise<PersonTVCredits>;
  },

  // Get popular people
  getPopularPeople: async (page: number = 1): Promise<TMDBResponse<Person>> => {
    const url = await buildUrl("/person/popular", { page });
    const cacheKey = `popular-people-${page}`;
    return cachedFetch(url, cacheKey, 3600) as Promise<TMDBResponse<Person>>; // 1 hour cache
  },

  // Search people by name
  searchPerson: async (
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<Person>> => {
    const url = await buildUrl("/search/person", {
      query,
      page,
    });
    const cacheKey = `search-person-${query}-${page}`;
    return cachedFetch(url, cacheKey, 3600) as Promise<TMDBResponse<Person>>; // 1 hour cache
  },

  // Get collection details (movies in a collection)
  getCollectionDetails: async (
    collectionId: number,
  ): Promise<CollectionDetails> => {
    const url = await buildUrl(`/collection/${collectionId}`);
    return detailFetch(url) as Promise<CollectionDetails>;
  },

  // Get TV season details with episode list
  getSeasonDetails: async (
    tvId: number,
    seasonNumber: number,
  ): Promise<SeasonDetails> => {
    const url = await buildUrl(`/tv/${tvId}/season/${seasonNumber}`);
    return detailFetch(url) as Promise<SeasonDetails>;
  },
};

export default tmdbApi;
