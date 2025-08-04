export interface FilterOptions {
  sortBy?: string;
  year?: string;
  genre?: string;
  minRating?: number;
  includeAdult?: boolean;
  primaryReleaseDateGte?: string;
  primaryReleaseDateLte?: string;
  voteCountGte?: number;
  withOriginalLanguage?: string;
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

export const RELEASE_YEARS = Array.from(
  { length: new Date().getFullYear() - 1895 + 1 },
  (_, i) => new Date().getFullYear() - i
);

// Countries/Original Languages - filters content by the original language it was produced in
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
