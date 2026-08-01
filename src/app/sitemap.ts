import { MetadataRoute } from "next";
import { createSlug } from "@/lib/utils";
import { TMDB_CONFIG } from "@/lib/tmdb-cache";
import {
  MIN_RESULTS_TO_INDEX,
  STREAMING_LANDING_PLATFORMS,
  type StreamingPlatform,
} from "@/lib/streaming-landing";
import { MOODS } from "@/lib/moods";

// The region a visitor gets when they have no cookie yet (DEFAULT_REGION in
// region-server.ts). A build-time sitemap has no cookies, so every count below is
// measured against this one region.
const SITEMAP_REGION = "US";

// Types for sitemap generation
interface Genre {
  id: number;
  name: string;
}

interface Movie {
  id: number;
  title: string;
}

interface TVShow {
  id: number;
  name: string;
}

interface TrendingItem {
  id: number;
  media_type: "movie" | "tv";
  title?: string;
  name?: string;
}

interface Person {
  id: number;
  name: string;
  profile_path?: string | null;
  known_for?: { vote_count?: number }[];
}

/**
 * Whether a popular-people entry is worth submitting.
 *
 * `/person/popular` returns whoever is trending today, which includes profiles with
 * no photo whose only credits are unrated bit parts – thin pages that the person
 * route answers with `noindex`, and submitting a noindex URL is a Search Console
 * error. This approximates that route's own bar (a few credits at
 * vote_count >= 50) from the list payload, which carries up to three `known_for`
 * titles and their vote counts, without a request per person.
 */
function isSubmittablePerson(person: Person): boolean {
  if (!person.profile_path) return false;

  const notable = (person.known_for ?? []).filter(
    (title) => (title.vote_count ?? 0) >= 50,
  ).length;

  return notable >= 2;
}

async function fetchTmdb<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${TMDB_CONFIG.BASE_URL}${endpoint}`, {
    headers: TMDB_CONFIG.headers,
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    throw new Error(
      `TMDB sitemap fetch failed for ${endpoint}: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

// Simple TMDB API functions for sitemap (without region/cookies dependency)
async function getMovieGenres() {
  return fetchTmdb<{ genres: Genre[] }>("/genre/movie/list");
}

async function getTVGenres() {
  return fetchTmdb<{ genres: Genre[] }>("/genre/tv/list");
}

// Fetch multiple pages from a TMDB paginated endpoint
async function fetchPages<T>(endpoint: string, pages: number): Promise<T[]> {
  const requests = Array.from({ length: pages }, (_, i) =>
    fetchTmdb<{ results?: T[] }>(`${endpoint}?page=${i + 1}`),
  );
  const results = await Promise.all(requests);
  return results.flatMap((r) => r.results || []);
}

/**
 * Run `fn` over `items` a few at a time.
 *
 * The genre x platform grid below is 245 requests. `Promise.all` over all of them
 * at once is what trips TMDB's rate limit, and a plain sequential loop would take
 * a minute; a small pool is the middle ground.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

function isoDay(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * How many titles a genre x platform landing would list, for the default region.
 *
 * The query mirrors `tmdbServerApi.discoverMoviesByGenre` /
 * `discoverTVShowsByGenre` as the landing page calls them, date bounds included –
 * a count taken from a different query would decide indexability for a page that
 * shows something else. On failure it answers `Infinity`, so a TMDB hiccup leaves
 * the URL in the sitemap rather than silently dropping a real landing page.
 */
async function countGenreOnPlatform(
  type: "movie" | "tv",
  genreId: number,
  platform: StreamingPlatform,
): Promise<number> {
  const today = new Date();
  const params = new URLSearchParams({
    page: "1",
    sort_by: "popularity.desc",
    with_genres: String(genreId),
    with_watch_providers: String(platform.id),
    watch_region: SITEMAP_REGION,
    region: SITEMAP_REGION,
  });

  if (type === "movie") {
    params.set("primary_release_date.lte", isoDay(today));
  } else {
    params.set(
      "first_air_date.gte",
      isoDay(new Date(today.getTime() - 10 * 365 * 24 * 60 * 60 * 1000)),
    );
    params.set("first_air_date.lte", isoDay(today));
  }

  try {
    const data = await fetchTmdb<{ total_results?: number }>(
      `/discover/${type}?${params.toString()}`,
    );
    return data.total_results ?? 0;
  } catch (error) {
    console.error(
      `Sitemap: count failed for ${type} genre ${genreId} on ${platform.slug}:`,
      error,
    );
    return Infinity;
  }
}

// Fetch details for top popular movies and extract unique collections
async function getPopularCollections() {
  try {
    const popularMovies = await fetchPages<Movie>("/movie/popular", 3); // top 60 movies

    const detailResults = await Promise.allSettled(
      popularMovies.map((movie: { id: number }) =>
        fetchTmdb<{ belongs_to_collection?: { id: number } | null }>(
          `/movie/${movie.id}`,
        ),
      ),
    );

    const collectionIds = new Set<number>();
    for (const result of detailResults) {
      if (
        result.status === "fulfilled" &&
        result.value?.belongs_to_collection
      ) {
        collectionIds.add(result.value.belongs_to_collection.id);
      }
    }

    // Fetch the actual collection endpoint so the name matches exactly what
    // the collection page uses for its canonical URL (avoids sitemap mismatches).
    const collectionResults = await Promise.allSettled(
      Array.from(collectionIds).map((id) =>
        fetchTmdb<{ id?: number; name?: string }>(`/collection/${id}`),
      ),
    );

    const collections: { id: number; name: string }[] = [];
    for (const result of collectionResults) {
      if (
        result.status === "fulfilled" &&
        result.value?.id &&
        result.value?.name
      ) {
        collections.push({ id: result.value.id, name: result.value.name });
      }
    }

    return collections;
  } catch (error) {
    console.error("Error fetching popular collections:", error);
    return [];
  }
}

// Fetch movies that are actually linked in the app (from homepage and /movies page)
async function getLinkedMovies() {
  try {
    const [trending, nowPlaying, upcoming, popularPages, topRatedPages] =
      await Promise.all([
        fetchTmdb<{ results?: TrendingItem[] }>("/trending/all/week"),
        fetchTmdb<{ results?: Movie[] }>("/movie/now_playing"),
        fetchTmdb<{ results?: Movie[] }>("/movie/upcoming"),
        fetchPages<Movie>("/movie/popular", 10),
        fetchPages<Movie>("/movie/top_rated", 10),
      ]);

    const trendingMovies = (trending.results || [])
      .filter((item: TrendingItem) => item.media_type === "movie")
      .map((item) => ({
        id: item.id,
        title: item.title ?? item.name ?? `movie-${item.id}`,
      }));
    const allMovies = [
      ...trendingMovies,
      ...(nowPlaying.results || []),
      ...(upcoming.results || []),
      ...popularPages,
      ...topRatedPages,
    ];

    const uniqueMovies = Array.from(
      new Map(allMovies.map((movie) => [movie.id, movie])).values(),
    );

    return { results: uniqueMovies };
  } catch (error) {
    console.error("Error fetching linked movies:", error);
    return { results: [] };
  }
}

// Fetch TV shows that are actually linked in the app (from homepage and /tv-shows page)
async function getLinkedTVShows() {
  try {
    const [trending, airingToday, onTheAir, popularPages, topRatedPages] =
      await Promise.all([
        fetchTmdb<{ results?: TrendingItem[] }>("/trending/all/week"),
        fetchTmdb<{ results?: TVShow[] }>("/tv/airing_today"),
        fetchTmdb<{ results?: TVShow[] }>("/tv/on_the_air"),
        fetchPages<TVShow>("/tv/popular", 10),
        fetchPages<TVShow>("/tv/top_rated", 10),
      ]);

    const trendingTV = (trending.results || [])
      .filter((item: TrendingItem) => item.media_type === "tv")
      .map((item) => ({
        id: item.id,
        name: item.name ?? item.title ?? `tv-${item.id}`,
      }));
    const allShows = [
      ...trendingTV,
      ...(airingToday.results || []),
      ...(onTheAir.results || []),
      ...popularPages,
      ...topRatedPages,
    ];

    const uniqueShows = Array.from(
      new Map(allShows.map((show) => [show.id, show])).values(),
    );

    return { results: uniqueShows };
  } catch (error) {
    console.error("Error fetching linked TV shows:", error);
    return { results: [] };
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.watch-list.me";
  const now = new Date();

  // Static pages
  const staticPages = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/movies`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tv-shows`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/genres`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/people`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    },
    // The pages that answer "what should I watch" rather than "what exists" –
    // the phrasing people actually search for, and the reason they come back.
    {
      url: `${baseUrl}/tonight`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/mood`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/match`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
    {
      url: `${baseUrl}/daily`,
      lastModified: now,
      // A new puzzle every day at midnight UTC, so this is literal.
      changeFrequency: "daily" as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/daily/archive`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/daily/higher-lower`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
    // One page per mood, all known at build time.
    ...MOODS.map((mood) => ({
      url: `${baseUrl}/mood/${mood.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];

  // Fetch each group independently so a single TMDB failure doesn't wipe
  // out all detail pages from the sitemap.
  const settled = await Promise.allSettled([
    getMovieGenres(),
    getTVGenres(),
    getLinkedMovies(),
    getLinkedTVShows(),
    fetchPages<Person>("/person/popular", 5),
    getPopularCollections(),
  ]);

  const [
    movieGenresResult,
    tvGenresResult,
    linkedMoviesResult,
    linkedTVShowsResult,
    popularPeopleResult,
    popularCollectionsResult,
  ] = settled;

  // Log any partial failures so they're visible in deployment logs.
  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`Sitemap fetch [${i}] failed:`, result.reason);
    }
  });

  const movieGenrePages =
    movieGenresResult.status === "fulfilled"
      ? (movieGenresResult.value.genres ?? []).map((genre: Genre) => ({
          url: `${baseUrl}/genres/movie/${createSlug(genre.name, genre.id)}`,
          lastModified: now,
          changeFrequency: "daily" as const,
          priority: 0.7,
        }))
      : [];

  const tvGenrePages =
    tvGenresResult.status === "fulfilled"
      ? (tvGenresResult.value.genres ?? []).map((genre: Genre) => ({
          url: `${baseUrl}/genres/tv/${createSlug(genre.name, genre.id)}`,
          lastModified: now,
          changeFrequency: "daily" as const,
          priority: 0.7,
        }))
      : [];

  // No `lastModified` on the detail groups below. The only value this file could
  // put there is its own generation time, which – identical across every URL and
  // moving every day – tells a crawler nothing it does not already know and
  // teaches it to distrust the field. The listing pages above are different: they
  // really are rebuilt from trending data daily.
  const moviePages =
    linkedMoviesResult.status === "fulfilled"
      ? (linkedMoviesResult.value.results ?? []).map((movie: Movie) => ({
          url: `${baseUrl}/movie/${createSlug(movie.title, movie.id)}`,
          changeFrequency: "weekly" as const,
          priority: 0.7,
        }))
      : [];

  const tvPages =
    linkedTVShowsResult.status === "fulfilled"
      ? (linkedTVShowsResult.value.results ?? []).map((show: TVShow) => ({
          url: `${baseUrl}/tv/${createSlug(show.name, show.id)}`,
          changeFrequency: "weekly" as const,
          priority: 0.7,
        }))
      : [];

  // Five pages of popular people rather than one, minus the thin profiles – see
  // `isSubmittablePerson`. The de-duplication matters because the five pages are
  // fetched from a list that reorders as it is read.
  const personPages =
    popularPeopleResult.status === "fulfilled"
      ? Array.from(
          new Map(
            (popularPeopleResult.value ?? [])
              .filter(isSubmittablePerson)
              .map((person: Person) => [person.id, person]),
          ).values(),
        ).map((person: Person) => ({
          url: `${baseUrl}/person/${createSlug(person.name, person.id)}`,
          changeFrequency: "monthly" as const,
          priority: 0.6,
        }))
      : [];

  // Curated genre x platform landings. A combination too thin to index is one the
  // page itself answers with `noindex` (MIN_RESULTS_TO_INDEX), and submitting a
  // noindex URL is a Search Console error, so the count is checked here too rather
  // than listing the whole grid and hoping. The check is per default region; a
  // visitor elsewhere can still see a thin listing, and the page still handles it.
  const landingCandidates = (
    [
      ["movie", movieGenresResult],
      ["tv", tvGenresResult],
    ] as const
  ).flatMap(([type, result]) =>
    result.status === "fulfilled"
      ? (result.value.genres ?? []).flatMap((genre: Genre) =>
          STREAMING_LANDING_PLATFORMS.map((platform) => ({
            type,
            genre,
            platform,
          })),
        )
      : [],
  );

  const landingCounts = await mapWithConcurrency(
    landingCandidates,
    8,
    (candidate) =>
      countGenreOnPlatform(
        candidate.type,
        candidate.genre.id,
        candidate.platform,
      ),
  );

  const platformLandingPages = landingCandidates
    .filter((_, index) => landingCounts[index] >= MIN_RESULTS_TO_INDEX)
    .map(({ type, genre, platform }) => ({
      url: `${baseUrl}/genres/${type}/${createSlug(genre.name, genre.id)}/${platform.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.75,
    }));

  const droppedLandings =
    landingCandidates.length - platformLandingPages.length;
  if (droppedLandings > 0) {
    console.info(
      `Sitemap: ${droppedLandings} of ${landingCandidates.length} genre x platform landings left out (under ${MIN_RESULTS_TO_INDEX} titles in ${SITEMAP_REGION}).`,
    );
  }

  const collectionPages =
    popularCollectionsResult.status === "fulfilled"
      ? (popularCollectionsResult.value ?? []).map(
          (col: { id: number; name: string }) => ({
            url: `${baseUrl}/collection/${createSlug(col.name, col.id)}`,
            changeFrequency: "monthly" as const,
            priority: 0.65,
          }),
        )
      : [];

  // Every group above already degrades to [] on failure, so assembling the list
  // cannot throw and needs no guard of its own.
  return [
    ...staticPages,
    ...movieGenrePages,
    ...tvGenrePages,
    ...platformLandingPages,
    ...moviePages,
    ...tvPages,
    ...personPages,
    ...collectionPages,
  ];
}
