"use client";

import { MAX_GUESSES, daysBetween, isDayString } from "./daily-puzzle";

/**
 * The player's side of the daily puzzle: today's guesses, and the streak that
 * makes coming back tomorrow worth something.
 *
 * localStorage, like every other personal record here – there is no account, and
 * a streak is exactly the kind of thing worth keeping without asking for one.
 */

export const DAILY_GAME_STORAGE_KEY = "daily-game";

export type DailyStatus = "playing" | "won" | "lost";

export interface DailyGuess {
  /** TMDB movie id – comparing ids is what makes checking exact. */
  id: number;
  title: string;
  correct: boolean;
}

export interface DailyGameState {
  /** The last day a result was recorded, so a streak can tell a gap from a run. */
  lastResultDay: string;
  currentStreak: number;
  bestStreak: number;
  played: number;
  won: number;
  /** Wins by number of guesses taken; index 0 is a first-guess win. */
  distribution: number[];
  /** The day in progress. Absent until the player opens the game. */
  today: {
    day: string;
    guesses: DailyGuess[];
    status: DailyStatus;
  } | null;
}

export const EMPTY_STATE: DailyGameState = {
  lastResultDay: "",
  currentStreak: 0,
  bestStreak: 0,
  played: 0,
  won: 0,
  distribution: Array.from({ length: MAX_GUESSES }, () => 0),
  today: null,
};

const MAX_TITLE_LENGTH = 200;

function sanitizeCount(value: unknown): number {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

function sanitizeGuesses(input: unknown): DailyGuess[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object"),
    )
    .filter((entry) => Number.isInteger(entry.id) && (entry.id as number) > 0)
    .slice(0, MAX_GUESSES)
    .map((entry) => ({
      id: entry.id as number,
      title:
        typeof entry.title === "string"
          ? entry.title.slice(0, MAX_TITLE_LENGTH)
          : "",
      correct: entry.correct === true,
    }));
}

function sanitizeStatus(value: unknown): DailyStatus {
  return value === "won" || value === "lost" ? value : "playing";
}

/**
 * Rebuild stored state from the fields we understand.
 *
 * A streak is worth something to the player, so a single unexpected value must
 * not throw it away – each part is repaired independently rather than the whole
 * record being discarded.
 */
export function sanitizeGameState(input: unknown): DailyGameState {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return EMPTY_STATE;
  }

  const record = input as Record<string, unknown>;
  const distribution = Array.isArray(record.distribution)
    ? record.distribution
    : [];

  const today = record.today as Record<string, unknown> | null | undefined;

  return {
    lastResultDay: isDayString(record.lastResultDay) ? record.lastResultDay : "",
    currentStreak: sanitizeCount(record.currentStreak),
    bestStreak: sanitizeCount(record.bestStreak),
    played: sanitizeCount(record.played),
    won: sanitizeCount(record.won),
    distribution: Array.from({ length: MAX_GUESSES }, (_, index) =>
      sanitizeCount(distribution[index]),
    ),
    today:
      today && typeof today === "object" && isDayString(today.day)
        ? {
            day: today.day,
            guesses: sanitizeGuesses(today.guesses),
            status: sanitizeStatus(today.status),
          }
        : null,
  };
}

export function getGameState(): DailyGameState {
  if (typeof window === "undefined") return EMPTY_STATE;

  try {
    const stored = window.localStorage.getItem(DAILY_GAME_STORAGE_KEY);
    if (!stored) return EMPTY_STATE;

    return sanitizeGameState(JSON.parse(stored));
  } catch (error) {
    console.error("Error parsing daily game state:", error);
    return EMPTY_STATE;
  }
}

export function saveGameState(state: DailyGameState): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      DAILY_GAME_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving daily game state:", error);
  }

  // A `storage` event only fires in *other* tabs, so this tab has to announce its
  // own writes for the store below to notice them.
  notifyGameStateChanged();
}

// ── The state as an external store ───────────────────────────────────────────
//
// Exposed this way so components can read it with `useSyncExternalStore` instead
// of copying it into their own state in a mount effect. Two things fall out of
// that: the home-page card updates the moment a puzzle is solved (in this tab or
// another one), and there is no second copy to drift.

const listeners = new Set<() => void>();

// `useSyncExternalStore` compares snapshots by identity, so parsing on every call
// would hand it a new object each time and spin forever. The parse is memoised
// against the raw string, which is what actually changes.
let cachedRaw: string | null = null;
let cachedState: DailyGameState = EMPTY_STATE;

function notifyGameStateChanged(): void {
  for (const listener of listeners) listener();
}

export function subscribeToGameState(onChange: () => void): () => void {
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    // `key` is null when the whole store was cleared, which concerns us too.
    if (event.key !== null && event.key !== DAILY_GAME_STORAGE_KEY) return;
    onChange();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getGameStateSnapshot(): DailyGameState {
  if (typeof window === "undefined") return EMPTY_STATE;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(DAILY_GAME_STORAGE_KEY);
  } catch {
    return EMPTY_STATE;
  }

  if (raw === cachedRaw) return cachedState;

  cachedRaw = raw;
  cachedState = raw ? sanitizeGameState(safeParse(raw)) : EMPTY_STATE;

  return cachedState;
}

/** The server has no storage, so it starts everyone from nothing. */
export function getServerGameStateSnapshot(): DailyGameState {
  return EMPTY_STATE;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Error parsing daily game state:", error);
    return null;
  }
}

/**
 * Move the stored state onto `day`.
 *
 * Yesterday's board is dropped rather than kept: the streak and the totals are
 * what carry over, and holding old boards would grow storage without ever being
 * read.
 */
export function stateForDay(
  state: DailyGameState,
  day: string,
): DailyGameState {
  if (state.today?.day === day) return state;

  return { ...state, today: { day, guesses: [], status: "playing" } };
}

export function recordGuess(
  state: DailyGameState,
  day: string,
  guess: DailyGuess,
): DailyGameState {
  const onDay = stateForDay(state, day);
  const today = onDay.today!;

  // A finished board takes no more guesses, and neither does a repeated one –
  // guessing the same wrong film twice must not cost a life.
  if (today.status !== "playing") return onDay;
  if (today.guesses.some((existing) => existing.id === guess.id)) return onDay;

  const guesses = [...today.guesses, guess];
  const status: DailyStatus = guess.correct
    ? "won"
    : guesses.length >= MAX_GUESSES
      ? "lost"
      : "playing";

  const next: DailyGameState = {
    ...onDay,
    today: { day, guesses, status },
  };

  return status === "playing"
    ? next
    : recordResult(next, day, status === "won", guesses.length);
}

/**
 * Fold a finished day into the totals.
 *
 * The streak survives a loss being played but not a day being skipped – which is
 * the whole point of it. Guarded against double-counting, because a client can be
 * reloaded, and re-recording the same day would inflate everything.
 */
export function recordResult(
  state: DailyGameState,
  day: string,
  won: boolean,
  guessCount: number,
): DailyGameState {
  if (state.lastResultDay === day) return state;

  const continuesRun =
    state.lastResultDay !== "" && daysBetween(state.lastResultDay, day) === 1;

  const currentStreak = won ? (continuesRun ? state.currentStreak + 1 : 1) : 0;

  const distribution = [...state.distribution];
  if (won && guessCount >= 1 && guessCount <= MAX_GUESSES) {
    distribution[guessCount - 1] += 1;
  }

  return {
    ...state,
    lastResultDay: day,
    currentStreak,
    bestStreak: Math.max(state.bestStreak, currentStreak),
    played: state.played + 1,
    won: won ? state.won + 1 : state.won,
    distribution,
  };
}

/**
 * The streak as it stands *today*, rather than as it was last recorded.
 *
 * A run ends by being interrupted, and nothing runs to notice that – so a stored
 * streak from three days ago is stale. This reports what the player would
 * actually be continuing, without rewriting storage on a page they only read.
 */
export function effectiveStreak(state: DailyGameState, today: string): number {
  if (state.currentStreak === 0 || !isDayString(state.lastResultDay)) return 0;

  const gap = daysBetween(state.lastResultDay, today);
  // Today or yesterday: the run is still alive, and today's result is either in
  // already or still available to play.
  return gap <= 1 ? state.currentStreak : 0;
}

/** Emoji grid for sharing a result, with nothing in it that spoils the answer. */
export function buildShareText(
  puzzleNumber: number,
  guesses: DailyGuess[],
  status: DailyStatus,
  url: string,
): string {
  const squares = guesses
    .map((guess) => (guess.correct ? "🟩" : "🟥"))
    .join("");
  const score = status === "won" ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;

  return `🎬 WatchList Daily #${puzzleNumber} ${score}\n${squares}\n${url}`;
}
