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

export interface Keyword {
  id: number;
  name: string;
}

export interface MovieKeywordsResponse {
  id: number;
  keywords: Keyword[];
}

export interface TVKeywordsResponse {
  id: number;
  results: Keyword[];
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

export interface Review {
  id: string;
  author: string;
  author_details: {
    name: string;
    username: string;
    rating: number | null;
  };
  content: string;
  created_at: string;
  url: string;
}

export interface ReviewsResponse {
  id: number;
  page: number;
  results: Review[];
  total_pages: number;
  total_results: number;
}

export interface Network {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface Season {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
  episode_count: number;
  air_date: string;
  vote_average: number;
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  air_date: string;
  episode_number: number;
  season_number: number;
  still_path: string | null;
  vote_average: number;
  runtime: number | null;
}

export interface ReleaseDateEntry {
  certification: string;
  iso_639_1: string;
  release_date: string;
  type: number;
  note: string;
}

export interface ReleaseDatesResult {
  iso_3166_1: string;
  release_dates: ReleaseDateEntry[];
}

export interface ReleaseDatesResponse {
  id: number;
  results: ReleaseDatesResult[];
}

export interface ContentRatingEntry {
  iso_3166_1: string;
  rating: string;
}

export interface ContentRatingsResponse {
  id: number;
  results: ContentRatingEntry[];
}

export interface MovieCollection {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface Person {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  known_for: (Movie | TVShow)[];
}

export interface PersonDetails {
  id: number;
  name: string;
  biography: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  gender: number;
  popularity: number;
  adult: boolean;
  also_known_as: string[];
  homepage: string | null;
  imdb_id: string | null;
}

export interface PersonMovieCredit {
  id: number;
  title: string;
  character: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
}

export interface PersonTVCredit {
  id: number;
  name: string;
  character: string;
  poster_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  episode_count: number;
}

export interface PersonCredits {
  cast: PersonMovieCredit[] | PersonTVCredit[];
}

export interface PersonMovieCredits {
  cast: PersonMovieCredit[];
}

export interface PersonTVCredits {
  cast: PersonTVCredit[];
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
  belongs_to_collection: MovieCollection | null;
  "watch/providers"?: WatchProvidersResponse;
  // append_to_response fields
  credits?: Credits;
  videos?: VideosResponse;
  similar?: TMDBResponse<Movie>;
  recommendations?: TMDBResponse<Movie>;
  translations?: TranslationsResponse;
  keywords?: MovieKeywordsResponse;
  reviews?: ReviewsResponse;
  release_dates?: ReleaseDatesResponse;
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
  networks: Network[];
  seasons: Season[];
  next_episode_to_air: Episode | null;
  last_episode_to_air: Episode | null;
  "watch/providers"?: WatchProvidersResponse;
  // append_to_response fields
  credits?: Credits;
  videos?: VideosResponse;
  similar?: TMDBResponse<TVShow>;
  recommendations?: TMDBResponse<TVShow>;
  translations?: TVTranslationsResponse;
  keywords?: TVKeywordsResponse;
  reviews?: ReviewsResponse;
  external_ids?: { imdb_id?: string | null; tvdb_id?: number | null };
  content_ratings?: ContentRatingsResponse;
}
