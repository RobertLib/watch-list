import type { WatchProvidersResponse } from "@/types/tmdb";

const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "UND_ERR_SOCKET",
]);

async function fetchWithRetry(
  url: string,
  options: RequestInit & { next?: NextFetchRequestConfig },
  retries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const optionsWithTimeout = {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(10000),
      };
      const response = await fetch(url, optionsWithTimeout);
      return response;
    } catch (err) {
      const code =
        (err as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException })
          ?.cause?.code ?? (err as NodeJS.ErrnoException).code;
      const isAbort = err instanceof Error && err.name === "TimeoutError";
      if (attempt < retries && (isAbort || RETRYABLE_CODES.has(code ?? ""))) {
        await new Promise((res) => setTimeout(res, 200 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  // unreachable, but satisfies TS
  throw new Error("fetchWithRetry: exhausted retries");
}

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
  region: string,
): Promise<WatchProvidersResponse> => {
  const url = `${TMDB_CONFIG.BASE_URL}/movie/${movieId}/watch/providers?region=${region}`;
  const response = await fetchWithRetry(url, {
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
  if (!response.ok) {
    throw new Error(
      `TMDB API error: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
};

export const getCachedTVWatchProviders = async (
  tvId: number,
  region: string,
): Promise<WatchProvidersResponse> => {
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${tvId}/watch/providers?region=${region}`;
  const response = await fetchWithRetry(url, {
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
  if (!response.ok) {
    throw new Error(
      `TMDB API error: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
};

// Cached discovery API calls for better performance
export const getCachedDiscoveryRequest = async (
  url: string,
  cacheKey: string,
): Promise<unknown> => {
  const response = await fetchWithRetry(url, {
    headers: TMDB_CONFIG.headers,
    next: {
      revalidate: 7200, // 2 hours for discovery results (reduced API calls)
      tags: ["tmdb", "discovery", cacheKey],
    },
  });
  if (!response.ok) {
    throw new Error(
      `TMDB API error: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
};
