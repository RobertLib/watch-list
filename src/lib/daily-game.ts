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

/** A day that is over, one way or the other. */
export type DailyResult = "won" | "lost";

export interface DailyGuess {
  /** TMDB movie id – comparing ids is what makes checking exact. */
  id: number;
  title: string;
  correct: boolean;
}

export interface DailyBoard {
  day: string;
  guesses: DailyGuess[];
  status: DailyStatus;
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
  today: DailyBoard | null;
  /**
   * How each finished day went, keyed by day.
   *
   * The totals above say how many; this says which, which is what a streak
   * calendar draws and what tells the archive apart from a day never opened. Only
   * days played on the day itself land here – see `archive`.
   */
  history: Record<string, DailyResult>;
  /**
   * Boards for puzzles played late, out of the archive.
   *
   * Kept apart from the run on purpose. Catching up on a missed Tuesday is worth
   * offering – it is what makes a broken streak recoverable instead of a reason
   * to stop – but folding it into the streak would turn the streak into a measure
   * of how much of the archive someone ground through, which is not the thing it
   * is meant to reward.
   */
  archive: Record<string, DailyBoard>;
}

export const EMPTY_STATE: DailyGameState = {
  lastResultDay: "",
  currentStreak: 0,
  bestStreak: 0,
  played: 0,
  won: 0,
  distribution: Array.from({ length: MAX_GUESSES }, () => 0),
  today: null,
  history: {},
  archive: {},
};

const MAX_TITLE_LENGTH = 200;

// Both maps grow by one a day and are never read past the recent past, so they
// are pruned oldest-first. `history` covers more than a year, which is further
// back than any calendar on the page draws; `archive` holds the boards
// themselves, which are much larger per entry.
const MAX_HISTORY_DAYS = 400;
const MAX_ARCHIVE_BOARDS = 90;

/** Day strings sort lexicographically, so "newest" needs no date parsing. */
function pruneOldest<T>(
  entries: Record<string, T>,
  limit: number,
): Record<string, T> {
  const keys = Object.keys(entries);
  if (keys.length <= limit) return entries;

  const kept = keys.sort().slice(-limit);
  const result: Record<string, T> = {};
  for (const key of kept) result[key] = entries[key];

  return result;
}

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

function sanitizeHistory(input: unknown): Record<string, DailyResult> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const result: Record<string, DailyResult> = {};

  for (const [day, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isDayString(day)) continue;
    // "playing" is not a result – a day left unfinished is a day with no entry.
    if (value !== "won" && value !== "lost") continue;

    result[day] = value;
  }

  return pruneOldest(result, MAX_HISTORY_DAYS);
}

function sanitizeArchive(input: unknown): Record<string, DailyBoard> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const result: Record<string, DailyBoard> = {};

  for (const [day, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isDayString(day)) continue;
    if (!value || typeof value !== "object") continue;

    const board = value as Record<string, unknown>;
    result[day] = {
      day,
      guesses: sanitizeGuesses(board.guesses),
      status: sanitizeStatus(board.status),
    };
  }

  return pruneOldest(result, MAX_ARCHIVE_BOARDS);
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
    // Absent from anything written before the archive existed, which is exactly
    // what an empty map means here.
    history: sanitizeHistory(record.history),
    archive: sanitizeArchive(record.archive),
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
    history: pruneOldest(
      { ...state.history, [day]: won ? "won" : "lost" },
      MAX_HISTORY_DAYS,
    ),
  };
}

// ── The archive ──────────────────────────────────────────────────────────────

/** The board for a past day, or a fresh one if it has never been opened. */
export function archiveBoardFor(
  state: DailyGameState,
  day: string,
): DailyBoard {
  return state.archive[day] ?? { day, guesses: [], status: "playing" };
}

/**
 * Record a guess against a past puzzle.
 *
 * Deliberately touches nothing but `archive`: no streak, no totals, no
 * distribution. See the note on the field – the streak has to keep meaning
 * "showed up on the day".
 */
export function recordArchiveGuess(
  state: DailyGameState,
  day: string,
  guess: DailyGuess,
): DailyGameState {
  const board = archiveBoardFor(state, day);

  // Same two guards as the live board: a finished puzzle takes no more guesses,
  // and repeating one must not cost a life.
  if (board.status !== "playing") return state;
  if (board.guesses.some((existing) => existing.id === guess.id)) return state;

  const guesses = [...board.guesses, guess];
  const status: DailyStatus = guess.correct
    ? "won"
    : guesses.length >= MAX_GUESSES
      ? "lost"
      : "playing";

  return {
    ...state,
    archive: pruneOldest(
      { ...state.archive, [day]: { day, guesses, status } },
      MAX_ARCHIVE_BOARDS,
    ),
  };
}

export type DayOutcome = "won" | "lost" | "archived" | "missed" | "today";

/**
 * How a given day stands, for the calendar grid.
 *
 * "archived" is its own outcome rather than being folded into a win: a day
 * caught up on later did happen, and showing it is the reward for catching up –
 * but it should not look like the run was never broken.
 */
export function outcomeForDay(
  state: DailyGameState,
  day: string,
  today: string,
): DayOutcome {
  const recorded = state.history[day];
  if (recorded) return recorded;

  const archived = state.archive[day];
  if (archived && archived.status !== "playing") return "archived";

  if (day === today) return "today";

  return "missed";
}

/** Past puzzles finished from the archive, for the badge that counts them. */
export function archiveSolvedCount(state: DailyGameState): number {
  return Object.values(state.archive).filter((board) => board.status === "won")
    .length;
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
  isArchive = false,
): string {
  const squares = guesses
    .map((guess) => (guess.correct ? "🟩" : "🟥"))
    .join("");
  const score = status === "won" ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  // Said outright, because a shared archive result posted next to today's would
  // otherwise read as a claim about today.
  const suffix = isArchive ? " (archive)" : "";

  return `🎬 WatchList Daily #${puzzleNumber}${suffix} ${score}\n${squares}\n${url}`;
}
