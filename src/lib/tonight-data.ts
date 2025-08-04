// The TMDB reads behind the "what tonight" shortlist, kept apart from the pure
// scoring in `tonight.ts`.
//
// The split used to be a boundary as well as a separation: this half was
// `server-only`, so importing it from a Client Component was a build error and
// the bearer token could not reach the bundle. Neither survives the static
// export – `api.ts` imports this, every page importing `api.ts` is a Client
// Component, and `NEXT_PUBLIC_TMDB_API_TOKEN` ships in the bundle by design.
// What it still buys is that `tonight.ts` is pure scoring, tested without a
// network.

import { getCachedMovieDetails, getCachedTVShowDetails } from "./tmdb-cache";
import { getWatchlistAvailability } from "./watchlist-availability";
import { createSlug, mediaItemKey } from "./utils";
import { throwIfAllRequestsFailed } from "./tmdb-results";
import { todayLocal } from "./dates";
import { knownReleaseDate, type TonightCandidate } from "./tonight";
import type { AvailabilityRef } from "./watchlist-availability";

/**
 * Resolve saved titles into the facts a "what tonight" decision needs.
 *
 * Runtime and genre are not on the watchlist – it stores what a card needs to
 * render, and neither of those is it. Both come from cached detail reads here,
 * alongside the availability lookup the watchlist page already does, so both
 * sets of facts reuse the browser's catalogue cache.
 */

// Every saved title must remain eligible. Limit queued reads per batch instead
// of dropping older titles before the viewer's filters can consider them.
const TITLES_PER_BATCH = 60;

const UNRELEASED_MOVIE_STATUSES = new Set([
  "Rumored", "Planned", "In Production", "Post Production", "Canceled",
]);

/** Resolved picks remain usable while the page offers to retry missing details. */
export class TonightCandidatesLoadError extends Error {
  constructor(
    readonly candidates: TonightCandidate[],
    readonly failedRefs: AvailabilityRef[],
  ) {
    super(`Could not load details for ${failedRefs.length} saved titles`);
    this.name = "TonightCandidatesLoadError";
  }
}

interface CandidatesBatch {
  candidates: TonightCandidate[];
  failedRefs: AvailabilityRef[];
  detailResults: PromiseSettledResult<unknown>[];
}

function isMissingTitle(error: unknown): boolean {
  return error instanceof Error && /^TMDB API error: 404\b/.test(error.message);
}

export function sanitizeTonightRefs(input: unknown): AvailabilityRef[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const refs: AvailabilityRef[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;

    const { id, mediaType } = entry as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) continue;
    if (mediaType !== "movie" && mediaType !== "tv") continue;

    const key = mediaItemKey(id, mediaType);
    if (seen.has(key)) continue;

    seen.add(key);
    refs.push({ id, mediaType });
  }

  return refs;
}

/**
 * The length of one sitting.
 *
 * TMDB reports a list of episode runtimes for a show, which is its way of saying
 * the format changed at some point. The first entry is the usual one, and the
 * usual one is what someone budgeting an evening is asking about.
 */
function episodeRuntime(runtimes: number[] | undefined): number | null {
  return knownRuntime(runtimes?.[0]);
}

/** Zero is TMDB's unknown duration, so it must behave like a missing runtime. */
function knownRuntime(runtime: unknown): number | null {
  return typeof runtime === "number" && Number.isFinite(runtime) && runtime > 0
    ? runtime
    : null;
}

export async function getTonightCandidates(
  refs: AvailabilityRef[],
  signal?: AbortSignal,
): Promise<TonightCandidate[]> {
  signal?.throwIfAborted();
  // Use one local calendar day for the entire load, including later batches.
  const today = todayLocal();
  const candidates: TonightCandidate[] = [];
  const failedRefs: AvailabilityRef[] = [];
  const detailResults: PromiseSettledResult<unknown>[] = [];

  for (let start = 0; start < refs.length; start += TITLES_PER_BATCH) {
    signal?.throwIfAborted();
    const batch = await getTonightCandidatesBatch(
      refs.slice(start, start + TITLES_PER_BATCH),
      today,
      signal,
    );
    signal?.throwIfAborted();
    candidates.push(...batch.candidates);
    failedRefs.push(...batch.failedRefs);
    detailResults.push(...batch.detailResults);
  }

  // A failed early batch must not hide titles that later batches can resolve.
  // Preserve the original outage error only when no detail lookup succeeded.
  throwIfAllRequestsFailed(detailResults);
  if (failedRefs.length > 0) {
    throw new TonightCandidatesLoadError(candidates, failedRefs);
  }

  return candidates;
}

async function getTonightCandidatesBatch(
  refs: AvailabilityRef[],
  today: string,
  signal?: AbortSignal,
): Promise<CandidatesBatch> {
  const movieRefs = refs.filter((ref) => ref.mediaType === "movie");
  const showRefs = refs.filter((ref) => ref.mediaType === "tv");
  const options = { signal, priority: "background" as const };

  // Availability runs alongside the detail reads rather than after them: it is
  // the slower of the two and neither depends on the other. Bulk reads leave
  // the next available transport slot to an interactive search or detail.
  const [availability, movieResults, showResults] = await Promise.all([
    getWatchlistAvailability(refs, signal),
    Promise.allSettled(movieRefs.map((ref) => getCachedMovieDetails(ref.id, undefined, options))),
    Promise.allSettled(showRefs.map((ref) => getCachedTVShowDetails(ref.id, options))),
  ]);

  const candidates: TonightCandidate[] = [];
  const failedRefs: AvailabilityRef[] = [];

  movieResults.forEach((result, index) => {
    // A title TMDB no longer knows should cost one card, not the whole page.
    if (result.status !== "fulfilled") {
      if (!isMissingTitle(result.reason)) failedRefs.push(movieRefs[index]);
      return;
    }

    const { id } = movieRefs[index];
    const details = result.value;
    const releaseDate = knownReleaseDate(details.release_date);
    // Saving a future release is useful; recommending it for tonight is not.
    // Unknown dates alone do not rule out a released film or a physical copy.
    if (UNRELEASED_MOVIE_STATUSES.has(details.status) ||
        (releaseDate && releaseDate > today)) return;
    const title = details.title || `Film ${id}`;
    const found = availability.byKey[mediaItemKey(id, "movie")];

    candidates.push({
      id,
      mediaType: "movie",
      title,
      posterPath: details.poster_path ?? null,
      backdropPath: details.backdrop_path ?? null,
      overview: details.overview || null,
      slug: createSlug(title, id),
      year: releaseDate?.slice(0, 4) ?? null,
      releaseDate,
      voteAverage: Number(details.vote_average) || 0,
      runtime: knownRuntime(details.runtime),
      genres: (details.genres ?? []).map((genre) => genre.name),
      availability: found?.status ?? "unknown",
      providers: found?.providers ?? [],
    });
  });

  showResults.forEach((result, index) => {
    if (result.status !== "fulfilled") {
      if (!isMissingTitle(result.reason)) failedRefs.push(showRefs[index]);
      return;
    }

    const { id } = showRefs[index];
    const details = result.value;
    const releaseDate = knownReleaseDate(details.first_air_date);
    if ((releaseDate && releaseDate > today) ||
        (!releaseDate &&
         ["Planned", "In Production"].includes(details.status))) return;
    const title = details.name || `Series ${id}`;
    const found = availability.byKey[mediaItemKey(id, "tv")];

    candidates.push({
      id,
      mediaType: "tv",
      title,
      posterPath: details.poster_path ?? null,
      backdropPath: details.backdrop_path ?? null,
      overview: details.overview || null,
      slug: createSlug(title, id),
      year: releaseDate?.slice(0, 4) ?? null,
      releaseDate,
      voteAverage: Number(details.vote_average) || 0,
      runtime: episodeRuntime(details.episode_run_time),
      genres: (details.genres ?? []).map((genre) => genre.name),
      availability: found?.status ?? "unknown",
      providers: found?.providers ?? [],
    });
  });

  return { candidates, failedRefs, detailResults: [...movieResults, ...showResults] };
}
