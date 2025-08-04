import { getCachedMovieDetails } from "./tmdb-cache";
import { createSlug } from "./utils";
import { getImageUrlOrNull } from "./tmdb-image";
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
 * The daily puzzle: which film it is, and how much of it the player has earned
 * the right to see.
 *
 * This used to be the server's half, and the secrecy was real – the pool stayed
 * out of the bundle, the hints were assembled out of reach, and the image went
 * through a proxy so a TMDB path could not name the film. None of that survives
 * a static export: the pool ships to the browser and the schedule is a pure
 * function of the date, so today's answer is readable by anyone who opens
 * devtools.
 *
 * What is kept is the pacing. The board still reveals a hint at a time and the
 * still still sharpens with each guess, because that is the game; it is simply
 * on the honour system now, and the only puzzle a cheat spoils is their own.
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
  /** Which of `IMAGE_STEPS` this board has reached, for the blur on top. */
  imageStep: number;
  /**
   * The still, already sized for the step reached. The size is what does the
   * work: a downscaled image has genuinely lost its detail, so turning the CSS
   * blur off in devtools recovers nothing.
   */
  imageUrl: string | null;
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

  // A finished day gets the full-size image regardless of how the guesses went.
  // Lifting only the CSS blur is not enough: the step also picks the TMDB size,
  // so a two-guess win would have its reveal upscaled from a thumbnail.
  const imageStep = isOver
    ? IMAGE_STEPS.length - 1
    : imageStepForGuessCount(safeGuessCount);

  // A backdrop is preferred: a poster carries the title in the artwork, which
  // would end the game the moment the blur lifted.
  const imagePath = details.backdrop_path ?? details.poster_path ?? null;

  return {
    day: puzzle.day,
    number: puzzle.number,
    imageStep,
    imageUrl: getImageUrlOrNull(imagePath, IMAGE_STEPS[imageStep]),
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
export function isCorrectGuess(day: string, movieId: number): boolean {
  const puzzle = pickPuzzleForDay(day);
  return puzzle !== null && puzzle.entry.id === movieId;
}
