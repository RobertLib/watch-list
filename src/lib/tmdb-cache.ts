import { unstable_cache } from "next/cache";
import type { WatchProvidersResponse } from "@/types/tmdb";

const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_TOKEN || "";
const BASE_URL = "https://api.themoviedb.org/3";

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// Cache TMDB API calls for 1 hour
export const getCachedMovieWatchProviders = unstable_cache(
  async (movieId: number, region: string): Promise<WatchProvidersResponse> => {
    const url = `${BASE_URL}/movie/${movieId}/watch/providers?region=${region}`;
    const response = await fetch(url, { headers });
    return response.json();
  },
  ["movie-watch-providers"],
  {
    revalidate: 3600, // 1 hour
    tags: ["tmdb", "watch-providers"],
  }
);

export const getCachedTVWatchProviders = unstable_cache(
  async (tvId: number, region: string): Promise<WatchProvidersResponse> => {
    const url = `${BASE_URL}/tv/${tvId}/watch/providers?region=${region}`;
    const response = await fetch(url, { headers });
    return response.json();
  },
  ["tv-watch-providers"],
  {
    revalidate: 3600,
    tags: ["tmdb", "watch-providers"],
  }
);

export const getCachedTrendingData = unstable_cache(
  async (mediaType: "all" | "movie" | "tv", timeWindow: "day" | "week") => {
    const url = `${BASE_URL}/trending/${mediaType}/${timeWindow}`;
    const response = await fetch(url, { headers });
    return response.json();
  },
  ["trending-data"],
  {
    revalidate: 1800, // 30 minutes for trending
    tags: ["tmdb", "trending"],
  }
);
