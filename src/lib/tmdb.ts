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
} from "@/types/tmdb";
import { getRegion } from "@/lib/region-server";
import { getRegionCode } from "./region";
import { TMDB_CONFIG } from "./tmdb-cache";

async function buildUrl(
  endpoint: string,
  params: Record<string, string | number> = {}
): Promise<string> {
  const region = await getRegion();
  const regionCode = getRegionCode(region);

  const finalParams: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)])
    ),
    region: regionCode,
  };

  const queryString = new URLSearchParams(finalParams).toString();
  return `${TMDB_CONFIG.BASE_URL}${endpoint}?${queryString}`;
}

// Cached API request helper for basic TMDB calls
async function cachedFetch(
  url: string,
  cacheKey: string,
  revalidateTime: number = 3600
): Promise<unknown> {
  const response = await fetch(url, {
    headers: TMDB_CONFIG.headers,
    next: {
      revalidate: revalidateTime,
      tags: ["tmdb", cacheKey],
    },
  });
  return response.json();
}

export const tmdbApi = {
  // Get trending movies and TV shows
  getTrending: async (
    mediaType: "all" | "movie" | "tv" = "all",
    timeWindow: "day" | "week" = "week"
  ): Promise<TMDBResponse<MediaItem>> => {
    const url = await buildUrl(`/trending/${mediaType}/${timeWindow}`);
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    const data = await response.json();

    return {
      ...data,
      results: data.results.map(
        (item: (Movie | TVShow) & { media_type: string }) => ({
          ...item,
          title: "title" in item ? item.title : item.name,
          release_date:
            "release_date" in item ? item.release_date : item.first_air_date,
          media_type: item.media_type === "movie" ? "movie" : "tv",
        })
      ),
    };
  },

  // Get popular movies
  getPopularMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl("/movie/popular", { page });
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get popular TV shows
  getPopularTVShows: async (
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildUrl("/tv/popular", { page });
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get top rated movies
  getTopRatedMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl("/movie/top_rated", { page });
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get top rated TV shows
  getTopRatedTVShows: async (
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildUrl("/tv/top_rated", { page });
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get now playing movies
  getNowPlayingMovies: async (
    page: number = 1
  ): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl("/movie/now_playing", { page });
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get airing today TV shows
  getAiringTodayTVShows: async (
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildUrl("/tv/airing_today", { page });
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get movie genres
  getMovieGenres: async (): Promise<{ genres: Genre[] }> => {
    const url = await buildUrl("/genre/movie/list");
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get TV genres
  getTVGenres: async (): Promise<{ genres: Genre[] }> => {
    const url = await buildUrl("/genre/tv/list");
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Search for movies and TV shows
  searchMulti: async (
    query: string,
    page: number = 1
  ): Promise<TMDBResponse<MediaItem>> => {
    const url = await buildUrl("/search/multi", {
      query: encodeURIComponent(query),
      page,
    });
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    const data = await response.json();

    return {
      ...data,
      results: data.results
        .filter(
          (item: { media_type: string }) =>
            item.media_type === "movie" || item.media_type === "tv"
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

  // Get image URL
  getImageUrl: (
    path: string | null,
    size: "w500" | "w780" | "w1280" | "original" = "w500"
  ): string => {
    if (!path) return "/placeholder-movie.svg";
    return `https://image.tmdb.org/t/p/${size}${path}`;
  },

  // Get movie details with optional append_to_response
  getMovieDetails: async (
    movieId: number,
    appendToResponse?: string
  ): Promise<MovieDetails> => {
    const params: Record<string, string | number> = {};
    if (appendToResponse) {
      params.append_to_response = appendToResponse;
    }
    const url = await buildUrl(`/movie/${movieId}`, params);
    const cacheKey = `movie-details-${movieId}-${appendToResponse || "basic"}`;
    return cachedFetch(url, cacheKey, 7200) as Promise<MovieDetails>; // 2 hours cache
  },

  // Get TV show details with optional append_to_response
  getTVShowDetails: async (
    tvId: number,
    appendToResponse?: string
  ): Promise<TVShowDetails> => {
    const params: Record<string, string | number> = {};
    if (appendToResponse) {
      params.append_to_response = appendToResponse;
    }
    const url = await buildUrl(`/tv/${tvId}`, params);
    const cacheKey = `tv-details-${tvId}-${appendToResponse || "basic"}`;
    return cachedFetch(url, cacheKey, 7200) as Promise<TVShowDetails>; // 2 hours cache
  },

  // Get movie credits
  getMovieCredits: async (movieId: number): Promise<Credits> => {
    const url = await buildUrl(`/movie/${movieId}/credits`);
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get TV show credits
  getTVShowCredits: async (tvId: number): Promise<Credits> => {
    const url = await buildUrl(`/tv/${tvId}/credits`);
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get movie videos
  getMovieVideos: async (movieId: number): Promise<VideosResponse> => {
    const url = await buildUrl(`/movie/${movieId}/videos`);
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get TV show videos
  getTVShowVideos: async (tvId: number): Promise<VideosResponse> => {
    const url = await buildUrl(`/tv/${tvId}/videos`);
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
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

  // Discover movies by genre
  discoverMoviesByGenre: async (
    genreId: number,
    page: number = 1
  ): Promise<TMDBResponse<Movie>> => {
    const url = await buildUrl("/discover/movie", {
      with_genres: genreId,
      page,
      sort_by: "popularity.desc",
    });
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Discover TV shows by genre
  discoverTVShowsByGenre: async (
    genreId: number,
    page: number = 1
  ): Promise<TMDBResponse<TVShow>> => {
    const url = await buildUrl("/discover/tv", {
      with_genres: genreId,
      page,
      sort_by: "popularity.desc",
    });
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get movie translations
  getMovieTranslations: async (
    movieId: number
  ): Promise<TranslationsResponse> => {
    const url = await buildUrl(`/movie/${movieId}/translations`);
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },

  // Get TV show translations
  getTVShowTranslations: async (
    tvId: number
  ): Promise<TVTranslationsResponse> => {
    const url = await buildUrl(`/tv/${tvId}/translations`);
    const response = await fetch(url, { headers: TMDB_CONFIG.headers });
    return response.json();
  },
};

export default tmdbApi;
