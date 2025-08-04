import { MetadataRoute } from "next";
import { createSlug } from "@/lib/utils";

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

// Server-side TMDB config for sitemap generation (no cookies)
const TMDB_CONFIG = {
  BASE_URL: "https://api.themoviedb.org/3",
  headers: {
    Authorization: `Bearer ${process.env.TMDB_API_TOKEN}`,
    "Content-Type": "application/json",
  },
};

// Simple TMDB API functions for sitemap (without region/cookies dependency)
async function getMovieGenres() {
  const url = `${TMDB_CONFIG.BASE_URL}/genre/movie/list`;
  const response = await fetch(url, {
    headers: TMDB_CONFIG.headers,
    next: { revalidate: 86400 }, // Cache for 24 hours
  });
  return response.json();
}

async function getTVGenres() {
  const url = `${TMDB_CONFIG.BASE_URL}/genre/tv/list`;
  const response = await fetch(url, {
    headers: TMDB_CONFIG.headers,
    next: { revalidate: 86400 }, // Cache for 24 hours
  });
  return response.json();
}

// Fetch movies that are actually linked in the app (from homepage and /movies page)
async function getLinkedMovies() {
  try {
    const [trending, nowPlaying, popular, topRated] = await Promise.all([
      fetch(`${TMDB_CONFIG.BASE_URL}/trending/all/week`, {
        headers: TMDB_CONFIG.headers,
        next: { revalidate: 86400 },
      }).then((res) => res.json()),
      fetch(`${TMDB_CONFIG.BASE_URL}/movie/now_playing`, {
        headers: TMDB_CONFIG.headers,
        next: { revalidate: 86400 },
      }).then((res) => res.json()),
      fetch(`${TMDB_CONFIG.BASE_URL}/movie/popular`, {
        headers: TMDB_CONFIG.headers,
        next: { revalidate: 86400 },
      }).then((res) => res.json()),
      fetch(`${TMDB_CONFIG.BASE_URL}/movie/top_rated`, {
        headers: TMDB_CONFIG.headers,
        next: { revalidate: 86400 },
      }).then((res) => res.json()),
    ]);

    // Combine all movies and filter out duplicates
    const trendingMovies = (trending.results || []).filter(
      (item: TrendingItem) => item.media_type === "movie",
    );
    const allMovies = [
      ...trendingMovies,
      ...(nowPlaying.results || []),
      ...(popular.results || []),
      ...(topRated.results || []),
    ];

    // Remove duplicates based on ID
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
    const [trending, popular, topRated, airingToday] = await Promise.all([
      fetch(`${TMDB_CONFIG.BASE_URL}/trending/all/week`, {
        headers: TMDB_CONFIG.headers,
        next: { revalidate: 86400 },
      }).then((res) => res.json()),
      fetch(`${TMDB_CONFIG.BASE_URL}/tv/popular`, {
        headers: TMDB_CONFIG.headers,
        next: { revalidate: 86400 },
      }).then((res) => res.json()),
      fetch(`${TMDB_CONFIG.BASE_URL}/tv/top_rated`, {
        headers: TMDB_CONFIG.headers,
        next: { revalidate: 86400 },
      }).then((res) => res.json()),
      fetch(`${TMDB_CONFIG.BASE_URL}/tv/airing_today`, {
        headers: TMDB_CONFIG.headers,
        next: { revalidate: 86400 },
      }).then((res) => res.json()),
    ]);

    // Combine all TV shows and filter out duplicates
    const trendingTV = (trending.results || []).filter(
      (item: TrendingItem) => item.media_type === "tv",
    );
    const allShows = [
      ...trendingTV,
      ...(popular.results || []),
      ...(topRated.results || []),
      ...(airingToday.results || []),
    ];

    // Remove duplicates based on ID
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

  // Static pages
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/movies`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tv-shows`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/genres`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    },
  ];

  try {
    // Get genres for dynamic pages
    const [movieGenres, tvGenres] = await Promise.all([
      getMovieGenres(),
      getTVGenres(),
    ]);

    // Movie genre pages
    const movieGenrePages = movieGenres.genres.map((genre: Genre) => ({
      url: `${baseUrl}/genres/movie/${createSlug(genre.name, genre.id)}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));

    // TV show genre pages
    const tvGenrePages = tvGenres.genres.map((genre: Genre) => ({
      url: `${baseUrl}/genres/tv/${createSlug(genre.name, genre.id)}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));

    // Get movies and TV shows that are actually linked in the app
    const [linkedMovies, linkedTVShows] = await Promise.all([
      getLinkedMovies(),
      getLinkedTVShows(),
    ]);

    // Movie pages (only those linked from homepage carousels and /movies page)
    const moviePages = linkedMovies.results.map((movie: Movie) => ({
      url: `${baseUrl}/movie/${createSlug(movie.title, movie.id)}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    // TV show pages (only those linked from homepage carousels and /tv-shows page)
    const tvPages = linkedTVShows.results.map((show: TVShow) => ({
      url: `${baseUrl}/tv/${createSlug(show.name, show.id)}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    return [
      ...staticPages,
      ...movieGenrePages,
      ...tvGenrePages,
      ...moviePages,
      ...tvPages,
    ];
  } catch (error) {
    console.error("Error generating sitemap:", error);
    // Return at least static pages on error
    return staticPages;
  }
}
