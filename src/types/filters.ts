import type { Locale } from "@/i18n/locale";

export interface FilterOptions {
  sortBy?: string;
  year?: string;
  genre?: string;
  minRating?: number;
  primaryReleaseDateGte?: string;
  primaryReleaseDateLte?: string;
  voteCountGte?: number;
  voteCountLte?: number;
  popularityLte?: number;
  withOriginalLanguage?: string;
  firstAirDateGte?: string;
  firstAirDateLte?: string;
  /** TMDB TV status code; 0 selects Returning Series, including between seasons. */
  withStatus?: 0 | 1 | 2 | 3 | 4 | 5;
  /**
   * Streaming platform scope: `ANY_PROVIDERS` ignores the saved platform filter,
   * `MY_PROVIDERS` uses the profile's platforms, or `|`-separated TMDB IDs select
   * particular platforms. Absent values inherit the saved setting.
   */
  watchProviders?: string;
  /**
   * Runtime bounds in minutes. Not offered in the filter bar – genre and year are
   * what people filter a listing by – but a mood is often *made* of a runtime
   * ("something short"), which is where these are used.
   */
  withRuntimeGte?: number;
  withRuntimeLte?: number;
  /**
   * `,`-separated TMDB keyword IDs (AND) or `|`-separated (OR).
   *
   * Genres are too coarse to describe a mood: "mind-bending" is not a genre and
   * never will be, but it is a keyword TMDB maintains. Only set from curated
   * definitions in the codebase, never from a query string.
   */
  withKeywords?: string;
}

export interface MovieSortOptions {
  value: string;
  label: string;
  /** `label` in Czech. */
  labelCs: string;
}

export interface TVSortOptions {
  value: string;
  label: string;
  /** `label` in Czech. */
  labelCs: string;
}

export const MOVIE_SORT_OPTIONS: MovieSortOptions[] = [
  { value: "popularity.desc", label: "Popularity (High to Low)", labelCs: "Popularita (od nejvyšší)" },
  { value: "popularity.asc", label: "Popularity (Low to High)", labelCs: "Popularita (od nejnižší)" },
  { value: "vote_average.desc", label: "Rating (High to Low)", labelCs: "Hodnocení (od nejvyššího)" },
  { value: "vote_average.asc", label: "Rating (Low to High)", labelCs: "Hodnocení (od nejnižšího)" },
  { value: "primary_release_date.desc", label: "Release Date (Newest)", labelCs: "Datum premiéry (od nejnovějších)" },
  { value: "primary_release_date.asc", label: "Release Date (Oldest)", labelCs: "Datum premiéry (od nejstarších)" },
  { value: "title.asc", label: "Title (A-Z)", labelCs: "Název (A–Z)" },
  { value: "title.desc", label: "Title (Z-A)", labelCs: "Název (Z–A)" },
  { value: "revenue.desc", label: "Revenue (High to Low)", labelCs: "Tržby (od nejvyšších)" },
  { value: "revenue.asc", label: "Revenue (Low to High)", labelCs: "Tržby (od nejnižších)" },
];

export const TV_SORT_OPTIONS: TVSortOptions[] = [
  { value: "popularity.desc", label: "Popularity (High to Low)", labelCs: "Popularita (od nejvyšší)" },
  { value: "popularity.asc", label: "Popularity (Low to High)", labelCs: "Popularita (od nejnižší)" },
  { value: "vote_average.desc", label: "Rating (High to Low)", labelCs: "Hodnocení (od nejvyššího)" },
  { value: "vote_average.asc", label: "Rating (Low to High)", labelCs: "Hodnocení (od nejnižšího)" },
  { value: "first_air_date.desc", label: "Air Date (Newest)", labelCs: "Datum vysílání (od nejnovějších)" },
  { value: "first_air_date.asc", label: "Air Date (Oldest)", labelCs: "Datum vysílání (od nejstarších)" },
  { value: "name.asc", label: "Title (A-Z)", labelCs: "Název (A–Z)" },
  { value: "name.desc", label: "Title (Z-A)", labelCs: "Název (Z–A)" },
];

/** The year of the first film TMDB has, and so the oldest a filter can name. */
const FIRST_RELEASE_YEAR = 1895;

/**
 * Every year TMDB has titles for, newest first.
 *
 * A function rather than a constant, because a constant is evaluated when the
 * module loads – and for a static export that is on the build machine, at build
 * time. The prerendered option list then carried the build's year for as long
 * as the deployment stood, so a site built in December offered no January until
 * somebody rebuilt it. Reading the clock per call puts that in the hands of
 * whoever is looking; `now` is a parameter so a test can name the year it means.
 */
export function releaseYears(now: Date = new Date()): number[] {
  const current = now.getFullYear();

  return Array.from(
    { length: current - FIRST_RELEASE_YEAR + 1 },
    (_, i) => current - i,
  );
}

// Original languages used by the catalogue's with_original_language filter.
export const LANGUAGES = [
  { code: "en", name: "English", nameCs: "angličtina" },
  { code: "cs", name: "Czech", nameCs: "čeština" },
  { code: "sk", name: "Slovak", nameCs: "slovenština" },
  { code: "de", name: "German", nameCs: "němčina" },
  { code: "fr", name: "French", nameCs: "francouzština" },
  { code: "es", name: "Spanish", nameCs: "španělština" },
  { code: "it", name: "Italian", nameCs: "italština" },
  { code: "ja", name: "Japanese", nameCs: "japonština" },
  { code: "ko", name: "Korean", nameCs: "korejština" },
  { code: "zh", name: "Chinese", nameCs: "čínština" },
  { code: "ru", name: "Russian", nameCs: "ruština" },
  { code: "pt", name: "Portuguese", nameCs: "portugalština" },
  { code: "nl", name: "Dutch", nameCs: "nizozemština" },
  { code: "sv", name: "Swedish", nameCs: "švédština" },
  { code: "no", name: "Norwegian", nameCs: "norština" },
  { code: "da", name: "Danish", nameCs: "dánština" },
  { code: "fi", name: "Finnish", nameCs: "finština" },
  { code: "pl", name: "Polish", nameCs: "polština" },
  { code: "hu", name: "Hungarian", nameCs: "maďarština" },
  { code: "tr", name: "Turkish", nameCs: "turečtina" },
];

/** A filter language's name in the page's language. */
export function languageName(
  language: (typeof LANGUAGES)[number],
  locale: Locale,
): string {
  return locale === "cs" ? language.nameCs : language.name;
}
