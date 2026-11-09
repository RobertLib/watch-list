"use client";

import { createProfileStoreSnapshot, getProfileStorageOwner, isProfileStoreEvent, publishProfileStorageChange, readProfileStore, writeProfileStore } from "./profile-storage";

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
   *
   * A live board still unfinished when its day ends lands here too, guesses and
   * all, so the archive continues it rather than offering six fresh guesses. A
   * day with an entry in `history` gets no board here: it was played on the day,
   * and the archive shows that result instead of replaying it. (Stores from
   * before that rule can still hold one; `history` wins wherever both exist.)
   */
  archive: Record<string, DailyBoard>;
  /**
   * Unique archive wins kept after old boards are pruned, for lifetime badges.
   * Never a day in `history` – see `collectArchiveWonDays`.
   */
  archiveWonDays: string[];
  /**
   * Catch-ups that ran out of guesses, kept after their boards are pruned.
   *
   * The counterpart of `archiveWonDays`, and the reason a lost catch-up stays
   * lost: without it, pruning the board turned the day back into "not played"
   * with six fresh guesses. Never a day in `history` or `archiveWonDays`.
   */
  archiveLostDays: string[];
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
  archiveWonDays: [],
  archiveLostDays: [],
};

const MAX_TITLE_LENGTH = 200;

// `history` and the two lists of finished catch-ups are the record of how every
// day went – a dozen bytes or so per day played – and are never pruned: the
// archive shows every puzzle that has run, and a day that fell out of the record
// would come back as "not played", replayable from scratch. The boards are the
// heavy part (up to six guesses with titles each), so only those are capped.
const MAX_ARCHIVE_BOARDS = 90;

/**
 * Day strings sort lexicographically, so "newest" needs no date parsing.
 *
 * `keep` is the entry just written, which is never the one evicted. Without it a
 * board for a day older than every board kept was pruned the moment it was
 * saved: each wrong guess on it was stored and dropped in the same write, and the
 * puzzle handed out unlimited lives.
 *
 * Finished boards go first, oldest first. Their result outlives them in
 * `archiveWonDays` / `archiveLostDays`, so evicting one costs only the guesses
 * drawn on its card; evicting a board still being played would cost the guesses
 * themselves, and hand the day back with six fresh lives. A board in progress is
 * only evicted once no finished one is left to give up.
 */
function pruneBoards(
  boards: Record<string, DailyBoard>,
  limit: number,
  keep?: string,
): Record<string, DailyBoard> {
  const keys = Object.keys(boards);
  if (keys.length <= limit) return boards;

  const protectedKey = keep !== undefined && keep in boards ? keep : undefined;
  const room = protectedKey === undefined ? limit : limit - 1;
  const others = keys.filter((key) => key !== protectedKey).sort();
  // Eviction order: finished boards oldest first, then boards in progress
  // oldest first. Whatever is left at the end of that order is kept.
  const evictionOrder = [
    ...others.filter((key) => boards[key].status !== "playing"),
    ...others.filter((key) => boards[key].status === "playing"),
  ];
  const kept = new Set(evictionOrder.slice(Math.max(0, evictionOrder.length - room)));
  if (protectedKey !== undefined) kept.add(protectedKey);

  const result: Record<string, DailyBoard> = {};
  for (const key of keys.sort()) {
    if (kept.has(key)) result[key] = boards[key];
  }

  return result;
}

function sanitizeCount(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return 0;
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

  return result;
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

  return result;
}

/**
 * Older stores have only boards; migrate their wins before discarding any.
 *
 * A day with a result from the day itself is never a catch-up, whatever the
 * archive says. The archive used to reopen those days as fresh boards, so a
 * store can hold "archive wins" that are really replays of a day already won or
 * lost – they are dropped here rather than left to inflate the archive badge.
 */
function collectArchiveWonDays(
  input: unknown,
  archive: Record<string, DailyBoard>,
  history: Record<string, DailyResult>,
): string[] {
  const days = new Set<string>();
  for (const day of Array.isArray(input) ? input : []) {
    if (isDayString(day)) days.add(day);
  }
  for (const [day, board] of Object.entries(archive)) {
    if (board.status === "won" && isDayString(day)) days.add(day);
  }
  return [...days].filter((day) => !history[day]).sort();
}

/**
 * The lost catch-ups, from the stored list and from any lost board – minus days
 * with a result from the day itself and days won in the archive, either of which
 * says more about the day than a loss does.
 */
function collectArchiveLostDays(
  input: unknown,
  archive: Record<string, DailyBoard>,
  history: Record<string, DailyResult>,
  wonDays: readonly string[],
): string[] {
  const won = new Set(wonDays);
  const days = new Set<string>();
  for (const day of Array.isArray(input) ? input : []) {
    if (isDayString(day)) days.add(day);
  }
  for (const [day, board] of Object.entries(archive)) {
    if (board.status === "lost" && isDayString(day)) days.add(day);
  }
  return [...days].filter((day) => !history[day] && !won.has(day)).sort();
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
  const archive = sanitizeArchive(record.archive);
  const history = sanitizeHistory(record.history);
  const archiveWonDays = collectArchiveWonDays(record.archiveWonDays, archive, history);

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
    history,
    // Writes already hold the archive to its cap without evicting the board
    // being played, so this only trims a store written by something else – an
    // import, or a version without the cap. The results are collected from the
    // untrimmed boards first, so trimming never loses one.
    archive: pruneBoards(archive, MAX_ARCHIVE_BOARDS),
    archiveWonDays,
    archiveLostDays: collectArchiveLostDays(
      record.archiveLostDays,
      archive,
      history,
      archiveWonDays,
    ),
  };
}

export function getGameState(options: { strict?: boolean } = {}): DailyGameState {
  if (typeof window === "undefined") return EMPTY_STATE;

  try {
    const stored = readProfileStore(DAILY_GAME_STORAGE_KEY, getProfileStorageOwner(), options.strict);
    if (stored === null) return EMPTY_STATE;

    return sanitizeGameState(JSON.parse(stored));
  } catch (error) {
    if (options.strict) throw error;
    console.error("Error parsing daily game state:", error);
    return EMPTY_STATE;
  }
}

/** False when the browser refused the write – out of quota, or storing nothing. */
export function saveGameState(state: DailyGameState): boolean {
  if (typeof window === "undefined") return false;

  let stored = false;

  try {
    writeProfileStore(
      DAILY_GAME_STORAGE_KEY,
      JSON.stringify(state),
    );
    stored = true;
  } catch (error) {
    // Private browsing modes can refuse writes entirely.
    console.error("Error saving daily game state:", error);
  }

  // A `storage` event only fires in *other* tabs, so this tab has to announce its
  // own writes for the store below to notice them.
  // Announced even when the write was refused: every snapshot is read back from
  // storage, so subscribers re-read the value that is actually there and the
  // screen stops showing a change that did not happen.
  notifyGameStateChanged();

  return stored;
}

// ── The state as an external store ───────────────────────────────────────────
//
// Exposed this way so components can read it with `useSyncExternalStore` instead
// of copying it into their own state in a mount effect. Two things fall out of
// that: the home-page card updates the moment a puzzle is solved (in this tab or
// another one), and there is no second copy to drift.

const listeners = new Set<() => void>();

export function notifyGameStateChanged(): void {
  publishProfileStorageChange(() => { for (const listener of listeners) listener(); });
}

export function subscribeToGameState(onChange: () => void): () => void {
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    // `key` is null when the whole store was cleared, which concerns us too.
    if (!isProfileStoreEvent(event.key, DAILY_GAME_STORAGE_KEY)) return;
    onChange();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export const getGameStateSnapshot = createProfileStoreSnapshot<DailyGameState>(
  DAILY_GAME_STORAGE_KEY,
  EMPTY_STATE,
  (raw) => sanitizeGameState(safeParse(raw)),
);

/** The prerendered HTML has no storage, so it starts everyone from nothing. */
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
 * A live board its day ended on before it was finished, as the archive takes it
 * over – or null when there is nothing to carry.
 *
 * Only an earlier day's board qualifies, and only one with guesses on it: an
 * untouched board is the same as the fresh one the archive would open anyway.
 */
function unfinishedLiveBoard(
  state: DailyGameState,
  day: string,
): DailyBoard | null {
  const board = state.today;
  if (!board || board.day !== day || board.status !== "playing") return null;
  if (board.guesses.length === 0 || state.history[day]) return null;

  return { day, guesses: board.guesses, status: "playing" };
}

/**
 * Move the stored state onto `day`.
 *
 * A finished board from an earlier day is dropped rather than kept: its result
 * is already in `history`, the streak and the totals are what carry over, and
 * holding old boards would grow storage without ever being read. An unfinished
 * one moves into the archive instead. Dropping that one used to orphan it – the
 * archive card said "Not played" and offered six fresh guesses and fresh clues
 * for a day the player was halfway through.
 */
export function stateForDay(
  state: DailyGameState,
  day: string,
): DailyGameState {
  if (!isDayString(day)) return state;
  if (state.today?.day === day) return state;

  const previous = state.today?.day;
  const carried =
    previous !== undefined && previous < day && !state.archive[previous]
      ? unfinishedLiveBoard(state, previous)
      : null;

  return {
    ...state,
    today: { day, guesses: [], status: "playing" },
    archive: carried
      ? pruneBoards(
          { ...state.archive, [carried.day]: carried },
          MAX_ARCHIVE_BOARDS,
          carried.day,
        )
      : state.archive,
  };
}

export function recordGuess(
  state: DailyGameState,
  day: string,
  guess: DailyGuess,
): DailyGameState {
  if (!isDayString(day)) return state;

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
 * Only a win keeps the streak going: a loss ends it, and so does a day skipped
 * ("Win within six guesses to keep your streak", as the board says). Guarded
 * against double-counting, because a client can be reloaded, and re-recording
 * the same day would inflate everything.
 */
export function recordResult(
  state: DailyGameState,
  day: string,
  won: boolean,
  guessCount: number,
): DailyGameState {
  if (!isDayString(day)) return state;
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
    history: { ...state.history, [day]: won ? "won" : "lost" },
  };
}

// ── The archive ──────────────────────────────────────────────────────────────

/**
 * Whether `day` has a result from the day itself – which the archive shows, but
 * never replays.
 */
export function playedOnTheDay(state: DailyGameState, day: string): boolean {
  return Boolean(state.history[day]);
}

/** How a catch-up of `day` ended, from the lists that outlive its board. */
function archiveResultFor(
  state: DailyGameState,
  day: string,
): DailyResult | undefined {
  if (state.archiveWonDays?.includes(day)) return "won";
  if (state.archiveLostDays?.includes(day)) return "lost";
  return undefined;
}

/**
 * The board the archive shows for a past day.
 *
 * A day played on the day comes back finished, exactly as it went. It used to
 * come back as a fresh board whenever the archive had none of its own, which let
 * a day won live be won again for the archive badge and a day lost live be
 * played again for a second chance. Its guesses are only known while `today`
 * still holds them – the next day's first guess replaces that board – so an
 * older one is a finished board with no guesses on it: the result, without the
 * game.
 *
 * A finished catch-up comes back finished in the same way, from its own board
 * while that is kept and from `archiveWonDays` / `archiveLostDays` once the
 * board has been pruned – a pruned board used to reopen as six fresh guesses.
 *
 * Otherwise: the archive's own board if one was started, then a live board the
 * day ended on before it was finished (until the next live guess moves it into
 * the archive – see `stateForDay`), then a fresh one.
 */
export function archiveBoardFor(
  state: DailyGameState,
  day: string,
): DailyBoard {
  const live = state.history[day];
  if (live) {
    const guesses = state.today?.day === day ? state.today.guesses : [];
    return { day, guesses, status: live };
  }

  const board = state.archive[day];
  if (board && board.status !== "playing") return board;

  const finished = archiveResultFor(state, day);
  if (finished) return { day, guesses: board?.guesses ?? [], status: finished };

  return (
    board ??
    unfinishedLiveBoard(state, day) ?? { day, guesses: [], status: "playing" }
  );
}

/**
 * Record a guess against a past puzzle.
 *
 * Deliberately touches nothing but `archive`: no streak, no totals, no
 * distribution. See the note on the field – the streak has to keep meaning
 * "showed up on the day". Only for a day that has ended: a live board left
 * unfinished is picked up from `today` and continued here.
 */
export function recordArchiveGuess(
  state: DailyGameState,
  day: string,
  guess: DailyGuess,
): DailyGameState {
  if (!isDayString(day)) return state;

  const board = archiveBoardFor(state, day);

  // Same two guards as the live board: a finished puzzle takes no more guesses,
  // and repeating one must not cost a life. A day played on the day always comes
  // back finished, so the first guard is also what keeps it from being replayed.
  if (board.status !== "playing") return state;
  if (board.guesses.some((existing) => existing.id === guess.id)) return state;

  const guesses = [...board.guesses, guess];
  const status: DailyStatus = guess.correct
    ? "won"
    : guesses.length >= MAX_GUESSES
      ? "lost"
      : "playing";

  // The board cap limits the guesses kept for display, not results: both lists
  // outlive the boards, which is also what keeps a pruned day from being replayed.
  const archiveWonDays = collectArchiveWonDays(
    [...(state.archiveWonDays ?? []), ...(status === "won" ? [day] : [])],
    state.archive,
    state.history,
  );

  return {
    ...state,
    archive: pruneBoards(
      { ...state.archive, [day]: { day, guesses, status } },
      MAX_ARCHIVE_BOARDS,
      day,
    ),
    archiveWonDays,
    archiveLostDays: collectArchiveLostDays(
      [...(state.archiveLostDays ?? []), ...(status === "lost" ? [day] : [])],
      state.archive,
      state.history,
      archiveWonDays,
    ),
  };
}

export type DayOutcome =
  | "won"
  | "lost"
  | "archive-won"
  | "archive-lost"
  | "missed"
  | "today";

/**
 * How a given day stands, for the calendar grid.
 *
 * A catch-up is its own outcome rather than being folded into a win: a day
 * caught up on later did happen, and showing it is the reward for catching up –
 * but it should not look like the run was never broken. Won and lost are told
 * apart there too; a catch-up that ran out of guesses used to be drawn with the
 * same tick as one that was solved.
 */
export function outcomeForDay(
  state: DailyGameState,
  day: string,
  today: string,
): DayOutcome {
  const recorded = state.history[day];
  if (recorded) return recorded;

  const archived = state.archive[day];
  // The lists outlive the boards: a result stays a result after its board is
  // pruned.
  if (archived?.status === "won" || state.archiveWonDays?.includes(day)) {
    return "archive-won";
  }
  if (archived?.status === "lost" || state.archiveLostDays?.includes(day)) {
    return "archive-lost";
  }

  if (day === today) return "today";

  return "missed";
}

/**
 * Lifetime unique archive wins, including days whose boards were pruned – and
 * never a day that also has a result from the day, however the store says it
 * was won.
 */
export function archiveSolvedCount(state: DailyGameState): number {
  return collectArchiveWonDays(
    state.archiveWonDays,
    state.archive,
    state.history,
  ).length;
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
