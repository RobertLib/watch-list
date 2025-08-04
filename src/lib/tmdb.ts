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
import { getRegion } from "./settings";
import { getRegionCode } from "./region";
import { TMDB_CONFIG, TTL, pathId, tmdbFetchJson } from "./tmdb-cache";
import { getImageUrl } from "./tmdb-image";

/**
 * Listing URLs, which carry the visitor's region.
 *
 * Synchronous now, and that is the whole shape of the migration in one function:
 * the region used to come from an httpOnly cookie, which meant a `await
 * cookies()` and therefore a server. It comes from local storage instead, so a
 * URL can be built anywhere – including inside an effect on a statically served
 * page.
 */
function buildUrl(
  endpoint: string,
  params: Record<string, string | number> = {},
): string {
  const regionCode = getRegionCode(getRegion());

  const finalParams: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ),
    region: regionCode,
  };

  const queryString = new URLSearchParams(finalParams).toString();
  return `${TMDB_CONFIG.BASE_URL}${endpoint}?${queryString}`;
}

// URL builder for anything addressed by a single title, person or collection id.
//
// No region, deliberately. TMDB varies nothing on these endpoints by country –
// a film's credits are its credits – so putting the visitor's region in the URL
// only changes the cache key. That cost two things: a region change threw away
// detail data it had no reason to, and `/tv/{id}/season/{n}` here did not share
// an entry with the identical request `tmdb-cache.ts` builds without one.
//
// The endpoints that *do* read region – now playing, upcoming, and discover with
// a release-type filter – go through `buildUrl` above.
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

export const tmdbApi = {
  // Get trending movies and TV shows
  getTrending: async (
    mediaType: "all" | "movie" | "tv" = "all",
    timeWindow: "day" | "week" = "week",
  ): Promise<TMDBResponse<MediaItem>> => {
    const url = buildUrl(`/trending/${mediaType}/${timeWindow}`);
    const data = (await tmdbFetchJson(url, 3600)) as TMDBResponse<
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
    const url = buildUrl("/movie/popular", { page });
    return tmdbFetchJson(url, 3600) as Promise<TMDBResponse<Movie>>; // 1 hour
  },

  // Get popular TV shows
  getPopularTVShows: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = buildUrl("/tv/popular", { page });
    return tmdbFetchJson(url, 3600) as Promise<TMDBResponse<TVShow>>; // 1 hour
  },

  // Get top rated movies
  getTopRatedMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const url = buildUrl("/movie/top_rated", { page });
    // 24 hours – top-rated list changes slowly
    return tmdbFetchJson(url, 86400) as Promise<TMDBResponse<Movie>>;
  },

  // Get top rated TV shows
  getTopRatedTVShows: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = buildUrl("/tv/top_rated", { page });
    // 24 hours – top-rated list changes slowly
    return tmdbFetchJson(url, 86400) as Promise<TMDBResponse<TVShow>>;
  },

  // Get now playing movies
  getNowPlayingMovies: async (
    page: number = 1,
  ): Promise<TMDBResponse<Movie>> => {
    const url = buildUrl("/movie/now_playing", { page });
    // 1 hour – now-playing changes more often
    return tmdbFetchJson(url, 3600) as Promise<TMDBResponse<Movie>>;
  },

  // Get airing today TV shows
  getAiringTodayTVShows: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = buildUrl("/tv/airing_today", { page });
    // 1 hour – airing today changes frequently
    return tmdbFetchJson(url, 3600) as Promise<TMDBResponse<TVShow>>;
  },

  // Get upcoming movies
  getUpcomingMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const url = buildUrl("/movie/upcoming", { page });
    return tmdbFetchJson(url, 3600) as Promise<TMDBResponse<Movie>>;
  },

  // Get trending movies this week (paginated, returns raw Movie objects)
  getTrendingMovies: async (page: number = 1): Promise<TMDBResponse<Movie>> => {
    const url = buildUrl("/trending/movie/week", { page });
    return (await tmdbFetchJson(url, 3600)) as TMDBResponse<Movie>;
  },

  // Get trending TV shows this week (paginated, returns raw TVShow objects)
  getTrendingTVShows: async (
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = buildUrl("/trending/tv/week", { page });
    return (await tmdbFetchJson(url, 3600)) as TMDBResponse<TVShow>;
  },

  // Get movie genres
  getMovieGenres: async (): Promise<{ genres: Genre[] }> => {
    const url = buildUrl("/genre/movie/list");
    return tmdbFetchJson(url, 86400) as Promise<{ genres: Genre[] }>; // 24 hours cache
  },

  // Get TV genres
  getTVGenres: async (): Promise<{ genres: Genre[] }> => {
    const url = buildUrl("/genre/tv/list");
    return tmdbFetchJson(url, 86400) as Promise<{ genres: Genre[] }>; // 24 hours cache
  },

  // Search for movies and TV shows.
  //
  // `total_results` and `total_pages` are passed through exactly as TMDB sent
  // them, and they describe the *unfiltered* answer: `/search/multi` matches
  // people as well, and the people are dropped below. So the totals count rows
  // this function does not return, and a caller that prints `total_results` as a
  // number of titles will overstate it for any query that also names a person.
  //
  // They are left alone rather than adjusted because paging is what they are
  // for: page 2 of this endpoint is page 2 whatever is filtered out of page 1,
  // and a corrected `total_pages` would page over a set TMDB will not serve.
  // `SearchContent` subtracts `/search/person`'s own total when it needs a count
  // of titles to show.
  searchMulti: async (
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<MediaItem>> => {
    const url = buildUrl("/search/multi", {
      query,
      page,
    });
    const data = (await tmdbFetchJson(url, 3600)) as TMDBResponse<
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

  // Get image URL – lives in tmdb-image.ts so a component that only wants a
  // poster URL does not have to pull in the whole TMDB client for it.
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
    const url = buildDetailUrl(`/movie/${pathId(movieId, "movieId")}`, params);
    return tmdbFetchJson(url, TTL.LONG) as Promise<MovieDetails>;
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
    const url = buildDetailUrl(`/tv/${pathId(tvId, "tvId")}`, params);
    return tmdbFetchJson(url, TTL.LONG) as Promise<TVShowDetails>;
  },

  // Get movie credits
  getMovieCredits: async (movieId: number): Promise<Credits> => {
    const url = buildDetailUrl(`/movie/${pathId(movieId, "movieId")}/credits`);
    return tmdbFetchJson(url, 7200) as Promise<Credits>; // 2 hours cache
  },

  // Get TV show credits
  getTVShowCredits: async (tvId: number): Promise<Credits> => {
    const url = buildDetailUrl(`/tv/${pathId(tvId, "tvId")}/credits`);
    return tmdbFetchJson(url, 7200) as Promise<Credits>; // 2 hours cache
  },

  // Get movie videos
  getMovieVideos: async (movieId: number): Promise<VideosResponse> => {
    const url = buildDetailUrl(`/movie/${pathId(movieId, "movieId")}/videos`);
    return tmdbFetchJson(url, 7200) as Promise<VideosResponse>; // 2 hours cache
  },

  // Get TV show videos
  getTVShowVideos: async (tvId: number): Promise<VideosResponse> => {
    const url = buildDetailUrl(`/tv/${pathId(tvId, "tvId")}/videos`);
    return tmdbFetchJson(url, 7200) as Promise<VideosResponse>; // 2 hours cache
  },

  // Get similar movies
  getSimilarMovies: async (movieId: number): Promise<TMDBResponse<Movie>> => {
    const url = buildDetailUrl(`/movie/${pathId(movieId, "movieId")}/similar`);
    return tmdbFetchJson(url, 3600) as Promise<TMDBResponse<Movie>>; // 1 hour cache
  },

  // Get similar TV shows
  getSimilarTVShows: async (tvId: number): Promise<TMDBResponse<TVShow>> => {
    const url = buildDetailUrl(`/tv/${pathId(tvId, "tvId")}/similar`);
    return tmdbFetchJson(url, 3600) as Promise<TMDBResponse<TVShow>>; // 1 hour cache
  },

  // Get movies recommended for a movie – TMDB's own "viewers also liked" list,
  // which blends genre, cast and audience overlap rather than metadata alone.
  getMovieRecommendations: async (
    movieId: number,
  ): Promise<TMDBResponse<Movie>> => {
    const url = buildDetailUrl(`/movie/${pathId(movieId, "movieId")}/recommendations`);
    return tmdbFetchJson(url, 21600) as Promise<TMDBResponse<Movie>>; // 6 hours cache
  },

  // Get TV shows recommended for a TV show
  getTVShowRecommendations: async (
    tvId: number,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = buildDetailUrl(`/tv/${pathId(tvId, "tvId")}/recommendations`);
    return tmdbFetchJson(url, 21600) as Promise<TMDBResponse<TVShow>>; // 6 hours cache
  },

  // Discover movies by genre
  discoverMoviesByGenre: async (
    genreId: number,
    page: number = 1,
  ): Promise<TMDBResponse<Movie>> => {
    const url = buildUrl("/discover/movie", {
      with_genres: genreId,
      page,
      sort_by: "popularity.desc",
    });
    return tmdbFetchJson(url, 3600) as Promise<TMDBResponse<Movie>>; // 1 hour cache
  },

  // Discover TV shows by genre
  discoverTVShowsByGenre: async (
    genreId: number,
    page: number = 1,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = buildUrl("/discover/tv", {
      with_genres: genreId,
      page,
      sort_by: "popularity.desc",
    });
    return tmdbFetchJson(url, 3600) as Promise<TMDBResponse<TVShow>>; // 1 hour cache
  },

  // Get movie translations
  getMovieTranslations: async (
    movieId: number,
  ): Promise<TranslationsResponse> => {
    const url = buildDetailUrl(`/movie/${pathId(movieId, "movieId")}/translations`);
    return tmdbFetchJson(url, 86400) as Promise<TranslationsResponse>; // 24 hours cache
  },

  // Get TV show translations
  getTVShowTranslations: async (
    tvId: number,
  ): Promise<TVTranslationsResponse> => {
    const url = buildDetailUrl(`/tv/${pathId(tvId, "tvId")}/translations`);
    return tmdbFetchJson(url, 86400) as Promise<TVTranslationsResponse>; // 24 hours cache
  },

  // Get person details
  getPersonDetails: async (personId: number): Promise<PersonDetails> => {
    const url = buildDetailUrl(`/person/${pathId(personId, "personId")}`);
    return tmdbFetchJson(url, TTL.LONG) as Promise<PersonDetails>;
  },

  // Get person movie credits
  getPersonMovieCredits: async (
    personId: number,
  ): Promise<PersonMovieCredits> => {
    const url = buildDetailUrl(`/person/${pathId(personId, "personId")}/movie_credits`);
    return tmdbFetchJson(url, TTL.LONG) as Promise<PersonMovieCredits>;
  },

  // Get person TV credits
  getPersonTVCredits: async (personId: number): Promise<PersonTVCredits> => {
    const url = buildDetailUrl(`/person/${pathId(personId, "personId")}/tv_credits`);
    return tmdbFetchJson(url, TTL.LONG) as Promise<PersonTVCredits>;
  },

  // Get popular people
  getPopularPeople: async (page: number = 1): Promise<TMDBResponse<Person>> => {
    const url = buildUrl("/person/popular", { page });
    return tmdbFetchJson(url, 3600) as Promise<TMDBResponse<Person>>; // 1 hour cache
  },

  // Search people by name
  searchPerson: async (
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<Person>> => {
    const url = buildUrl("/search/person", {
      query,
      page,
    });
    return tmdbFetchJson(url, 3600) as Promise<TMDBResponse<Person>>; // 1 hour cache
  },

  // Get collection details (movies in a collection)
  getCollectionDetails: async (
    collectionId: number,
  ): Promise<CollectionDetails> => {
    const url = buildDetailUrl(`/collection/${pathId(collectionId, "collectionId")}`);
    return tmdbFetchJson(url, TTL.LONG) as Promise<CollectionDetails>;
  },

  // Get TV season details with episode list
  getSeasonDetails: async (
    tvId: number,
    seasonNumber: number,
  ): Promise<SeasonDetails> => {
    // Season 0 exists on TMDB – it holds the specials.
    const url = buildDetailUrl(
      `/tv/${pathId(tvId, "tvId")}/season/${pathId(seasonNumber, "seasonNumber", 0)}`,
    );
    return tmdbFetchJson(url, TTL.LONG) as Promise<SeasonDetails>;
  },
};

export default tmdbApi;
