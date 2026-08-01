import { mediaItemKey } from "./utils";
import type { MediaType } from "@/types/tmdb";
import type { AvailabilityStatus, ProviderBadge } from "./watchlist-view";

/**
 * "What should I watch tonight?"
 *
 * The watchlist answers "what did I mean to watch", which is a different
 * question and a much less useful one at half past nine on a Tuesday. Eighty
 * saved titles is not a shortlist – it is the reason people stop opening their
 * watchlist at all.
 *
 * So this narrows on the three things that actually decide it – how long it is,
 * whether it can be played right now, and what sort of evening it is – and then
 * picks one. A single title with a reason attached beats a grid every time,
 * because the grid is what the person was already stuck in.
 */

/** A saved title with the facts a decision needs, resolved server-side. */
export interface TonightCandidate {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  slug: string;
  year: string | null;
  voteAverage: number;
  /** Minutes. For a series, one episode – which is the unit of an evening. */
  runtime: number | null;
  genres: string[];
  availability: AvailabilityStatus;
  providers: ProviderBadge[];
}

export type RuntimeBand = "any" | "short" | "medium" | "long";

export interface TonightFilters {
  runtime: RuntimeBand;
  type: "all" | "movie" | "tv";
  /** Only what can be played right now on a platform the profile names. */
  readyOnly: boolean;
  /** TMDB genre name, matched against the resolved list. */
  genre: string | null;
}

export const DEFAULT_FILTERS: TonightFilters = {
  runtime: "any",
  type: "all",
  readyOnly: false,
  genre: null,
};

/**
 * The bands people actually think in. Nobody says "under 97 minutes"; they say
 * they have an hour and a half, or that it is late.
 */
export const RUNTIME_BANDS: Array<{
  id: RuntimeBand;
  label: string;
  hint: string;
  max: number | null;
  min: number | null;
}> = [
  { id: "any", label: "Any length", hint: "", max: null, min: null },
  { id: "short", label: "Under 1 hour", hint: "an episode", max: 60, min: null },
  {
    id: "medium",
    label: "Up to 2 hours",
    hint: "a normal evening",
    max: 120,
    min: null,
  },
  {
    id: "long",
    label: "2 hours or more",
    hint: "clear the evening",
    max: null,
    min: 120,
  },
];

function bandFor(band: RuntimeBand) {
  return RUNTIME_BANDS.find((entry) => entry.id === band) ?? RUNTIME_BANDS[0];
}

/**
 * Whether a candidate survives the filters.
 *
 * A title with no runtime on TMDB passes any length filter rather than failing
 * it: the alternative is silently hiding titles for a missing field, and an
 * unknown runtime is not evidence of a long one.
 */
export function matchesFilters(
  candidate: TonightCandidate,
  filters: TonightFilters,
): boolean {
  if (filters.type !== "all" && candidate.mediaType !== filters.type) {
    return false;
  }

  if (filters.readyOnly && candidate.availability !== "mine") return false;

  if (filters.genre && !candidate.genres.includes(filters.genre)) return false;

  const band = bandFor(filters.runtime);
  if (candidate.runtime !== null) {
    if (band.max !== null && candidate.runtime > band.max) return false;
    if (band.min !== null && candidate.runtime < band.min) return false;
  }

  return true;
}

export function filterCandidates(
  candidates: TonightCandidate[],
  filters: TonightFilters,
): TonightCandidate[] {
  return candidates.filter((candidate) => matchesFilters(candidate, filters));
}

/**
 * Pick one, avoiding whatever was just shown.
 *
 * `random` is injected so the pick is testable and so a re-spin can be driven by
 * a counter rather than by the clock. Falls back to allowing a repeat once the
 * pool is down to the title already on screen – refusing to pick anything would
 * read as the button being broken.
 */
export function pickOne(
  candidates: TonightCandidate[],
  excludeKey: string | null,
  random: () => number = Math.random,
): TonightCandidate | null {
  if (candidates.length === 0) return null;

  const pool =
    excludeKey === null
      ? candidates
      : candidates.filter(
          (candidate) =>
            mediaItemKey(candidate.id, candidate.mediaType) !== excludeKey,
        );

  const from = pool.length > 0 ? pool : candidates;

  return from[Math.floor(random() * from.length)] ?? null;
}

/** Every genre present in the shortlist, so the picker offers only real options. */
export function availableGenres(candidates: TonightCandidate[]): string[] {
  const genres = new Set<string>();
  for (const candidate of candidates) {
    for (const genre of candidate.genres) genres.add(genre);
  }

  return [...genres].sort((a, b) => a.localeCompare(b));
}

/** "1h 47m", the way a runtime is read out loud. */
export function formatRuntime(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;

  return `${hours}h ${rest}m`;
}

/**
 * Why this one, in a phrase.
 *
 * A pick with no reason attached looks arbitrary, and an arbitrary pick is one
 * people override. Naming the constraint it satisfies is what makes it land.
 */
export function reasonFor(
  candidate: TonightCandidate,
  filters: TonightFilters,
): string {
  const parts: string[] = [];

  const runtime = formatRuntime(candidate.runtime);
  if (runtime) {
    parts.push(
      candidate.mediaType === "tv" ? `${runtime} an episode` : runtime,
    );
  }

  if (candidate.availability === "mine" && candidate.providers.length > 0) {
    parts.push(`on ${candidate.providers[0].name}`);
  } else if (candidate.availability === "streaming") {
    parts.push("streaming now");
  } else if (candidate.availability === "rent") {
    parts.push("rent or buy");
  }

  if (filters.genre) parts.push(filters.genre.toLowerCase());
  else if (candidate.genres.length > 0) parts.push(candidate.genres[0].toLowerCase());

  return parts.join(" · ");
}
