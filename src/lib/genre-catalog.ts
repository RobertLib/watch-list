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
import type { Locale } from "@/i18n/locale";

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
/**
 * The slug of a genre TMDB handed back on a title – whose `name` is in the
 * page's language, "Akční" on a Czech page. Genre pages are written under the
 * catalogue's English slug (`action-28`) in both trees, so the slug is taken
 * from the catalogue by id, and only a genre the catalogue lacks falls back
 * to the name it came with.
 */
export function catalogGenreSlug(mediaType: MediaType, genre: Genre): string {
  return genreSlug(findGenreById(mediaType, genre.id) ?? genre);
}

export function findGenreBySlug(
  mediaType: MediaType,
  slug: string,
): Genre | undefined {
  return genresFor(mediaType).find((genre) => genreSlug(genre) === slug);
}

/**
 * A genre's name in Czech, as TMDB itself names it in `cs-CZ` – the label on a
 * chip or a tag. The slug stays the English one (`action-28`) in both trees:
 * the id is the half that matters, and one slug per genre keeps the two
 * trees' addresses parallel.
 */
const CZECH_GENRE_NAMES: Record<number, string> = {
  28: "Akční",
  12: "Dobrodružný",
  16: "Animovaný",
  35: "Komedie",
  80: "Krimi",
  99: "Dokumentární",
  18: "Drama",
  10751: "Rodinný",
  14: "Fantasy",
  36: "Historický",
  27: "Horor",
  10402: "Hudební",
  9648: "Mysteriózní",
  10749: "Romantický",
  878: "Sci-fi",
  10770: "Televizní film",
  53: "Thriller",
  10752: "Válečný",
  37: "Western",
  10759: "Akční a dobrodružný",
  10762: "Dětský",
  10763: "Zprávy",
  10764: "Reality",
  10765: "Sci-fi a fantasy",
  10766: "Mýdlová opera",
  10767: "Talk show",
  10768: "Válečný a politický",
};

/** A genre's label in `locale`. Unknown ids keep the name they came with. */
export function genreName(genre: Genre, locale: Locale): string {
  return locale === "cs" ? (CZECH_GENRE_NAMES[genre.id] ?? genre.name) : genre.name;
}

/**
 * The genre and the medium as one phrase – "Action Movies", "Akční filmy" –
 * for headings and page titles. Czech cannot simply join the two words: the
 * adjective agrees with "filmy" or "seriály", and several genres are nouns of
 * their own (komedie, horory, westerny), so each phrase is written out.
 */
const CZECH_GENRE_TITLES: Record<MediaType, Record<number, string>> = {
  movie: {
    28: "Akční filmy",
    12: "Dobrodružné filmy",
    16: "Animované filmy",
    35: "Komedie",
    80: "Krimi filmy",
    99: "Dokumentární filmy",
    18: "Filmová dramata",
    10751: "Rodinné filmy",
    14: "Fantasy filmy",
    36: "Historické filmy",
    27: "Horory",
    10402: "Hudební filmy",
    9648: "Mysteriózní filmy",
    10749: "Romantické filmy",
    878: "Sci-fi filmy",
    10770: "Televizní filmy",
    53: "Thrillery",
    10752: "Válečné filmy",
    37: "Westerny",
  },
  tv: {
    10759: "Akční a dobrodružné seriály",
    16: "Animované seriály",
    35: "Komediální seriály",
    80: "Krimi seriály",
    99: "Dokumentární seriály",
    18: "Dramatické seriály",
    10751: "Rodinné seriály",
    10762: "Dětské seriály",
    9648: "Mysteriózní seriály",
    10763: "Zpravodajské pořady",
    10764: "Reality show",
    10765: "Sci-fi a fantasy seriály",
    10766: "Telenovely",
    10767: "Talk show",
    10768: "Válečné a politické seriály",
    37: "Westernové seriály",
  },
};

export function genreTitle(
  genre: Genre,
  mediaType: MediaType,
  locale: Locale,
): string {
  if (locale === "cs") {
    return (
      CZECH_GENRE_TITLES[mediaType][genre.id] ??
      `${genreName(genre, locale)} ${mediaType === "movie" ? "filmy" : "seriály"}`
    );
  }
  return `${genre.name} ${mediaType === "movie" ? "Movies" : "TV Shows"}`;
}

/**
 * The same phrase inside a sentence: "action movies", "akční filmy". English
 * keeps the genre's capital only where the genre is a proper noun – none are –
 * so the whole phrase is lowered in both languages.
 */
export function genrePhrase(
  genre: Genre,
  mediaType: MediaType,
  locale: Locale,
): string {
  if (locale === "cs") return genreTitle(genre, mediaType, locale).toLowerCase();
  return `${genre.name.toLowerCase()} ${mediaType === "movie" ? "movies" : "TV shows"}`;
}
