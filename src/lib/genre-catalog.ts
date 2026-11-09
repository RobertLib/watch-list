/**
 * Every genre TMDB files titles under, written down rather than fetched.
 *
 * The genre pages are real paths now – `/genres/movie/action-28` – and a static
 * export can only serve a path the build knew about, so the build has to know
 * the list. TMDB's own `/genre/{type}/list` is where these came from (checked
 * 2026-11-09); the ids have not changed in years, and an id TMDB retires simply
 * stops returning titles. Keeping them here also means the genre links on the
 * home page and on `/genres` are in the prerendered HTML instead of waiting for
 * a request, which is the half of the site a crawler reads.
 *
 * Names are TMDB's English ones, because they are what the page headings say.
 */

import { createSlug } from "./utils";
import type { Genre, MediaType } from "@/types/tmdb";

export const MOVIE_GENRES: readonly Genre[] = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Science Fiction" },
  { id: 10770, name: "TV Movie" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
];

export const TV_GENRES: readonly Genre[] = [
  { id: 10759, name: "Action & Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 10762, name: "Kids" },
  { id: 9648, name: "Mystery" },
  { id: 10763, name: "News" },
  { id: 10764, name: "Reality" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10766, name: "Soap" },
  { id: 10767, name: "Talk" },
  { id: 10768, name: "War & Politics" },
  { id: 37, name: "Western" },
];

export function genresFor(mediaType: MediaType): readonly Genre[] {
  return mediaType === "movie" ? MOVIE_GENRES : TV_GENRES;
}

/** The path segment a genre is published under: `action-28`, `sci-fi-fantasy-10765`. */
export function genreSlug(genre: Genre): string {
  return createSlug(genre.name, genre.id);
}

/** The genre with this id, or `undefined` when TMDB has no such genre for the type. */
export function findGenreById(
  mediaType: MediaType,
  id: number | null,
): Genre | undefined {
  if (id === null) return undefined;
  return genresFor(mediaType).find((genre) => genre.id === id);
}

/**
 * The genre a path segment names – only when it is the canonical slug.
 *
 * Strict on purpose: the build emits one file per genre, under exactly
 * `genreSlug(genre)`, so anything else is not a page that exists.
 */
export function findGenreBySlug(
  mediaType: MediaType,
  slug: string,
): Genre | undefined {
  return genresFor(mediaType).find((genre) => genreSlug(genre) === slug);
}
