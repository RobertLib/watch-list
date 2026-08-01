// Importing this from a Client Component is a build error rather than a bundle
// that quietly ships all 398 films – and with them today's answer, since the
// schedule is a pure function of the date.
import "server-only";

import { getCachedMovieDetails } from "./tmdb-cache";
import { createSlug } from "./utils";
import { PUZZLE_POOL, type PuzzleEntry } from "./daily-puzzle-pool";
import {
  IMAGE_STEPS,
  MAX_GUESSES,
  imageStepForGuessCount,
  isDayString,
  puzzleNumberForDay,
  unlockedHints,
  type HintKind,
} from "./daily-puzzle";

/**
 * The server's half of the daily puzzle: which film it is, and how much of it the
 * player has earned the right to see.
 *
 * The answer never leaves this module until the day is over. That is why the
 * hints are assembled here rather than filtered in the browser, why the image
 * goes out through a proxy route – a TMDB path in the page source would name the
 * film outright – and why the pool is imported here and nowhere else.
 */

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * The step taken through the pool from one day to the next.
 *
 * Coprime with the pool length, which is what guarantees the walk touches every
 * entry before returning to any of them – a stride sharing a factor would circle
 * a fraction of the pool forever. Starting near the golden ratio spreads
 * consecutive days far apart, so a week never lands on three neighbours.
 */
function coprimeStride(length: number): number {
  if (length <= 2) return 1;

  let stride = Math.floor(length * 0.618) || 1;
  while (stride > 1 && gcd(stride, length) !== 1) stride--;

  return stride || 1;
}

/** `%` yields negatives in JavaScript, and an index never should. */
function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export interface DailyPuzzle {
  day: string;
  number: number;
  entry: PuzzleEntry;
}

/**
 * The puzzle for a given day.
 *
 * Note that the schedule is a function of the pool's length: appending to
 * `PUZZLE_POOL` reshuffles which film lands on which future day. That is fine for
 * a daily game – but it does mean a deploy that grows the pool mid-day changes
 * that day's answer, so grow it between days rather than during one.
 */
export function pickPuzzleForDay(day: string): DailyPuzzle | null {
  if (!isDayString(day)) return null;

  const number = puzzleNumberForDay(day);
  if (!Number.isFinite(number)) return null;

  const length = PUZZLE_POOL.length;
  if (length === 0) return null;

  const index = positiveModulo(number * coprimeStride(length), length);

  return { day, number, entry: PUZZLE_POOL[index] };
}

export interface DailyHints {
  decade?: string;
  genres?: string[];
  runtime?: number | null;
  tagline?: string | null;
  director?: string | null;
  cast?: string[];
}

export interface DailyAnswer {
  id: number;
  title: string;
  slug: string;
  year: string | null;
  posterPath: string | null;
  overview: string | null;
}

export interface DailyPuzzleView {
  day: string;
  number: number;
  /** Which of `IMAGE_STEPS` the proxy will serve, so the client can ask for it. */
  imageStep: number;
  hints: DailyHints;
  /** Present only once the day has been won or lost. */
  answer: DailyAnswer | null;
}

const MAX_CAST_SHOWN = 3;

function decadeOf(releaseDate: string | undefined): string | undefined {
  if (!releaseDate || releaseDate.length < 4) return undefined;

  const year = Number(releaseDate.slice(0, 4));
  if (!Number.isFinite(year)) return undefined;

  return `${Math.floor(year / 10) * 10}s`;
}

/**
 * Resolve the puzzle for a day into what the client is allowed to see.
 *
 * `guessCount` and `isOver` come from the browser, which owns the board. Nothing
 * here trusts them for anything but pacing: a client that lies about them only
 * spoils its own puzzle, and both are clamped so an inflated number cannot reach
 * past the last rung of the ladder.
 */
export async function getDailyPuzzleView(
  day: string,
  guessCount: number,
  isOver: boolean,
): Promise<DailyPuzzleView | null> {
  const puzzle = pickPuzzleForDay(day);
  if (!puzzle) return null;

  const safeGuessCount = Number.isInteger(guessCount)
    ? Math.max(0, Math.min(guessCount, MAX_GUESSES))
    : 0;

  let details;
  try {
    details = await getCachedMovieDetails(puzzle.entry.id, "credits");
  } catch (error) {
    console.error("Error loading the daily puzzle film:", error);
    return null;
  }

  const wanted = new Set<HintKind>(unlockedHints(safeGuessCount));
  const hints: DailyHints = {};

  if (wanted.has("decade")) hints.decade = decadeOf(details.release_date);
  if (wanted.has("genres")) {
    hints.genres = (details.genres ?? []).map((genre) => genre.name);
  }
  if (wanted.has("runtime")) hints.runtime = details.runtime ?? null;
  if (wanted.has("tagline")) hints.tagline = details.tagline || null;
  if (wanted.has("director")) {
    hints.director =
      (details.credits?.crew ?? []).find((member) => member.job === "Director")
        ?.name ?? null;
  }
  if (wanted.has("cast")) {
    hints.cast = (details.credits?.cast ?? [])
      .slice(0, MAX_CAST_SHOWN)
      .map((member) => member.name);
  }

  const title = details.title || puzzle.entry.title;

  return {
    day: puzzle.day,
    number: puzzle.number,
    // A finished day gets the full-size image regardless of how the guesses went.
    // Lifting only the CSS blur is not enough: the step also picks the TMDB size,
    // so a two-guess win would have its reveal upscaled from a thumbnail.
    imageStep: isOver
      ? IMAGE_STEPS.length - 1
      : imageStepForGuessCount(safeGuessCount),
    hints,
    answer: isOver
      ? {
          id: puzzle.entry.id,
          title,
          slug: createSlug(title, puzzle.entry.id),
          year: details.release_date?.slice(0, 4) || null,
          posterPath: details.poster_path ?? null,
          overview: details.overview || null,
        }
      : null,
  };
}

/** Whether a guessed TMDB id is the day's film. */
export async function isCorrectGuess(
  day: string,
  movieId: number,
): Promise<boolean> {
  const puzzle = pickPuzzleForDay(day);
  return puzzle !== null && puzzle.entry.id === movieId;
}

/**
 * The image the puzzle shows, resolved for the proxy route.
 *
 * A backdrop is preferred: a poster carries the title in the artwork, which would
 * end the game the moment the blur lifted.
 */
export async function getDailyImagePath(day: string): Promise<string | null> {
  if (!isDayString(day)) return null;

  const puzzle = pickPuzzleForDay(day);
  if (!puzzle) return null;

  try {
    const details = await getCachedMovieDetails(puzzle.entry.id);
    return details.backdrop_path ?? details.poster_path ?? null;
  } catch (error) {
    console.error("Error loading the daily puzzle image:", error);
    return null;
  }
}
