/**
 * The browser's TMDB transport, and the cache in front of it.
 *
 * Every request in this app is made from the page. There is no server to hold a
 * shared Data Cache any more, so the caching that used to be expressed as
 * `next: { revalidate, tags }` is a plain `Map` here, private to one tab and
 * gone when it closes.
 *
 * It earns its place twice over. It de-duplicates the concurrent bursts a detail
 * page makes – several sections asking for the same title at once share one
 * request rather than racing – and it makes going back to a listing free, since
 * client navigation keeps this module alive while re-running every effect.
 *
 * The read token ships in the bundle. That is a deliberate trade: it is a
 * read-only key for a public catalogue, and hiding it is what a server was for.
 */

import { fetchWithRetry } from "./fetch-with-retry";
import type {
  MovieDetails,
  SeasonDetails,
  TVShowDetails,
  WatchProvidersResponse,
} from "@/types/tmdb";

// Re-exported: this module is where it lived, and its callers – and its test –
// still name it here.
export { fetchWithRetry };

/**
 * Missing configuration used to fall back to an empty token, which turned into a
 * 401 on every TMDB call – a failure that reads like an outage rather than like
 * the one-line environment problem it is. A getter rather than a module-level
 * check on purpose: throwing while the module evaluates would take down the
 * whole bundle, including the parts that never touch TMDB.
 */
function tmdbAuthorizationHeader(): string {
  const token = process.env.NEXT_PUBLIC_TMDB_API_TOKEN;
  if (!token) {
    throw new Error(
      "NEXT_PUBLIC_TMDB_API_TOKEN is not configured – every TMDB request would answer 401.",
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

/** Common cache lifetimes, in seconds, named for what they are about. */
export const TTL = {
  /** Lists that move within a day: trending, now playing, what is airing. */
  SHORT: 3600,
  /** Where to watch something – re-checked a few times a day. */
  MEDIUM: 7200,
  /** Details, credits, images: facts that change on the scale of a release. */
  LONG: 21600,
  /** Genre lists and translations, which are effectively fixed. */
  DAY: 86400,
} as const;

/**
 * How many TMDB requests may be open at once.
 *
 * This did not need to exist while the fan-outs ran on a server – one process
 * making a hundred parallel calls to TMDB is ordinary. From a browser it is not:
 * the connection pool serialises them anyway, and a hundred at once is how a
 * shared read token collects a 429. Eight keeps a watchlist of two hundred
 * titles moving without ever looking like an attack.
 */
const MAX_IN_FLIGHT = 8;

let inFlight = 0;
const waiting: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    waiting.push(() => {
      inFlight += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  inFlight -= 1;
  waiting.shift()?.();
}

interface CacheEntry {
  expires: number;
  value: Promise<unknown>;
}

// Bounded so a long session that browses hundreds of titles cannot grow this
// without limit. Insertion order is iteration order for a Map, so the oldest
// entry is the first one – which is close enough to least-recently-used for a
// cache whose whole purpose is to absorb bursts.
const MAX_ENTRIES = 300;

const cache = new Map<string, CacheEntry>();

function readCache(url: string): Promise<unknown> | null {
  const entry = cache.get(url);
  if (!entry) return null;

  if (entry.expires <= Date.now()) {
    cache.delete(url);
    return null;
  }

  return entry.value;
}

function writeCache(url: string, value: Promise<unknown>, ttl: number): void {
  // No delete-before-set to refresh the key's position, because there is never
  // a position to refresh: this is only reached after `readCache` missed, and a
  // miss means the key was either absent or expired – and `readCache` deletes an
  // expired one on its way out. So insertion order here is already write order.
  cache.set(url, { expires: Date.now() + ttl * 1000, value });

  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/**
 * Fetch TMDB and hand back the parsed body, or throw.
 *
 * The status check is the point: a failed TMDB call still answers with JSON, but
 * one shaped `{ success: false, status_message }` rather than the expected
 * payload. Returning that as if it were data pushes the failure downstream,
 * where it surfaces as a `TypeError` on a missing `results` array – or, in the
 * spots that guard against it, as a silently empty section.
 *
 * `ttlSeconds` of 0 skips the cache in both directions. The full URL is the key,
 * and every parameter that changes the answer – region, chosen platforms, page,
 * filters – is already in it.
 */
export function tmdbFetchJson<T>(url: string, ttlSeconds = 0): Promise<T> {
  if (ttlSeconds > 0) {
    const cached = readCache(url);
    if (cached) return cached as Promise<T>;
  }

  const request = (async () => {
    await acquireSlot();

    try {
      const response = await fetchWithRetry(url, {
        headers: TMDB_CONFIG.headers,
      });

      if (!response.ok) {
        throw new Error(
          `TMDB API error: ${response.status} ${response.statusText} (${url})`,
        );
      }

      return (await response.json()) as T;
    } finally {
      releaseSlot();
    }
  })();

  if (ttlSeconds > 0) {
    // A rejected request must not be what the next caller gets back, or one
    // blip would be cached for the whole TTL. Only this request's own entry is
    // dropped: a slow failure settling after a later attempt has already
    // succeeded would otherwise evict that good entry by URL alone.
    request.catch(() => {
      if (cache.get(url)?.value === request) cache.delete(url);
    });
    writeCache(url, request, ttlSeconds);
  }

  return request;
}

/**
 * Guard for a value interpolated into a TMDB *path* rather than a query string.
 * `URLSearchParams` escapes parameters; a template literal in a path escapes
 * nothing – so an id carrying "/../" would walk the request to a different TMDB
 * endpoint. The ids come from the URL bar, so this is worth keeping even now
 * that the token is public: it is what keeps a crafted link from turning into a
 * request the app never meant to make.
 *
 * Exported because `tmdb.ts` interpolates the same ids into the same kind of
 * path. It used to hold a byte-identical copy, applied to one of its fourteen
 * path-building methods – a guard that is easier to forget than to call.
 */
export function pathId(value: number, name: string, min = 1): string {
  const id = Number(value);
  if (!Number.isInteger(id) || id < min) {
    throw new Error(`Invalid ${name}: ${String(value)}`);
  }

  return String(id);
}

/** Not `encodeURIComponent`: a region that needs escaping is not a region. */
function regionParam(region: string): string {
  if (!/^[A-Z]{2}$/.test(region)) {
    throw new Error(`Invalid region: ${String(region)}`);
  }

  return region;
}

export const getCachedMovieWatchProviders = (
  movieId: number,
  region: string,
): Promise<WatchProvidersResponse> => {
  const url = `${TMDB_CONFIG.BASE_URL}/movie/${pathId(
    movieId,
    "movieId",
  )}/watch/providers?region=${regionParam(region)}`;
  return tmdbFetchJson<WatchProvidersResponse>(url, TTL.MEDIUM);
};

export const getCachedTVWatchProviders = (
  tvId: number,
  region: string,
): Promise<WatchProvidersResponse> => {
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${pathId(
    tvId,
    "tvId",
  )}/watch/providers?region=${regionParam(region)}`;
  return tmdbFetchJson<WatchProvidersResponse>(url, TTL.MEDIUM);
};

/**
 * TV details, cached. These back the "Continue Watching" row and the release
 * calendar, where the same handful of shows is asked for on every page view.
 */
export const getCachedTVShowDetails = (tvId: number): Promise<TVShowDetails> => {
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${pathId(tvId, "tvId")}`;
  return tmdbFetchJson<TVShowDetails>(url, TTL.LONG);
};

/**
 * Movie details, cached – the counterpart to the TV read above, used by the
 * release calendar to confirm a date the watchlist may have stored months ago.
 */
export const getCachedMovieDetails = (
  movieId: number,
  appendToResponse?: string,
): Promise<MovieDetails> => {
  const query = appendToResponse
    ? `?append_to_response=${encodeURIComponent(
        appendToResponse.replace(/[^a-z_,]/gi, "").slice(0, 100),
      )}`
    : "";

  const url = `${TMDB_CONFIG.BASE_URL}/movie/${pathId(movieId, "movieId")}${query}`;
  return tmdbFetchJson<MovieDetails>(url, TTL.LONG);
};

export const getCachedSeasonDetails = (
  tvId: number,
  seasonNumber: number,
): Promise<SeasonDetails> => {
  // Season 0 exists on TMDB – it holds the specials.
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${pathId(tvId, "tvId")}/season/${pathId(
    seasonNumber,
    "seasonNumber",
    0,
  )}`;
  return tmdbFetchJson<SeasonDetails>(url, TTL.LONG);
};

/** Discovery listings. The URL already carries region, platforms and filters. */
export const getCachedDiscoveryRequest = (url: string): Promise<unknown> =>
  tmdbFetchJson<unknown>(url, TTL.MEDIUM);
