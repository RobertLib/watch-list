import type { WatchProvidersResponse } from "@/types/tmdb";

// Shared TMDB API configuration
export const TMDB_CONFIG = {
  API_KEY: process.env.TMDB_API_TOKEN || "",
  BASE_URL: "https://api.themoviedb.org/3",
  headers: {
    Authorization: `Bearer ${process.env.TMDB_API_TOKEN || ""}`,
    "Content-Type": "application/json",
  },
} as const;

// Cache TMDB API calls using native fetch cache with optimized settings
export const getCachedMovieWatchProviders = async (
  movieId: number,
  region: string
): Promise<WatchProvidersResponse> => {
  const url = `${TMDB_CONFIG.BASE_URL}/movie/${movieId}/watch/providers?region=${region}`;
  const response = await fetch(url, {
    headers: TMDB_CONFIG.headers,
    next: {
      revalidate: 7200, // 2 hours - watch providers change less frequently
      tags: [
        "tmdb",
        "watch-providers",
        `movie-${movieId}-${region}`,
        `region-${region}`,
      ],
    },
  });
  return response.json();
};

export const getCachedTVWatchProviders = async (
  tvId: number,
  region: string
): Promise<WatchProvidersResponse> => {
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${tvId}/watch/providers?region=${region}`;
  const response = await fetch(url, {
    headers: TMDB_CONFIG.headers,
    next: {
      revalidate: 7200, // 2 hours - watch providers change less frequently
      tags: [
        "tmdb",
        "watch-providers",
        `tv-${tvId}-${region}`,
        `region-${region}`,
      ],
    },
  });
  return response.json();
};

// Cached discovery API calls for better performance
export const getCachedDiscoveryRequest = async (
  url: string,
  cacheKey: string
): Promise<unknown> => {
  const response = await fetch(url, {
    headers: TMDB_CONFIG.headers,
    next: {
      revalidate: 7200, // 2 hours for discovery results (reduced API calls)
      tags: ["tmdb", "discovery", cacheKey],
    },
  });
  return response.json();
};
