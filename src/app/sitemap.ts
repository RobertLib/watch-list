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

async function getPopularMovies() {
  const url = `${TMDB_CONFIG.BASE_URL}/movie/popular`;
  const response = await fetch(url, {
    headers: TMDB_CONFIG.headers,
    next: { revalidate: 86400 }, // Cache for 24 hours
  });
  return response.json();
}

async function getPopularTVShows() {
  const url = `${TMDB_CONFIG.BASE_URL}/tv/popular`;
  const response = await fetch(url, {
    headers: TMDB_CONFIG.headers,
    next: { revalidate: 86400 }, // Cache for 24 hours
  });
  return response.json();
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

    // Get popular movies and TV shows for sitemap
    const [popularMovies, popularTVShows] = await Promise.all([
      getPopularMovies(),
      getPopularTVShows(),
    ]);

    // Popular movie pages
    const moviePages = popularMovies.results
      .slice(0, 50)
      .map((movie: Movie) => ({
        url: `${baseUrl}/movie/${createSlug(movie.title, movie.id)}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));

    // Popular TV show pages
    const tvPages = popularTVShows.results.slice(0, 50).map((show: TVShow) => ({
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
