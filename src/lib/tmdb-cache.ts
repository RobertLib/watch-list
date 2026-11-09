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

import { fetchJsonWithRetry } from "./fetch-with-retry";
import type {
  MovieDetails,
  SeasonDetails,
  TVShowDetails,
  WatchProvidersResponse,
} from "@/types/tmdb";

// Re-exported: this module is where it lived, and its callers – and its test –
// still name it here.
export { fetchWithRetry } from "./fetch-with-retry";

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
const waiting: { request: SharedRequest; grant: () => void }[] = [];

function acquireSlot(request: SharedRequest): Promise<void> {
  const { signal } = request.controller;
  signal.throwIfAborted();
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const queued = {
      request,
      grant: () => {
        signal.removeEventListener("abort", abort);
        inFlight += 1;
        resolve();
      },
    };
    const abort = () => {
      const index = waiting.indexOf(queued);
      if (index !== -1) waiting.splice(index, 1);
      reject(signal.reason);
    };
    waiting.push(queued);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function releaseSlot(): void {
  inFlight -= 1;
  // A new page or header search should not sit behind a watching history.
  const foreground = waiting.findIndex(
    (queued) => queued.request.priority === "foreground",
  );
  waiting.splice(foreground === -1 ? 0 : foreground, 1)[0]?.grant();
}

export interface TMDBRequestOptions {
  signal?: AbortSignal;
  priority?: "foreground" | "background";
}

interface SharedRequest {
  value: Promise<unknown>;
  controller: AbortController;
  consumers: Set<object>;
  persistentConsumer: boolean;
  settled: boolean;
  priority: "foreground" | "background";
}

interface CacheEntry {
  expires: number;
  request: SharedRequest;
}

/**
 * The cache keeps two budgets, because it serves two kinds of reader.
 *
 * Interactive reads – listings, detail pages, searches, one card's providers –
 * are what makes going back free. Background loaders read in bulk instead:
 * Tonight two entries per saved title, the statistics page one per watched
 * title, and each walks its list in the same order on every visit. With one
 * shared FIFO of 300 entries, a single such walk flushed every listing and
 * detail page, and a walk longer than the budget evicted, with each write, the
 * very entry its own next visit needed first: a 160-title Tonight paid for all
 * 320 reads on every visit and a 400-title history for all 400.
 *
 * Interactive entries are least-recently-used, and only another interactive
 * entry can push one out. Three hundred covers a long browsing session; the
 * largest of them are detail responses with their appended credits, videos and
 * providers, so this is also what bounds the bulk of the memory.
 */
const MAX_INTERACTIVE_ENTRIES = 300;

/**
 * Background answers get a budget of their own, sized for the walks above.
 *
 * Nothing caps the lists those walks cover – the watchlist and the watched list
 * are read in full, and only a hand-picked backup is held to
 * `MAX_ITEMS_PER_LIST` (2,000 each). Covering that ceiling would mean six
 * thousand responses and more; this covers Tonight over a 500-title watchlist
 * (1,000 reads) alongside a 400-title history and the home rows, which is well
 * past the two hundred titles `MAX_IN_FLIGHT` is pitched at. Each entry is a
 * detail response without appends or one region's providers (see `onlyRegion`
 * below) – kilobytes apiece – so a full budget holds megabytes, not the tens
 * that every country's providers for every saved title would come to.
 *
 * Past the budget a background answer is shared with whoever is waiting on it
 * and then dropped, instead of evicting anything. A walk that does not fit
 * therefore keeps the part of itself that did – the same prefix on every visit,
 * paying only for its tail – where evicting by age or recency would have it
 * evict its own next read and pay for all of it. Bulk entries leave when they
 * expire, or when an interactive read promotes one into the budget above.
 */
const MAX_BULK_ENTRIES = 1500;

// Expired bulk entries are only found by sweeping the map, which is not worth
// repeating for every overflowing write of a walk that has filled the budget.
const BULK_SWEEP_INTERVAL_MS = 60_000;

/** Insertion order is recency: a hit is moved to the end. */
const interactive = new Map<string, CacheEntry>();
const bulk = new Map<string, CacheEntry>();
/** Background answers past the bulk budget: joinable while in flight, then dropped. */
const overflow = new Map<string, CacheEntry>();
let nextBulkSweep = 0;

function putInteractive(url: string, entry: CacheEntry): void {
  bulk.delete(url);
  overflow.delete(url);
  interactive.delete(url);
  interactive.set(url, entry);

  while (interactive.size > MAX_INTERACTIVE_ENTRIES) {
    const oldest = interactive.keys().next();
    if (oldest.done) break;
    interactive.delete(oldest.value);
  }
}

function readCache(
  url: string,
  priority: "foreground" | "background",
): SharedRequest | null {
  const tier = interactive.has(url)
    ? interactive
    : bulk.has(url)
      ? bulk
      : overflow;
  const entry = tier.get(url);
  if (!entry) return null;

  if (entry.expires <= Date.now()) {
    tier.delete(url);
    return null;
  }

  // Only an interactive read counts as use: a background walk passing over a
  // listing must not be what keeps it, and a title the visitor opens should not
  // stay at the mercy of the next walk's overflow.
  if (priority === "foreground") putInteractive(url, entry);

  return entry.request;
}

function writeCache(
  url: string,
  request: SharedRequest,
  ttl: number,
  priority: "foreground" | "background",
): void {
  // Only reached after `readCache` missed, so the key is in none of the maps.
  const now = Date.now();
  const entry = { expires: now + ttl * 1000, request };
  if (priority === "foreground") {
    putInteractive(url, entry);
    return;
  }

  if (bulk.size >= MAX_BULK_ENTRIES && now >= nextBulkSweep) {
    nextBulkSweep = now + BULK_SWEEP_INTERVAL_MS;
    for (const [key, cached] of bulk) {
      if (cached.expires <= now) bulk.delete(key);
    }
  }

  (bulk.size < MAX_BULK_ENTRIES ? bulk : overflow).set(url, entry);
}

/** A late failure or cancellation must not evict a newer request for the URL. */
function forget(url: string, request: SharedRequest): void {
  for (const tier of [interactive, bulk, overflow]) {
    if (tier.get(url)?.request === request) tier.delete(url);
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
export function tmdbFetchJson<T>(
  url: string,
  ttlSeconds = 0,
  options: TMDBRequestOptions = {},
): Promise<T> {
  return cachedFetchJson<T>(url, ttlSeconds, options);
}

/**
 * `select` reduces the parsed body before it is shared or cached. It belongs to
 * the URL rather than to a caller – every reader of that URL gets the reduced
 * body – so only a getter that owns the URL's format may pass one.
 */
function cachedFetchJson<T>(
  url: string,
  ttlSeconds: number,
  options: TMDBRequestOptions,
  select?: (data: unknown) => T,
): Promise<T> {
  if (options.signal?.aborted) return Promise.reject(options.signal.reason);
  const priority = options.priority ?? "foreground";
  if (ttlSeconds > 0) {
    const cached = readCache(url, priority);
    if (cached) return consumeRequest<T>(url, cached, options);
  }

  const request: SharedRequest = {
    value: Promise.resolve(),
    controller: new AbortController(),
    consumers: new Set(),
    persistentConsumer: false,
    settled: false,
    priority,
  };
  request.value = (async () => {
    await acquireSlot(request);

    try {
      request.controller.signal.throwIfAborted();
      const { response, data } = await fetchJsonWithRetry<T>(url, {
        headers: TMDB_CONFIG.headers,
        signal: request.controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `TMDB API error: ${response.status} ${response.statusText} (${url})`,
        );
      }

      return select ? select(data) : (data as T);
    } finally {
      releaseSlot();
    }
  })();

  // Only this request's entry may be dropped: a late failure or cancellation
  // must not evict a newer successful request for the same URL. An answer past
  // the bulk budget has served everyone who joined it while in flight.
  request.value.then(
    () => {
      request.settled = true;
      if (overflow.get(url)?.request === request) overflow.delete(url);
    },
    () => {
      request.settled = true;
      forget(url, request);
    },
  );
  if (ttlSeconds > 0) writeCache(url, request, ttlSeconds, priority);

  return consumeRequest<T>(url, request, options);
}

/** Cancellation belongs to a caller, while a cached request may serve several. */
function consumeRequest<T>(
  url: string,
  request: SharedRequest,
  { signal, priority = "foreground" }: TMDBRequestOptions,
): Promise<T> {
  // A detail requested interactively can reuse a queued background lookup and
  // move it ahead of the remaining background work without a second fetch.
  if (priority === "foreground") request.priority = "foreground";
  if (!signal) {
    request.persistentConsumer = true;
    return request.value as Promise<T>;
  }

  const consumer = {};
  request.consumers.add(consumer);
  return new Promise<T>((resolve, reject) => {
    let active = true;
    const detach = () => {
      active = false;
      request.consumers.delete(consumer);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      detach();
      reject(signal.reason);
      if (!request.settled && !request.persistentConsumer && request.consumers.size === 0) {
        // Remove immediately, so navigating back can start a fresh request
        // rather than joining an aborted one that has not settled yet.
        forget(url, request);
        request.controller.abort(signal.reason);
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    request.value.then(
      (value) => {
        if (!active) return;
        detach();
        resolve(value as T);
      },
      (error) => {
        if (!active) return;
        detach();
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
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

/**
 * Keep only the region a providers URL names.
 *
 * TMDB documents no filter for `/watch/providers`: it answers with every
 * country it lists – often dozens, each with its rent, buy and streaming offers
 * – and the region in these URLs is there for the cache key. Every reader wants
 * the one region its URL names (as `media-converters.ts` picks one out of the
 * appended form), so holding the rest only spent memory: a Tonight walk keeps
 * one of these per saved title, and the budgets above are counted in entries.
 */
function onlyRegion(region: string) {
  return (data: unknown): WatchProvidersResponse => {
    const response = data as WatchProvidersResponse;
    const inRegion = response?.results?.[region];
    return { ...response, results: inRegion ? { [region]: inRegion } : {} };
  };
}

export const getCachedMovieWatchProviders = (
  movieId: number,
  region: string,
  options: TMDBRequestOptions = {},
): Promise<WatchProvidersResponse> => {
  const url = `${TMDB_CONFIG.BASE_URL}/movie/${pathId(
    movieId,
    "movieId",
  )}/watch/providers?region=${regionParam(region)}`;
  return cachedFetchJson(url, TTL.MEDIUM, options, onlyRegion(region));
};

export const getCachedTVWatchProviders = (
  tvId: number,
  region: string,
  options: TMDBRequestOptions = {},
): Promise<WatchProvidersResponse> => {
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${pathId(
    tvId,
    "tvId",
  )}/watch/providers?region=${regionParam(region)}`;
  return cachedFetchJson(url, TTL.MEDIUM, options, onlyRegion(region));
};

// One `append_to_response` name: letters and underscores, with a slash only
// between two such segments – TMDB's own `watch/providers` is the one that has
// one. Stripping the slash used to turn that into "watchproviders", which TMDB
// ignores without an error.
const APPEND_NAME = /^[a-z_]+(?:\/[a-z_]+)*$/i;
// TMDB accepts at most twenty appended responses on one request.
const MAX_APPENDED = 20;
const MAX_APPEND_LENGTH = 100;

/**
 * The names to append, checked one by one. A malformed name is dropped rather
 * than repaired – a repaired name is a different request – and the length bound
 * stops at a whole name instead of cutting one in half.
 */
function appendParam(value: string): string {
  const names: string[] = [];
  let length = 0;

  for (const raw of value.split(",")) {
    const name = raw.trim();
    if (!APPEND_NAME.test(name) || names.includes(name)) continue;

    const nextLength = length + (names.length > 0 ? 1 : 0) + name.length;
    if (names.length >= MAX_APPENDED || nextLength > MAX_APPEND_LENGTH) break;

    names.push(name);
    length = nextLength;
  }

  return names.join(",");
}

/**
 * TV details, cached. These back the "Continue Watching" row and the release
 * calendar, where the same handful of shows is asked for on every page view.
 */
export const getCachedTVShowDetails = (
  tvId: number,
  options?: TMDBRequestOptions,
): Promise<TVShowDetails> => {
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${pathId(tvId, "tvId")}`;
  return tmdbFetchJson<TVShowDetails>(url, TTL.LONG, options);
};

/**
 * Movie details, cached – the counterpart to the TV read above, used by the
 * release calendar to confirm a date the watchlist may have stored months ago.
 */
export const getCachedMovieDetails = (
  movieId: number,
  appendToResponse?: string,
  options?: TMDBRequestOptions,
): Promise<MovieDetails> => {
  const append = appendToResponse ? appendParam(appendToResponse) : "";
  const query = append
    ? `?append_to_response=${encodeURIComponent(append)}`
    : "";

  const url = `${TMDB_CONFIG.BASE_URL}/movie/${pathId(movieId, "movieId")}${query}`;
  return tmdbFetchJson<MovieDetails>(url, TTL.LONG, options);
};

export const getCachedSeasonDetails = (
  tvId: number,
  seasonNumber: number,
  options?: TMDBRequestOptions,
): Promise<SeasonDetails> => {
  // Season 0 exists on TMDB – it holds the specials.
  const url = `${TMDB_CONFIG.BASE_URL}/tv/${pathId(tvId, "tvId")}/season/${pathId(
    seasonNumber,
    "seasonNumber",
    0,
  )}`;
  return tmdbFetchJson<SeasonDetails>(url, TTL.LONG, options);
};

/** Discovery listings. The URL already carries region, platforms and filters. */
export const getCachedDiscoveryRequest = (
  url: string,
  options?: TMDBRequestOptions,
): Promise<unknown> => tmdbFetchJson<unknown>(url, TTL.MEDIUM, options);
