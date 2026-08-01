// Reaches TMDB, so importing it from a Client Component is a build error rather
// than a bundle carrying the bearer token.
import "server-only";

import { getCachedMovieDetails, getCachedTVShowDetails } from "./tmdb-cache";
import { mediaItemKey } from "./utils";
import type { TitleFacts } from "./stats";
import type { MediaType } from "@/types/tmdb";

/**
 * Runtime, genre and year for everything the visitor has watched.
 *
 * None of it is stored locally: the watched list keeps what a card needs to
 * render, and a runtime is not that. All three come from cached detail reads, so
 * a stats page costs one round trip and TMDB usually pays for none of it.
 */

interface FactRef {
  id: number;
  mediaType: MediaType;
}

// A watched list is the one that only grows. Two hundred is more than enough for
// the totals to be meaningful, and bounds the first, uncached load.
const MAX_FACTS = 200;

export function sanitizeFactRefs(input: unknown): FactRef[] {
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

    if (refs.length >= MAX_FACTS) break;
  }

  return refs;
}

/** TMDB gives a list when a show's format changed; the first is the usual one. */
function episodeRuntime(runtimes: number[] | undefined): number | null {
  const first = runtimes?.[0];
  return typeof first === "number" && first > 0 ? first : null;
}

export async function getTitleFacts(
  refs: FactRef[],
): Promise<Record<string, TitleFacts>> {
  if (refs.length === 0) return {};

  const movieRefs = refs.filter((ref) => ref.mediaType === "movie");
  const showRefs = refs.filter((ref) => ref.mediaType === "tv");

  const [movieResults, showResults] = await Promise.all([
    Promise.allSettled(movieRefs.map((ref) => getCachedMovieDetails(ref.id))),
    Promise.allSettled(showRefs.map((ref) => getCachedTVShowDetails(ref.id))),
  ]);

  const facts: Record<string, TitleFacts> = {};

  movieResults.forEach((result, index) => {
    // A title TMDB no longer knows is left out of the map, which the summary
    // reads as "runtime unknown" rather than as zero minutes.
    if (result.status !== "fulfilled") return;

    const { id } = movieRefs[index];
    const details = result.value;

    facts[mediaItemKey(id, "movie")] = {
      id,
      mediaType: "movie",
      runtime: typeof details.runtime === "number" ? details.runtime : null,
      genres: (details.genres ?? []).map((genre) => genre.name),
      year: details.release_date?.slice(0, 4) || null,
    };
  });

  showResults.forEach((result, index) => {
    if (result.status !== "fulfilled") return;

    const { id } = showRefs[index];
    const details = result.value;

    facts[mediaItemKey(id, "tv")] = {
      id,
      mediaType: "tv",
      runtime: episodeRuntime(details.episode_run_time),
      genres: (details.genres ?? []).map((genre) => genre.name),
      year: details.first_air_date?.slice(0, 4) || null,
    };
  });

  return facts;
}
