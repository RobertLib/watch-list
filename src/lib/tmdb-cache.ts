// This module holds the TMDB bearer token. Importing it from a Client Component
// is a build error rather than a bundle that quietly ships `Bearer ` with an
// empty token (Next replaces non-NEXT_PUBLIC_ env vars with "" on the client)
// and then answers every request with a 401.
import "server-only";

import type { WatchProvidersResponse } from "@/types/tmdb";

const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "UND_ERR_SOCKET",
]);

/** A dropped socket or a stalled connection is worth another attempt; a 4xx is not. */
function isRetryable(err: unknown): boolean {
  if (err instanceof Error && err.name === "TimeoutError") return true;

  const code =
    (err as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException })?.cause
      ?.code ?? (err as NodeJS.ErrnoException)?.code;
  if (!code) return false;

  return RETRYABLE_CODES.has(code) || code.startsWith("UND_ERR");
}

export async function fetchWithRetry(
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
      if (attempt < retries && isRetryable(err)) {
        await new Promise((res) => setTimeout(res, 200 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  // unreachable, but satisfies TS
  throw new Error("fetchWithRetry: exhausted retries");
}

/**
 * Fetch TMDB and hand back the parsed body, or throw.
 *
 * The status check is the point: a failed TMDB call still answers with JSON, but
 * one shaped `{ success: false, status_message }` rather than the expected
 * payload. Returning that as if it were data pushes the failure downstream,
 * where it surfaces as a `TypeError` on a missing `results` array – or, in the
 * spots that guard against it, as a silently empty section.
 */
export async function tmdbFetchJson<T>(
  url: string,
  options: RequestInit & { next?: NextFetchRequestConfig },
): Promise<T> {
  const response = await fetchWithRetry(url, options);

  if (!response.ok) {
    throw new Error(
      `TMDB API error: ${response.status} ${response.statusText} (${url})`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Missing configuration used to fall back to an empty token, which turned into a
 * 401 on every TMDB call – a failure that reads like an outage rather than like
 * the one-line environment problem it is. A getter rather than a module-level
 * check on purpose: throwing while the module evaluates would take down the
 * build itself, including the parts that never touch TMDB.
 */
function tmdbAuthorizationHeader(): string {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) {
    throw new Error(
      "TMDB_API_TOKEN is not configured – every TMDB request would answer 401.",
    );
  }

  return `Bearer ${token}`;
}

// Shared TMDB API configuration
export const TMDB_CONFIG = {
  BASE_URL: "https://api.themoviedb.org/3",
  get headers() {
    return {
      Authorization: tmdbAuthorizationHeader(),
      "Content-Type": "application/json",
    };
  },
} as const;

// Cache TMDB API calls using native fetch cache with optimized settings
export const getCachedMovieWatchProviders = async (
  movieId: number,
  region: string,
): Promise<WatchProvidersResponse> => {
  const url = `${TMDB_CONFIG.BASE_URL}/movie/${movieId}/watch/providers?region=${region}`;
  return tmdbFetchJson<WatchProvidersResponse>(url, {
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
};

export const getCachedTVWatchProviders = async (
  tvId: number,
  region: string,
): Promise<WatchProvidersResponse> => {
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${tvId}/watch/providers?region=${region}`;
  return tmdbFetchJson<WatchProvidersResponse>(url, {
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
};

// Cached discovery API calls for better performance
export const getCachedDiscoveryRequest = async (
  url: string,
  cacheKey: string,
): Promise<unknown> => {
  return tmdbFetchJson<unknown>(url, {
    headers: TMDB_CONFIG.headers,
    next: {
      revalidate: 7200, // 2 hours for discovery results (reduced API calls)
      tags: ["tmdb", "discovery", cacheKey],
    },
  });
};
