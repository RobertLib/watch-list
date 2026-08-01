// This module holds the TMDB bearer token. Importing it from a Client Component
// is a build error rather than a bundle that quietly ships `Bearer ` with an
// empty token (Next replaces non-NEXT_PUBLIC_ env vars with "" on the client)
// and then answers every request with a 401.
import "server-only";

import type {
  MovieDetails,
  SeasonDetails,
  TVShowDetails,
  WatchProvidersResponse,
} from "@/types/tmdb";

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

/**
 * Guard for a value interpolated into a TMDB *path* rather than a query string.
 * `URLSearchParams` escapes parameters; a template literal in a path escapes
 * nothing – so an id carrying "/../" would walk the request to a different TMDB
 * endpoint with our bearer token attached.
 */
function pathId(value: number, name: string, min = 1): string {
  const id = Number(value);
  if (!Number.isInteger(id) || id < min) {
    throw new Error(`Invalid ${name}: ${String(value)}`);
  }

  return String(id);
}

/**
 * The same guard for a region, which reaches a TMDB query string *and* a cache
 * tag. Callers pass `getRegionCode()` output, which is already a validated ISO
 * code – this is the backstop for the one that eventually forgets, and it keeps
 * an unbounded set of tag values (an unbounded set of cache entries) out of
 * reach. Not `encodeURIComponent`: a region that needs escaping is not a region.
 */
function regionParam(region: string): string {
  if (!/^[A-Z]{2}$/.test(region)) {
    throw new Error(`Invalid region: ${String(region)}`);
  }

  return region;
}

// Cache TMDB API calls using native fetch cache with optimized settings
export const getCachedMovieWatchProviders = async (
  movieId: number,
  region: string,
): Promise<WatchProvidersResponse> => {
  const url = `${TMDB_CONFIG.BASE_URL}/movie/${pathId(
    movieId,
    "movieId",
  )}/watch/providers?region=${regionParam(region)}`;
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
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${pathId(
    tvId,
    "tvId",
  )}/watch/providers?region=${regionParam(region)}`;
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

/**
 * TV details, cached – unlike `tmdbApi.getTVShowDetails`, which is `no-store`
 * because a detail page is rendered once per visit. These reads back the
 * "Continue Watching" row and the release calendar, where the same handful of
 * shows is asked for on every single page view.
 */
export const getCachedTVShowDetails = async (
  tvId: number,
): Promise<TVShowDetails> => {
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${pathId(tvId, "tvId")}`;
  return tmdbFetchJson<TVShowDetails>(url, {
    headers: TMDB_CONFIG.headers,
    next: {
      // Six hours: long enough to collapse repeat visits, short enough that an
      // episode airing today shows up the same day.
      revalidate: 21600,
      tags: ["tmdb", "tv-details", `tv-${tvId}`],
    },
  });
};

/**
 * Movie details, cached – the counterpart to the TV read above, used by the
 * release calendar to confirm a date the watchlist may have stored months ago.
 */
export const getCachedMovieDetails = async (
  movieId: number,
  appendToResponse?: string,
): Promise<MovieDetails> => {
  const query = appendToResponse
    ? // Bounded and filtered: it reaches the TMDB query string and the cache tag,
      // and an unbounded set of tag values is an unbounded set of cache entries.
      `?append_to_response=${encodeURIComponent(
        appendToResponse.replace(/[^a-z_,]/gi, "").slice(0, 100),
      )}`
    : "";

  const url = `${TMDB_CONFIG.BASE_URL}/movie/${pathId(movieId, "movieId")}${query}`;
  return tmdbFetchJson<MovieDetails>(url, {
    headers: TMDB_CONFIG.headers,
    next: {
      revalidate: 21600,
      tags: [
        "tmdb",
        "movie-details",
        // The appended sections change the payload, so they have to change the
        // tag as well or one shape would be served for the other.
        appendToResponse ? `movie-${movieId}-${query}` : `movie-${movieId}`,
      ],
    },
  });
};

export const getCachedSeasonDetails = async (
  tvId: number,
  seasonNumber: number,
): Promise<SeasonDetails> => {
  // Season 0 exists on TMDB – it holds the specials.
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${pathId(tvId, "tvId")}/season/${pathId(
    seasonNumber,
    "seasonNumber",
    0,
  )}`;
  return tmdbFetchJson<SeasonDetails>(url, {
    headers: TMDB_CONFIG.headers,
    next: {
      revalidate: 21600,
      tags: ["tmdb", "season-details", `tv-${tvId}-season-${seasonNumber}`],
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
