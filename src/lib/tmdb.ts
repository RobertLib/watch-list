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
import { TMDB_CONFIG, TTL, pathId, tmdbFetchJson, type TMDBRequestOptions } from "./tmdb-cache";
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

/**
 * The one date a card reads, whichever name TMDB gave it.
 *
 * A `MediaItem` promises a string there, and the mixed rows behind trending
 * and search do not: a series can carry `first_air_date: null`, and a row that
 * is neither shape – TMDB has been known to label a person "tv" – has no date
 * field at all, which used to put `undefined` into a field typed as a string.
 * Empty is what the rest of the app already reads as "no date".
 */
function releaseDateOf(item: Movie | TVShow): string {
  if ("release_date" in item) return item.release_date ?? "";
  return item.first_air_date ?? "";
}

type MultiSearchResult =
  | (Movie & { media_type: "movie" })
  | (TVShow & { media_type: "tv" })
  | (Person & { media_type: "person" });

async function fetchMultiSearch(query: string, page: number) {
  const url = buildUrl("/search/multi", { query, page });
  return tmdbFetchJson<TMDBResponse<MultiSearchResult>>(url, 3600);
}

function searchTitles(results: MultiSearchResult[]): MediaItem[] {
  return results
    .filter((item) => item.media_type === "movie" || item.media_type === "tv")
    .map((item) => ({
      ...item,
      title: "title" in item ? item.title : item.name,
      release_date: releaseDateOf(item),
    }));
}

/** One mixed results page, with its titles and people ready for their grids. */
export type MultiSearchPage = TMDBResponse<MediaItem> & { people: Person[] };

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
      // /trending/all includes people. A title card cannot route or save them
      // as films or shows, so keep only the two media types it understands.
      results: data.results
        .filter((item) => item.media_type === "movie" || item.media_type === "tv")
        .map((item: (Movie | TVShow) & { media_type: string }) => ({
          ...item,
          title: "title" in item ? item.title : item.name,
          release_date: releaseDateOf(item),
          media_type: item.media_type === "movie" ? "movie" : "tv",
        })),
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
    // A catalogue region does not set the visitor's calendar day. TMDB needs
    // their actual timezone, which also keeps distinct schedules apart in cache.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const url = buildUrl("/tv/airing_today", { page, timezone });
    // Today's programme cannot survive into tomorrow, even when this tab keeps
    // its cache through client navigation. Local midnight also handles DST days.
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ttl = Math.min(TTL.SHORT, (midnight.getTime() - now.getTime()) / 1000);
    return tmdbFetchJson(url, ttl) as Promise<TMDBResponse<TVShow>>;
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

  // Title-only preview for the header. The totals still describe the mixed
  // response; subtracting another endpoint's total cannot recover a title count
  // because broad queries can saturate both totals at TMDB's pagination limit.
  searchMulti: async (
    query: string,
    page: number = 1,
  ): Promise<TMDBResponse<MediaItem>> => {
    const data = await fetchMultiSearch(query, page);
    return { ...data, results: searchTitles(data.results) };
  },

  // Every person travels with the mixed page they belong to, so Next/Previous
  // exposes them as well as titles. Both search views share the transport URL.
  searchMultiWithPeople: async (
    query: string,
    page: number = 1,
  ): Promise<MultiSearchPage> => {
    const data = await fetchMultiSearch(query, page);
    return {
      ...data,
      results: searchTitles(data.results),
      people: data.results.filter((item) => item.media_type === "person"),
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
    options?: TMDBRequestOptions,
  ): Promise<TMDBResponse<Movie>> => {
    const url = buildDetailUrl(`/movie/${pathId(movieId, "movieId")}/recommendations`);
    return tmdbFetchJson(url, TTL.LONG, options) as Promise<TMDBResponse<Movie>>;
  },

  // Get TV shows recommended for a TV show
  getTVShowRecommendations: async (
    tvId: number,
    options?: TMDBRequestOptions,
  ): Promise<TMDBResponse<TVShow>> => {
    const url = buildDetailUrl(`/tv/${pathId(tvId, "tvId")}/recommendations`);
    return tmdbFetchJson(url, TTL.LONG, options) as Promise<TMDBResponse<TVShow>>;
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
    const url = buildDetailUrl(`/person/${pathId(personId, "personId")}`, {
      append_to_response: "external_ids",
    });
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
