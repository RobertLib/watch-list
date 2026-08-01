// Holds the TMDB token by way of the cache module – importing it from a Client
// Component is a build error rather than a bundle that ships the bearer.
import "server-only";

import { getCachedMovieDetails, getCachedTVShowDetails } from "./tmdb-cache";
import { getWatchlistAvailability } from "./watchlist-availability";
import { createSlug, mediaItemKey } from "./utils";
import type { TonightCandidate } from "./tonight";
import type { AvailabilityRef } from "./watchlist-availability";

/**
 * Resolve saved titles into the facts a "what tonight" decision needs.
 *
 * Runtime and genre are not on the watchlist – it stores what a card needs to
 * render, and neither of those is it. Both come from cached detail reads here,
 * alongside the availability lookup the watchlist page already does, so the
 * whole shortlist costs one round trip from the browser.
 */

// Two cached TMDB reads per title. Sixty is more shortlist than anyone needs and
// keeps the first, uncached call on a large watchlist reasonable.
const MAX_CANDIDATES = 60;

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

    if (refs.length >= MAX_CANDIDATES) break;
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
  const first = runtimes?.[0];
  return typeof first === "number" && first > 0 ? first : null;
}

export async function getTonightCandidates(
  refs: AvailabilityRef[],
): Promise<TonightCandidate[]> {
  if (refs.length === 0) return [];

  const movieRefs = refs.filter((ref) => ref.mediaType === "movie");
  const showRefs = refs.filter((ref) => ref.mediaType === "tv");

  // Availability runs alongside the detail reads rather than after them: it is
  // the slower of the two and neither depends on the other.
  const [availability, movieResults, showResults] = await Promise.all([
    getWatchlistAvailability(refs),
    Promise.allSettled(movieRefs.map((ref) => getCachedMovieDetails(ref.id))),
    Promise.allSettled(showRefs.map((ref) => getCachedTVShowDetails(ref.id))),
  ]);

  const candidates: TonightCandidate[] = [];

  movieResults.forEach((result, index) => {
    // A title TMDB no longer knows should cost one card, not the whole page.
    if (result.status !== "fulfilled") return;

    const { id } = movieRefs[index];
    const details = result.value;
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
      year: details.release_date?.slice(0, 4) || null,
      voteAverage: Number(details.vote_average) || 0,
      runtime: typeof details.runtime === "number" ? details.runtime : null,
      genres: (details.genres ?? []).map((genre) => genre.name),
      availability: found?.status ?? "unknown",
      providers: found?.providers ?? [],
    });
  });

  showResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    const { id } = showRefs[index];
    const details = result.value;
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
      year: details.first_air_date?.slice(0, 4) || null,
      voteAverage: Number(details.vote_average) || 0,
      runtime: episodeRuntime(details.episode_run_time),
      genres: (details.genres ?? []).map((genre) => genre.name),
      availability: found?.status ?? "unknown",
      providers: found?.providers ?? [],
    });
  });

  return candidates;
}
