/**
 * The rules of the daily puzzle: how days are numbered, how many guesses there
 * are, and what each wrong one unlocks.
 *
 * Deliberately holds no film data and does not import the pool. The board and the
 * home-page card run in the browser and import from here, and a bundle carrying
 * the pool would let anyone compute today's answer from the date – the schedule is
 * a pure function of it. Everything that touches the pool lives in
 * `daily-puzzle-server.ts`, which is `server-only` so this cannot regress quietly.
 */

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

/** `YYYY-MM-DD` shifted by whole days, without leaving the string domain. */
export function shiftDay(day: string, days: number): string {
  const shifted = new Date(`${day}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
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
    const day = shiftDay(today, -offset);
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
export const IMAGE_STEPS = ["w92", "w154", "w185", "w300", "w500", "w780"];

export function imageStepForGuessCount(guessCount: number): number {
  return Math.max(0, Math.min(guessCount, IMAGE_STEPS.length - 1));
}
