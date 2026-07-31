import {
  LANGUAGES,
  MOVIE_SORT_OPTIONS,
  RELEASE_YEARS,
  TV_SORT_OPTIONS,
  type FilterOptions,
} from "@/types/filters";
import { sanitizeWatchProvidersFilter } from "@/lib/watch-provider-settings";

export type DiscoverMediaType = "movie" | "tv";

export const DEFAULT_SORT = "popularity.desc";

export const MIN_RATING_OPTIONS = [5, 6, 7, 8, 9] as const;

// Rating filters and rating sorts on /discover are dominated by obscure titles
// rated 10/10 by a handful of people, so both get a vote-count floor.
const RATING_VOTE_FLOOR = 200;

/**
 * On the genre detail pages "genre" already means the genre of the page, so the
 * genre picked in the filter bar travels under a different query key there.
 */
export type GenreParamKey = "genre" | "with_genre";

export interface DiscoverFilters {
  sortBy: string;
  year: string;
  minRating: string;
  language: string;
  genre: string;
  /** `MY_PROVIDERS`, or the ID of a single platform picked from all of them. */
  provider: string;
}

export const EMPTY_DISCOVER_FILTERS: DiscoverFilters = {
  sortBy: "",
  year: "",
  minRating: "",
  language: "",
  genre: "",
  provider: "",
};

export interface DiscoverSearchParams {
  page?: string;
  preset?: string;
  sort_by?: string;
  year?: string;
  min_rating?: string;
  language?: string;
  genre?: string;
  with_genre?: string;
  provider?: string;
}

/** Accepts both the awaited `searchParams` of a page and `useSearchParams()`. */
export type DiscoverSearchParamsInput =
  | DiscoverSearchParams
  | { get(key: string): string | null };

export interface DiscoverPreset {
  id: string;
  filters: FilterOptions;
}

function readParam(
  params: DiscoverSearchParamsInput,
  key: keyof DiscoverSearchParams,
): string | undefined {
  if ("get" in params && typeof params.get === "function") {
    return params.get(key) ?? undefined;
  }
  return (params as DiscoverSearchParams)[key];
}

export function getSortOptions(type: DiscoverMediaType) {
  return type === "movie" ? MOVIE_SORT_OPTIONS : TV_SORT_OPTIONS;
}

/**
 * Reads filters off the URL. Every value is validated against the allowed
 * options so a hand-crafted query string can't leak into the TMDB request.
 * The default sort is normalised to "" so it never shows up in the URL.
 */
export function parseDiscoverFilters(
  params: DiscoverSearchParamsInput,
  type: DiscoverMediaType,
  genreParamKey: GenreParamKey = "genre",
): DiscoverFilters {
  const sortParam = readParam(params, "sort_by");
  const languageParam = readParam(params, "language");
  const year = Number(readParam(params, "year"));
  const minRating = Number(readParam(params, "min_rating"));
  const genre = Number(readParam(params, genreParamKey));

  const sortBy = getSortOptions(type).some(
    (option) => option.value === sortParam,
  )
    ? (sortParam as string)
    : "";

  return {
    sortBy: sortBy === DEFAULT_SORT ? "" : sortBy,
    year: RELEASE_YEARS.includes(year) ? String(year) : "",
    minRating: MIN_RATING_OPTIONS.includes(
      minRating as (typeof MIN_RATING_OPTIONS)[number],
    )
      ? String(minRating)
      : "",
    language: LANGUAGES.some((language) => language.code === languageParam)
      ? (languageParam as string)
      : "",
    genre: Number.isInteger(genre) && genre > 0 ? String(genre) : "",
    // Which provider IDs exist depends on the region, so – like the genre – the
    // value is only checked for shape here and stays harmless if unknown.
    provider: sanitizeWatchProvidersFilter(readParam(params, "provider")),
  };
}

export function hasActiveDiscoverFilters(filters: DiscoverFilters): boolean {
  return Object.values(filters).some((value) => value !== "");
}

/** Translates the URL filters into the TMDB discover options. */
export function discoverFiltersToFilterOptions(
  filters: DiscoverFilters,
  type: DiscoverMediaType,
): FilterOptions {
  const options: FilterOptions = {};

  if (filters.sortBy) {
    options.sortBy = filters.sortBy;
  }
  if (filters.year) {
    options.year = filters.year;
  }
  if (filters.minRating) {
    options.minRating = Number(filters.minRating);
  }
  if (filters.language) {
    options.withOriginalLanguage = filters.language;
  }
  if (filters.genre) {
    options.genre = filters.genre;
  }
  if (filters.provider) {
    options.watchProviders = filters.provider;
  }
  if (filters.minRating || filters.sortBy.startsWith("vote_average")) {
    options.voteCountGte = RATING_VOTE_FLOOR;
  }
  // For the current year, cap the upper date bound to today so that
  // unreleased/future titles are excluded from the results.
  if (filters.year === String(new Date().getFullYear())) {
    const today = new Date().toISOString().split("T")[0];
    if (type === "movie") {
      options.primaryReleaseDateLte = today;
    } else {
      options.firstAirDateLte = today;
    }
  }

  return options;
}

/**
 * Resolves what should actually be requested for the current URL: either a
 * quick-filter preset or the individual filters, never both.
 */
export function resolveDiscoverFilters(
  params: DiscoverSearchParamsInput,
  type: DiscoverMediaType,
  presets: DiscoverPreset[] = [],
): { filters: DiscoverFilters; options: FilterOptions; isActive: boolean } {
  const filters = parseDiscoverFilters(params, type);
  const isActive = hasActiveDiscoverFilters(filters);

  if (!isActive) {
    const preset = presets.find((p) => p.id === readParam(params, "preset"));
    if (preset) {
      return { filters, options: preset.filters, isActive: true };
    }
  }

  return {
    filters,
    options: isActive ? discoverFiltersToFilterOptions(filters, type) : {},
    isActive,
  };
}

/**
 * Query string that keeps the active filters, used for the crawlable
 * pagination links and for filter updates from the client.
 */
export function buildDiscoverFilterQuery(
  filters: DiscoverFilters,
  page: number = 1,
  genreParamKey: GenreParamKey = "genre",
): string {
  const params = new URLSearchParams();

  if (page > 1) params.set("page", String(page));
  if (filters.sortBy) params.set("sort_by", filters.sortBy);
  if (filters.year) params.set("year", filters.year);
  if (filters.minRating) params.set("min_rating", filters.minRating);
  if (filters.language) params.set("language", filters.language);
  if (filters.genre) params.set(genreParamKey, filters.genre);
  if (filters.provider) params.set("provider", filters.provider);

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Human-readable result count, e.g. "1,234 movies". */
export function formatResultCount(
  total: number,
  type: DiscoverMediaType,
): string {
  const noun =
    type === "movie"
      ? total === 1
        ? "movie"
        : "movies"
      : total === 1
        ? "TV show"
        : "TV shows";

  return `${total.toLocaleString("en-US")} ${noun}`;
}
