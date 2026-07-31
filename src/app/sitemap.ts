import { MetadataRoute } from "next";
import { createSlug } from "@/lib/utils";
import { STREAMING_LANDING_PLATFORMS } from "@/lib/streaming-landing";

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
}

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

function getTmdbHeaders() {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) {
    throw new Error("TMDB_API_TOKEN is not configured");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function fetchTmdb<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${TMDB_BASE_URL}${endpoint}`, {
    headers: getTmdbHeaders(),
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
  ];

  // Fetch each group independently so a single TMDB failure doesn't wipe
  // out all detail pages from the sitemap.
  const settled = await Promise.allSettled([
    getMovieGenres(),
    getTVGenres(),
    getLinkedMovies(),
    getLinkedTVShows(),
    fetchPages<Person>("/person/popular", 1),
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

  const moviePages =
    linkedMoviesResult.status === "fulfilled"
      ? (linkedMoviesResult.value.results ?? []).map((movie: Movie) => ({
          url: `${baseUrl}/movie/${createSlug(movie.title, movie.id)}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.7,
        }))
      : [];

  const tvPages =
    linkedTVShowsResult.status === "fulfilled"
      ? (linkedTVShowsResult.value.results ?? []).map((show: TVShow) => ({
          url: `${baseUrl}/tv/${createSlug(show.name, show.id)}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.7,
        }))
      : [];

  const personPages =
    popularPeopleResult.status === "fulfilled"
      ? (popularPeopleResult.value ?? []).map((person: Person) => ({
          url: `${baseUrl}/person/${createSlug(person.name, person.id)}`,
          lastModified: now,
          changeFrequency: "monthly" as const,
          priority: 0.6,
        }))
      : [];

  // Curated genre x platform landings. Listed unconditionally: whether a given
  // combination has enough titles to be worth indexing depends on the visitor's
  // region, which this build-time sitemap has no access to, so the page itself
  // decides via MIN_RESULTS_TO_INDEX.
  const platformLandingPages = (
    [
      ["movie", movieGenresResult],
      ["tv", tvGenresResult],
    ] as const
  ).flatMap(([type, result]) =>
    result.status === "fulfilled"
      ? (result.value.genres ?? []).flatMap((genre: Genre) =>
          STREAMING_LANDING_PLATFORMS.map((platform) => ({
            url: `${baseUrl}/genres/${type}/${createSlug(genre.name, genre.id)}/${platform.slug}`,
            lastModified: now,
            changeFrequency: "weekly" as const,
            priority: 0.75,
          })),
        )
      : [],
  );

  const collectionPages =
    popularCollectionsResult.status === "fulfilled"
      ? (popularCollectionsResult.value ?? []).map(
          (col: { id: number; name: string }) => ({
            url: `${baseUrl}/collection/${createSlug(col.name, col.id)}`,
            lastModified: now,
            changeFrequency: "monthly" as const,
            priority: 0.65,
          }),
        )
      : [];

  try {
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
  } catch (error) {
    console.error("Error assembling sitemap:", error);
    return staticPages;
  }
}
