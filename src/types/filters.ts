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
}

export interface TVSortOptions {
  value: string;
  label: string;
}

export const MOVIE_SORT_OPTIONS: MovieSortOptions[] = [
  { value: "popularity.desc", label: "Popularity (High to Low)" },
  { value: "popularity.asc", label: "Popularity (Low to High)" },
  { value: "vote_average.desc", label: "Rating (High to Low)" },
  { value: "vote_average.asc", label: "Rating (Low to High)" },
  { value: "primary_release_date.desc", label: "Release Date (Newest)" },
  { value: "primary_release_date.asc", label: "Release Date (Oldest)" },
  { value: "title.asc", label: "Title (A-Z)" },
  { value: "title.desc", label: "Title (Z-A)" },
  { value: "revenue.desc", label: "Revenue (High to Low)" },
  { value: "revenue.asc", label: "Revenue (Low to High)" },
];

export const TV_SORT_OPTIONS: TVSortOptions[] = [
  { value: "popularity.desc", label: "Popularity (High to Low)" },
  { value: "popularity.asc", label: "Popularity (Low to High)" },
  { value: "vote_average.desc", label: "Rating (High to Low)" },
  { value: "vote_average.asc", label: "Rating (Low to High)" },
  { value: "first_air_date.desc", label: "Air Date (Newest)" },
  { value: "first_air_date.asc", label: "Air Date (Oldest)" },
  { value: "name.asc", label: "Title (A-Z)" },
  { value: "name.desc", label: "Title (Z-A)" },
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
  { code: "en", name: "English" },
  { code: "cs", name: "Czech" },
  { code: "sk", name: "Slovak" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ru", name: "Russian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "no", name: "Norwegian" },
  { code: "da", name: "Danish" },
  { code: "fi", name: "Finnish" },
  { code: "pl", name: "Polish" },
  { code: "hu", name: "Hungarian" },
  { code: "tr", name: "Turkish" },
];
