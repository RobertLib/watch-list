export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  adult: boolean;
  original_language: string;
  original_title: string;
  popularity: number;
  video: boolean;
  media_type?: "movie";
  providers?: WatchProvider[];
  "watch/providers"?: WatchProvidersResponse;
}

export interface TVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  adult: boolean;
  original_language: string;
  original_name: string;
  popularity: number;
  media_type?: "tv";
  providers?: WatchProvider[];
  "watch/providers"?: WatchProvidersResponse;
}

export interface Genre {
  id: number;
  name: string;
}

export interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

export interface WatchProviderData {
  buy?: WatchProvider[];
  rent?: WatchProvider[];
  flatrate?: WatchProvider[];
  link: string;
}

export interface WatchProvidersResponse {
  id: number;
  results: {
    [countryCode: string]: WatchProviderData;
  };
}

export type MediaType = "movie" | "tv";

export interface MediaItem {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  media_type: MediaType;
  providers?: WatchProvider[];
  ["watch/providers"]?: WatchProvidersResponse;
}

export interface ProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface ProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface SpokenLanguage {
  english_name: string;
  iso_639_1: string;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface Credits {
  cast: CastMember[];
  crew: CrewMember[];
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

export interface VideosResponse {
  id: number;
  results: Video[];
}

export interface Translation {
  iso_3166_1: string;
  iso_639_1: string;
  name: string;
  english_name: string;
  data: {
    homepage: string;
    overview: string;
    runtime: number;
    tagline: string;
    title: string;
  };
}

export interface TVTranslation {
  iso_3166_1: string;
  iso_639_1: string;
  name: string;
  english_name: string;
  data: {
    homepage: string;
    overview: string;
    tagline: string;
    name: string;
  };
}

export interface TranslationsResponse {
  id: number;
  translations: Translation[];
}

export interface TVTranslationsResponse {
  id: number;
  translations: TVTranslation[];
}

export interface SubtitleLanguage {
  iso_639_1: string;
  name: string;
  english_name: string;
}

export interface DubbingLanguage {
  iso_639_1: string;
  name: string;
  english_name: string;
}

export interface MovieDetails extends Omit<Movie, "genre_ids"> {
  genres: Genre[];
  runtime: number | null;
  budget: number;
  revenue: number;
  production_companies: ProductionCompany[];
  production_countries: ProductionCountry[];
  spoken_languages: SpokenLanguage[];
  status: string;
  tagline: string | null;
  imdb_id: string | null;
  homepage: string | null;
  "watch/providers"?: WatchProvidersResponse;
  // append_to_response fields
  credits?: Credits;
  videos?: VideosResponse;
  similar?: TMDBResponse<Movie>;
  recommendations?: TMDBResponse<Movie>;
  translations?: TranslationsResponse;
}

export interface TVShowDetails extends Omit<TVShow, "genre_ids"> {
  genres: Genre[];
  number_of_episodes: number;
  number_of_seasons: number;
  episode_run_time: number[];
  production_companies: ProductionCompany[];
  production_countries: ProductionCountry[];
  spoken_languages: SpokenLanguage[];
  status: string;
  tagline: string | null;
  homepage: string | null;
  last_air_date: string;
  in_production: boolean;
  "watch/providers"?: WatchProvidersResponse;
  // append_to_response fields
  credits?: Credits;
  videos?: VideosResponse;
  similar?: TMDBResponse<TVShow>;
  recommendations?: TMDBResponse<TVShow>;
  translations?: TVTranslationsResponse;
}
