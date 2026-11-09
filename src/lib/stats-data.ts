// The TMDB reads behind the stats page, kept apart from the pure scoring in
// `stats.ts`.
//
// The split used to be a boundary as well as a separation: this half was
// `server-only`, so importing it from a Client Component was a build error and
// the bearer token could not reach the bundle. Neither survives the static
// export – `api.ts` imports this, every page importing `api.ts` is a Client
// Component, and `NEXT_PUBLIC_TMDB_API_TOKEN` ships in the bundle by design.
// What the split still buys is that `stats.ts` is pure functions over dates and
// runtimes, tested without a network.

import { getCachedMovieDetails, getCachedTVShowDetails } from "./tmdb-cache";
import { mediaItemKey } from "./utils";
import type { TitleFacts } from "./stats";
import type { MediaType } from "@/types/tmdb";

/**
 * Runtime, genre and year for everything the visitor has watched.
 *
 * None of it is stored locally: the watched list keeps what a card needs to
 * render, and a runtime is not that. All three come from cached detail reads:
 * the first visit costs one per title, and a return within the details' six
 * hours costs nothing for a history that fits the transport's background budget
 * (`MAX_BULK_ENTRIES` in `tmdb-cache.ts`). A longer one keeps the same leading
 * part of the history cached and pays again only for the rest.
 */

interface FactRef {
  id: number;
  mediaType: MediaType;
}

/** Available facts survive a failed enrichment and can still power the totals. */
export class TitleFactsLoadError extends Error {
  constructor(
    readonly facts: Record<string, TitleFacts>,
    readonly failedKeys: string[],
  ) {
    super(`Could not load details for ${failedKeys.length} watched titles`);
    this.name = "TitleFactsLoadError";
  }
}

interface FactsBatch {
  facts: Record<string, TitleFacts>;
  failedKeys: string[];
}

function isMissingTitle(error: unknown): boolean {
  return error instanceof Error && /^TMDB API error: 404\b/.test(error.message);
}

// Bound each batch of queued reads, rather than truncating a watching history.
// Callers resolving a small selection can retain the same limit when sanitizing.
const MAX_FACTS = 200;

export function sanitizeFactRefs(input: unknown, maxRefs = MAX_FACTS): FactRef[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const refs: FactRef[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;

    const { id, mediaType } = entry as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) continue;
    if (mediaType !== "movie" && mediaType !== "tv") continue;

    const key = mediaItemKey(id, mediaType);
    if (seen.has(key)) continue;

    seen.add(key);
    refs.push({ id, mediaType });

    if (refs.length >= maxRefs) break;
  }

  return refs;
}

/** TMDB can use zero for an unknown length; only a positive duration counts. */
function knownRuntime(runtime: unknown): number | null {
  return typeof runtime === "number" && Number.isFinite(runtime) && runtime > 0
    ? runtime
    : null;
}

/** TMDB gives a list when a show's format changed; the first is the usual one. */
function episodeRuntime(runtimes: number[] | undefined): number | null {
  return knownRuntime(runtimes?.[0]);
}

export async function getTitleFacts(
  refs: FactRef[],
  signal?: AbortSignal,
): Promise<Record<string, TitleFacts>> {
  const facts: Record<string, TitleFacts> = {};
  const failedKeys: string[] = [];

  // A long history still contributes every title to the totals. The transport
  // limits network concurrency; batching also bounds its queued requests.
  for (let start = 0; start < refs.length; start += MAX_FACTS) {
    signal?.throwIfAborted();
    const batch = await getTitleFactsBatch(refs.slice(start, start + MAX_FACTS), signal);
    signal?.throwIfAborted();
    Object.assign(facts, batch.facts);
    failedKeys.push(...batch.failedKeys);
  }

  if (failedKeys.length > 0) throw new TitleFactsLoadError(facts, failedKeys);

  return facts;
}

async function getTitleFactsBatch(
  refs: FactRef[],
  signal?: AbortSignal,
): Promise<FactsBatch> {
  if (refs.length === 0) return { facts: {}, failedKeys: [] };

  const movieRefs = refs.filter((ref) => ref.mediaType === "movie");
  const showRefs = refs.filter((ref) => ref.mediaType === "tv");
  const options = { signal, priority: "background" as const };

  const [movieResults, showResults] = await Promise.all([
    Promise.allSettled(movieRefs.map((ref) => getCachedMovieDetails(ref.id, undefined, options))),
    Promise.allSettled(showRefs.map((ref) => getCachedTVShowDetails(ref.id, options))),
  ]);

  const facts: Record<string, TitleFacts> = {};
  const failedKeys: string[] = [];

  movieResults.forEach((result, index) => {
    // A title TMDB no longer knows is left out of the map, which the summary
    // reads as "runtime unknown" rather than as zero minutes.
    const { id } = movieRefs[index];
    if (result.status !== "fulfilled") {
      if (!isMissingTitle(result.reason)) failedKeys.push(mediaItemKey(id, "movie"));
      return;
    }

    const details = result.value;

    facts[mediaItemKey(id, "movie")] = {
      id,
      mediaType: "movie",
      runtime: knownRuntime(details.runtime),
      genres: (details.genres ?? []).map((genre) => genre.name),
      year: details.release_date?.slice(0, 4) || null,
    };
  });

  showResults.forEach((result, index) => {
    const { id } = showRefs[index];
    if (result.status !== "fulfilled") {
      if (!isMissingTitle(result.reason)) failedKeys.push(mediaItemKey(id, "tv"));
      return;
    }

    const details = result.value;

    facts[mediaItemKey(id, "tv")] = {
      id,
      mediaType: "tv",
      runtime: episodeRuntime(details.episode_run_time),
      genres: (details.genres ?? []).map((genre) => genre.name),
      year: details.first_air_date?.slice(0, 4) || null,
    };
  });

  return { facts, failedKeys };
}
