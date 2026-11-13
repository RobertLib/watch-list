/**
 * What a "movies like this" page is built from – `/movies-like/inception-27205`.
 *
 * The title page already has a "Movies like …" section: nine posters under
 * everything else. This is that question given a page of its own, because it is
 * one people ask by name ("movies like Inception") and a section at the foot of
 * another page answers it to nobody who was not already there.
 *
 * It costs no request of its own. The build reads the same TMDB answer the
 * title page does (`MOVIE_APPENDED_SECTIONS` names `recommendations` and
 * `similar`) and takes a different cut of it: the title page keeps nine with
 * the fields a small card shows; this keeps twenty, and says of each what it
 * has in common with the title – which is the part a bare list of posters
 * leaves the reader to work out.
 */

import { findGenreById } from "./genre-catalog";
import { releaseYear } from "./dates";
import { likeResults } from "./title-details";
import { createSlug } from "./utils";
import type {
  Genre,
  MediaType,
  Movie,
  MovieDetails,
  TVShow,
  TVShowDetails,
} from "@/types/tmdb";

/** How many titles a like page lists. One page: there is no page two. */
export const LIKE_LIST_LENGTH = 20;

/**
 * The fewest a like page must list to be offered to search engines. A title
 * too little watched for TMDB to recommend much after it gets a page of four,
 * which is the thin page the platform landings are kept out of the index for –
 * same rule, same number (`MIN_INDEXABLE_LANDING_RESULTS`).
 */
export const MIN_INDEXABLE_LIKE_RESULTS = 10;

/** Keywords named in the page's introduction. */
const KEYWORDS_NAMED = 4;
/** An overview is a paragraph; a row shows the start of one. */
const OVERVIEW_CHARACTERS = 220;

export interface LikeTitle {
  id: number;
  title: string;
  slug: string;
  year: number | null;
  /** `YYYY-MM-DD`, or "" – what a watchlist entry made from the row stores. */
  releaseDate: string;
  posterPath: string | null;
  overview: string;
  voteAverage: number;
  voteCount: number;
  /** The genres it has in common with the page's title, in that title's order. */
  sharedGenres: string[];
}

export interface LikePageData {
  mediaType: MediaType;
  id: number;
  title: string;
  slug: string;
  year: number | null;
  posterPath: string | null;
  backdropPath: string | null;
  genres: Genre[];
  /** A few of the title's keywords – what it is about, in TMDB's words. */
  keywords: string[];
  items: LikeTitle[];
}

/** Cut at a word, with an ellipsis, where the text runs past `limit`. */
function excerpt(text: string | undefined, limit: number): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(" "), limit / 2));
  return `${atWord.replace(/[\s,;:.–-]+$/, "")}…`;
}

function likeTitle(
  mediaType: MediaType,
  title: Movie | TVShow,
  genres: Genre[],
): LikeTitle {
  const name = "title" in title ? title.title : title.name;
  const date = "release_date" in title ? title.release_date : title.first_air_date;
  const ids = new Set(title.genre_ids ?? []);

  return {
    id: title.id,
    title: name,
    slug: createSlug(name, title.id),
    year: releaseYear(date),
    releaseDate: date ?? "",
    posterPath: title.poster_path,
    overview: excerpt(title.overview, OVERVIEW_CHARACTERS),
    voteAverage: title.vote_average,
    voteCount: title.vote_count,
    // By id, and named from this app's own catalogue rather than the title's:
    // the two agree, and a genre TMDB adds tomorrow is then simply not named.
    sharedGenres: genres
      .filter((genre) => ids.has(genre.id) && findGenreById(mediaType, genre.id))
      .map((genre) => genre.name),
  };
}

export function movieLikePage(details: MovieDetails): LikePageData {
  const genres = details.genres ?? [];
  return {
    mediaType: "movie",
    id: details.id,
    title: details.title,
    slug: createSlug(details.title, details.id),
    year: releaseYear(details.release_date),
    posterPath: details.poster_path,
    backdropPath: details.backdrop_path,
    genres,
    keywords: (details.keywords?.keywords ?? [])
      .slice(0, KEYWORDS_NAMED)
      .map((keyword) => keyword.name),
    items: likeResults<Movie>(details)
      .slice(0, LIKE_LIST_LENGTH)
      .map((title) => likeTitle("movie", title, genres)),
  };
}

export function tvLikePage(details: TVShowDetails): LikePageData {
  const genres = details.genres ?? [];
  return {
    mediaType: "tv",
    id: details.id,
    title: details.name,
    slug: createSlug(details.name, details.id),
    year: releaseYear(details.first_air_date),
    posterPath: details.poster_path,
    backdropPath: details.backdrop_path,
    genres,
    keywords: (details.keywords?.results ?? [])
      .slice(0, KEYWORDS_NAMED)
      .map((keyword) => keyword.name),
    items: likeResults<TVShow>(details)
      .slice(0, LIKE_LIST_LENGTH)
      .map((title) => likeTitle("tv", title, genres)),
  };
}

/** Whether a like page lists enough to be indexed. No snapshot is no. */
export function isIndexableLikePage(page: LikePageData | null): boolean {
  return page !== null && page.items.length >= MIN_INDEXABLE_LIKE_RESULTS;
}

/** "Movies" or "Shows" – the word the page's heading and address use. */
export function likeNoun(mediaType: MediaType): string {
  return mediaType === "movie" ? "Movies" : "Shows";
}

/** "adventure, drama and science fiction". */
function listWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * The page's opening sentence, written from the title's own data: how many,
 * what they share, and what the title is about.
 */
export function likeIntroduction(page: LikePageData): string {
  const noun = page.mediaType === "movie" ? "films" : "series";
  const genres = page.genres.slice(0, 3).map((genre) => genre.name.toLowerCase());
  const year = page.year ? ` (${page.year})` : "";
  const count = page.items.length;

  const shared =
    genres.length > 0
      ? ` that share its mix of ${listWords(genres)}`
      : "";
  const about =
    page.keywords.length > 0
      ? ` – ${listWords(page.keywords)} –`
      : "";

  return `${count} ${noun} to watch after ${page.title}${year}${shared}${about} starting with the closest match.`;
}
