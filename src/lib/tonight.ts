import { mediaItemKey } from "./utils";
import type { MediaType } from "@/types/tmdb";
import type { AvailabilityStatus, ProviderBadge } from "./watchlist-view";
import { t, type Locale, type Localized } from "@/i18n/locale";

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

/** A saved title with the facts a decision needs, resolved from TMDB. */
export interface TonightCandidate {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  slug: string;
  year: string | null;
  /** Full movie release or TV first-air date; null when the date is unknown. */
  releaseDate: string | null;
  voteAverage: number;
  /** Minutes. For a series, one episode – which is the unit of an evening. */
  runtime: number | null;
  genres: string[];
  availability: AvailabilityStatus;
  providers: ProviderBadge[];
}

/** Preserve a complete calendar date, without inventing a day for a known year. */
export function knownReleaseDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value : null;
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
  label: Localized;
  hint: Localized;
  max: number | null;
  min: number | null;
}> = [
  {
    id: "any",
    label: { en: "Any length", cs: "Jakákoli délka" },
    hint: { en: "", cs: "" },
    max: null,
    min: null,
  },
  {
    id: "short",
    label: { en: "Under 1 hour", cs: "Do 1 hodiny" },
    hint: { en: "an episode", cs: "jedna epizoda" },
    max: 60,
    min: null,
  },
  {
    id: "medium",
    label: { en: "Up to 2 hours", cs: "Do 2 hodin" },
    hint: { en: "a normal evening", cs: "běžný večer" },
    max: 120,
    min: null,
  },
  {
    id: "long",
    label: { en: "2 hours or more", cs: "2 hodiny a víc" },
    hint: { en: "clear the evening", cs: "na celý večer" },
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

/** "1h 47m", the way a runtime is read out loud. Czech spaces its units: "1 h 47 min". */
export function formatRuntime(
  minutes: number | null,
  locale: Locale = "en",
): string | null {
  if (minutes === null || minutes <= 0) return null;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (locale === "cs") {
    if (hours === 0) return `${rest} min`;
    if (rest === 0) return `${hours} h`;
    return `${hours} h ${rest} min`;
  }

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
  locale: Locale = "en",
): string {
  const parts: string[] = [];

  const runtime = formatRuntime(candidate.runtime, locale);
  if (runtime) {
    parts.push(
      candidate.mediaType === "tv"
        ? t(locale, `${runtime} an episode`, `${runtime} na epizodu`)
        : runtime,
    );
  }

  if (candidate.availability === "mine" && candidate.providers.length > 0) {
    // "ve službě Netflix": the name stays in the nominative, so no service's
    // name has to be declined.
    const provider = candidate.providers[0].name;
    parts.push(t(locale, `on ${provider}`, `ve službě ${provider}`));
  } else if (candidate.availability === "streaming") {
    parts.push(t(locale, "streaming now", "právě se streamuje"));
  } else if (candidate.availability === "rent") {
    parts.push(t(locale, "rent or buy", "k zapůjčení nebo koupi"));
  }

  if (filters.genre) parts.push(filters.genre.toLowerCase());
  else if (candidate.genres.length > 0) parts.push(candidate.genres[0].toLowerCase());

  return parts.join(" · ");
}
