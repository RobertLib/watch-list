/**
 * The rules of the daily puzzle: how days are numbered, how many guesses there
 * are, and what each wrong one unlocks.
 *
 * Holds no film data: the pool lives in `daily-puzzle-pool.ts`. That separation
 * used to be secrecy – on the server build the pool stayed out of the bundle, so
 * today's answer could not be computed from the date. The static export ends
 * that. The pool ships to the browser, because the two modules that read it
 * (`daily-puzzle-data.ts`, which assembles the hints, and `rating-duel-data.ts`,
 * which draws its pairs from the same list) both run there; see the header of
 * `daily-puzzle-data.ts` for what the game keeps once the answer is readable in
 * devtools.
 *
 * What the split still buys is this file: a schedule that is a pure function of
 * the date, imported by the board and the home-page card without a catalogue
 * coming with it, and tested on its own.
 */

import { shiftDate } from "./dates";
import type { ImageSize } from "./tmdb-image";

/** Day one. Puzzle numbers count from here, so #1 is this date. */
export const PUZZLE_EPOCH = "2026-08-01";

/** Wrong answers allowed before the day is lost, Wordle-style. */
export const MAX_GUESSES = 6;

const MS_PER_DAY = 86_400_000;

export function isDayString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Today in UTC, so the puzzle turns over at the same instant worldwide. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      MS_PER_DAY,
  );
}

/** The puzzle number shown to players. Day one is #1. */
export function puzzleNumberForDay(day: string): number {
  return daysBetween(PUZZLE_EPOCH, day) + 1;
}

/**
 * Whether a day may be played at all.
 *
 * The archive exists so a puzzle missed on Tuesday is not gone forever – that is
 * what makes a broken streak recoverable rather than a reason to stop coming. It
 * only ever reaches backwards: the schedule is a pure function of the date, so
 * serving tomorrow would hand out tomorrow's answer to anyone willing to edit a
 * URL. The check lives here, next to the schedule it protects, and every entry
 * point runs it.
 */
export function isPlayableDay(day: unknown, today: string): day is string {
  if (!isDayString(day) || !isDayString(today)) return false;

  return day >= PUZZLE_EPOCH && day <= today;
}

/**
 * The days behind `today`, newest first, stopping at the epoch.
 *
 * Bounded by the caller rather than by the whole run of the game: the archive
 * page renders one card per day, and the list grows by one every morning.
 */
export function recentDays(today: string, count: number): string[] {
  if (!isDayString(today)) return [];

  const days: string[] = [];

  for (let offset = 0; offset < count; offset++) {
    const day = shiftDate(today, -offset);
    if (day < PUZZLE_EPOCH) break;
    days.push(day);
  }

  return days;
}

/** Milliseconds until the puzzle turns over, for the countdown on a finished board. */
export function msUntilNextPuzzle(now: Date = new Date()): number {
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );

  return Math.max(0, midnight - now.getTime());
}

/**
 * What each wrong guess unlocks.
 *
 * Ordered weakest first, so a run of bad guesses narrows the field gradually
 * rather than handing over the answer at the first stumble. The cast comes last
 * because naming three actors usually settles it outright.
 */
export type HintKind =
  | "decade"
  | "genres"
  | "runtime"
  | "tagline"
  | "director"
  | "cast";

export const HINT_LADDER: HintKind[] = [
  "decade",
  "genres",
  "runtime",
  "tagline",
  "director",
  "cast",
];

/**
 * Which hints a player on their `guessCount`-th guess has earned.
 *
 * The first guess comes with nothing but the image; each wrong one adds the next
 * rung. Bounded by the ladder so a client claiming 900 guesses gains nothing it
 * would not already have at six.
 */
export function unlockedHints(guessCount: number): HintKind[] {
  const rungs = Math.max(0, Math.min(guessCount, HINT_LADDER.length));
  return HINT_LADDER.slice(0, rungs);
}

/**
 * How sharp the image is allowed to be. Zero is the blurriest.
 *
 * The step drives which TMDB size is served rather than only how much CSS blur is
 * applied: a downscaled image has genuinely lost the detail, so sharpening it
 * back up in devtools is not an option.
 */
export const IMAGE_STEPS: readonly ImageSize[] = [
  "w92",
  "w154",
  "w185",
  "w300",
  "w500",
  "w780",
];

export function imageStepForGuessCount(guessCount: number): number {
  return Math.max(0, Math.min(guessCount, IMAGE_STEPS.length - 1));
}
