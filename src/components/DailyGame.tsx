"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Check,
  Clock,
  Film,
  Flame,
  History,
  RotateCcw,
  Search,
  Share2,
  Trophy,
  X,
} from "lucide-react";
import { checkDailyGuess, getDailyPuzzle, searchMovies } from "@/lib/api";
import { toast } from "@/components/Toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { useTransientFlag } from "@/hooks/useTransientFlag";
import { useUtcDay } from "@/hooks/useUtcDay";
import {
  archiveBoardFor,
  buildShareText,
  effectiveStreak,
  getGameStateSnapshot,
  getServerGameStateSnapshot,
  playedOnTheDay,
  recordArchiveGuess,
  recordGuess,
  saveGameState,
  stateForDay,
  subscribeToGameState,
  type DailyBoard,
  type DailyGameState,
  type DailyGuess,
} from "@/lib/daily-game";
import { MAX_GUESSES, puzzleNumberForDay, todayUtc } from "@/lib/daily-puzzle";
import { NextPuzzleCountdown } from "@/components/NextPuzzleCountdown";
import { getImageUrl } from "@/lib/tmdb-image";
import { cn } from "@/lib/utils";
import type { DailyPuzzleView } from "@/lib/daily-puzzle-data";
import type { MediaItem } from "@/types/tmdb";
import { absoluteUrl, movieHref } from "@/lib/routes";
import {
  DEFAULT_PROFILE_ID,
  getActiveProfileId,
  subscribeProfiles,
} from "@/lib/profiles";
import { withProfileStorage } from "@/lib/profile-storage";
import { withProfileRosterLock } from "@/lib/profile-roster-lock";

// Enough to type a title; the picker does the rest.
const SEARCH_DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 6;
// Below this the box is not worth a round trip, and the suggestion list stays
// closed. Shared by the effect and the derivation that empties the list.
const MIN_QUERY_LENGTH = 2;
const NO_SUGGESTIONS: MediaItem[] = [];
const getServerProfileId = () => DEFAULT_PROFILE_ID;
// Long enough to read a sentence about where a guess went; the default three
// seconds is for "saved".
const LATE_GUESS_TOAST_MS = 10_000;

type SaveOutcome =
  | "saved"
  | "refused"
  | "skipped"
  | "unavailable"
  /** Landed after its day ended, on that day's archive board. */
  | "late"
  /** Landed after its day ended, and the archive board could not take it. */
  | "late-skipped";

/** What a screen reader hears once a guess is on the board. */
function describeGuess(title: string, board: DailyBoard): string {
  const used = board.guesses.length;
  const left = MAX_GUESSES - used;

  if (board.status === "won") {
    return `${title} is right. Solved in ${used} ${used === 1 ? "guess" : "guesses"}.`;
  }
  if (board.status === "lost") return `${title} is not it. Out of guesses.`;
  return `${title} is not it. ${left} ${left === 1 ? "guess" : "guesses"} remaining.`;
}

/** The toast for a guess that arrived after midnight UTC closed its puzzle. */
function describeLateGuess(
  day: string,
  title: string,
  board: DailyBoard | null,
): string {
  const closed = `Puzzle #${puzzleNumberForDay(day)} closed at midnight UTC before your guess was saved.`;

  if (!board) {
    return `${closed} The puzzle was already finished or had that guess, so ${title} was not counted.`;
  }
  if (board.status === "won") {
    return `${closed} ${title} was right – it is saved to that puzzle in the archive as a catch-up, not towards your streak.`;
  }
  if (board.status === "lost") {
    return `${closed} ${title} was not it, and was the last guess on that puzzle in the archive.`;
  }
  return `${closed} ${title} is saved to that puzzle in the archive – finish it there, though it no longer counts towards your streak.`;
}

/**
 * The daily film puzzle.
 *
 * One film a day, the same one for everybody, six guesses, and a streak worth
 * protecting. Guesses are picked from a search box rather than typed free-hand, so
 * a guess is a TMDB id and checking it is exact – no arguing about whether
 * "Star Wars" counts as "Episode IV".
 *
 * The same board plays an archived day when one is passed in. Only the bookkeeping
 * differs: an archive result is kept apart from the streak, because a streak has
 * to keep meaning "turned up on the day" rather than "worked through the back
 * catalogue". A past day that was played on the day is not replayed at all – the
 * board shows how it finished.
 */
export function DailyGame({ day: requestedDay }: { day?: string } = {}) {
  const profileId = useSyncExternalStore(
    subscribeProfiles,
    getActiveProfileId,
    getServerProfileId,
  );
  // Kept current across UTC midnight, so a tab left open overnight rolls onto
  // the new puzzle instead of offering yesterday's until something else
  // happens to re-render it.
  const today = useUtcDay();
  const day = requestedDay ?? today;
  const isArchive = day !== today;

  // A different day or profile owns a different board. Remount before loading
  // it so earned hints, revealed artwork and pending guesses cannot carry into
  // another person's game, even if that person's puzzle cannot be fetched.
  return (
    <PuzzleBoard
      key={`${profileId}-${day}-${isArchive}`}
      profileId={profileId}
      day={day}
      isArchive={isArchive}
    />
  );
}

function PuzzleBoard({
  profileId,
  day,
  isArchive,
}: {
  profileId: string;
  day: string;
  isArchive: boolean;
}) {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const [loadedPuzzle, setLoadedPuzzle] = useState<{
    view: DailyPuzzleView;
    guessCount: number;
    isOver: boolean;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const checking = useRef(false);
  // The puzzle could not be fetched. A rejected load used to be logged and
  // nothing else, which left the spinner up for as long as the tab was open.
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumped by "Try again" – a dependency of the effect below, and the whole of
  // the retry mechanism. Nothing else reads it.
  const [attempt, setAttempt] = useState(0);

  // The board is stored state, read through a store rather than copied into local
  // state – so there is one copy, and a guess made here also updates the card on
  // the home page.
  const stored = useSyncExternalStore(
    subscribeToGameState,
    getGameStateSnapshot,
    getServerGameStateSnapshot,
  );

  // Rolling the board onto today is a derivation, not a write: opening the page
  // must not count as having played. An archived day leaves `today` alone – it
  // may well be a board still in progress.
  const state = useMemo(
    () => (isArchive ? stored : stateForDay(stored, day)),
    [stored, day, isArchive],
  );

  // A past day already played on the day is shown as it finished and never
  // reopened; `archiveBoardFor` hands it back finished, which is what keeps the
  // picker away. It is only a catch-up when it was missed.
  const board = isArchive ? archiveBoardFor(state, day) : state.today;
  const playedLive = isArchive && playedOnTheDay(state, day);
  const guessCount = board?.guesses.length ?? 0;
  const isOver = board ? board.status !== "playing" : false;
  // What a screen reader hears after a guess. Rendered into a region that is
  // always there, because a live region mounted with its text is not announced.
  const [announcement, setAnnouncement] = useState("");
  // Set when a guess here finishes the board: the picker that had focus goes
  // away with it, so the result takes focus once it is on screen.
  const [finishedHere, setFinishedHere] = useState(false);

  // A restore or reset in another tab can also rewind this profile's board.
  // Retain an older view only while its clues and artwork are still earned.
  const puzzle = loadedPuzzle &&
    loadedPuzzle.guessCount <= guessCount &&
    (!loadedPuzzle.isOver || isOver)
    ? loadedPuzzle.view
    : null;

  // Re-asked after every guess: the server decides which hints have been earned,
  // so the answer is never sitting in the page waiting to be found.
  useEffect(() => {
    let isCurrent = true;

    (async () => {
      try {
        const view = await getDailyPuzzle(day, guessCount, isOver);
        if (!isCurrent) return;
        if (!view) throw new Error("The daily puzzle could not be loaded");
        setLoadedPuzzle({ view, guessCount, isOver });
        setLoadFailed(false);
      } catch (error) {
        console.error("Error loading the daily puzzle:", error);
        if (isCurrent) setLoadFailed(true);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [day, guessCount, isOver, attempt]);

  const retryLoad = useCallback(() => {
    setLoadFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!loadFailed) return;

    window.addEventListener("online", retryLoad);
    return () => window.removeEventListener("online", retryLoad);
  }, [loadFailed, retryLoad]);

  const checkProfile = useCallback((announceChange: boolean) => {
    try {
      if (getActiveProfileId({ strict: true }) === profileId) return true;
    } catch {
      toast.showToast(
        "Could not check your active profile. Reload the page and try again.",
        "error",
      );
      return false;
    }

    if (announceChange) {
      toast.showToast(
        "Your active profile changed. Review the current puzzle and try again.",
        "info",
      );
    }
    return false;
  }, [profileId]);

  const submitGuess = useCallback(
    async (item: MediaItem) => {
      if (isOver || checking.current) return;
      // Storage events from another tab can arrive after this click. The
      // rendered board owns the guess, even if the live keys already moved on.
      if (!checkProfile(true)) return;

      checking.current = true;
      setIsChecking(true);
      try {
        const correct = await checkDailyGuess(day, item.id);
        // A check can finish after midnight or after opening another archived
        // day or switching profiles in another tab.
        //
        // Midnight is the one that keeps the guess. The live board remounts onto
        // the new puzzle then, and a guess still in flight used to vanish with
        // it – no save, no word. It belongs to a day that has ended, so it goes
        // where that day's unfinished board goes: the archive, which continues
        // it without counting towards the streak. Leaving the page or opening
        // another day while the day is still running discards it, as before.
        const dayEnded = () => !isArchive && todayUtc() > day;
        if ((!isMounted.current && !dayEnded()) || !checkProfile(false)) return;
        const guess: DailyGuess = {
          id: item.id,
          title: item.title,
          correct,
        };

        // Hold the same lock as other tabs' guesses and restores, then read the
        // latest board. A request queued for the lock can outlive this board.
        // Widened rather than narrowed to null: it is assigned in the callback.
        let landed = null as DailyBoard | null;
        const saved = await withProfileRosterLock<SaveOutcome>(() => {
          const late = dayEnded();
          if ((!isMounted.current && !late) || !checkProfile(false)) return "skipped";
          // A clock that went backwards past midnight: no day to record against.
          if (!isArchive && todayUtc() < day) return "skipped";
          return withProfileStorage(profileId, () => {
            const latestState = getGameStateSnapshot({ strict: true });
            if (!isArchive && !late && latestState.today && latestState.today.day > day) return "skipped";
            // A late guess never reaches the live board, so it can neither
            // record a result for the day nor touch the streak.
            const onArchive = isArchive || late;
            const nextState = onArchive
              ? recordArchiveGuess(latestState, day, guess)
              : recordGuess(latestState, day, guess);
            if (nextState === latestState) return late ? "late-skipped" : "skipped";

            // The store notifies and the board re-reads only after saving.
            if (!saveGameState(nextState)) return "refused";
            landed = onArchive ? nextState.archive[day] ?? null : nextState.today;
            return late ? "late" : "saved";
          });
        }, "unavailable");
        if ((saved === "late" || saved === "late-skipped") && checkProfile(false)) {
          toast.showToast(
            describeLateGuess(day, item.title, landed),
            "info",
            LATE_GUESS_TOAST_MS,
          );
        }
        if (saved === "saved" && landed && isMounted.current) {
          setAnnouncement(describeGuess(item.title, landed));
          if (landed.status !== "playing") setFinishedHere(true);
        }
        // Said even after a midnight remount: that guess was kept on purpose,
        // so losing it to storage is not something to keep quiet about either.
        if ((saved === "refused" || saved === "unavailable") && (isMounted.current || dayEnded()) && checkProfile(false)) {
          toast.showToast(
            saved === "refused"
              ? "Could not save that guess. Check your browser's storage settings and try again."
              : "Could not safely save that guess. Reload the page and try again.",
            "error",
          );
        }
      } catch (error) {
        if (!isMounted.current || !checkProfile(false)) return;
        console.error("Error checking the guess:", error);
        toast.showToast("Could not check that guess – try again", "error");
      } finally {
        checking.current = false;
        if (isMounted.current) setIsChecking(false);
      }
    },
    [isOver, day, isArchive, checkProfile, profileId],
  );

  // Only when there is nothing to show instead. A re-ask that fails *after* a
  // guess leaves the previous view on screen – stale hints beat a blank board.
  if (loadFailed && !puzzle) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 space-y-4">
        <p className="text-gray-400">
          Could not load {isArchive ? "that" : "today's"} puzzle just now.
        </p>
        <button
          onClick={retryLoad}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }

  if (!puzzle) {
    return (
      <div className="py-16">
        <LoadingSpinner />
      </div>
    );
  }

  const streak = effectiveStreak(state, day);
  const remaining = MAX_GUESSES - guessCount;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400">
          Puzzle #{puzzle.number} · {day}
        </p>
        <div className="flex items-center gap-4 text-sm">
          {isArchive ? (
            <span className="flex items-center gap-1.5 text-gray-400">
              <History className="w-4 h-4" aria-hidden="true" />
              From the archive
            </span>
          ) : (
            <>
              {streak > 0 && (
                <span className="flex items-center gap-1.5 text-orange-300">
                  <Flame className="w-4 h-4" aria-hidden="true" />
                  {streak} day streak
                </span>
              )}
              {state.bestStreak > 0 && (
                <span className="flex items-center gap-1.5 text-gray-400">
                  <Trophy className="w-4 h-4" aria-hidden="true" />
                  best {state.bestStreak}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {isArchive && (
        <p className="text-sm text-gray-500 rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3">
          {playedLive ? (
            <>
              You played puzzle #{puzzleNumberForDay(day)} on {day}, the day it
              ran, so it stays as it finished. The archive is for catching up on
              the days you missed.
            </>
          ) : (
            <>
              Puzzle #{puzzleNumberForDay(day)} originally ran on {day}. It
              counts towards your archive badge, but not towards the streak –
              that one is for turning up on the day.
            </>
          )}
        </p>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {loadFailed && (
        <LoadFailureNotice
          compact
          title="Could not refresh this puzzle"
          description={
            isOver
              ? "Your result is saved. Try again to reveal the film and share your result."
              : "Your guesses are saved. Try again to load the latest clue and picture."
          }
          onRetry={retryLoad}
        />
      )}

      <PuzzleImage
        src={puzzle.imageUrl}
        guessCount={guessCount}
        isOver={isOver}
      />

      {/* A result kept without its board has no guesses to draw, and six empty
          pips would read as a day never played. */}
      {!(isOver && guessCount === 0) && (
        <GuessPips guesses={board?.guesses ?? []} />
      )}

      {!isOver && (
        <>
          <GuessPicker
            onPick={submitGuess}
            disabled={isChecking}
            alreadyGuessed={new Set((board?.guesses ?? []).map((g) => g.id))}
          />
          <p className="text-sm text-gray-500 text-center">
            {remaining} guess{remaining === 1 ? "" : "es"} left. Each wrong one
            sharpens the image and unlocks a clue.
          </p>
        </>
      )}

      <Hints hints={puzzle.hints} />

      {board && board.guesses.length > 0 && (
        <ol className="space-y-2">
          {board.guesses.map((guess, index) => (
            <li
              key={guess.id}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm",
                guess.correct
                  ? "border-green-500/50 bg-green-500/10 text-green-200"
                  : "border-gray-800 bg-gray-900/60 text-gray-300",
              )}
            >
              <span className="text-gray-500 font-mono text-xs shrink-0">
                {index + 1}
              </span>
              {guess.correct ? (
                <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <X className="w-4 h-4 shrink-0 text-red-400" aria-hidden="true" />
              )}
              {/* The icons are the only other place this is said. */}
              <span className="sr-only">
                {guess.correct ? "Right:" : "Wrong:"}
              </span>
              <span className="truncate">{guess.title}</span>
            </li>
          ))}
        </ol>
      )}

      {board && board.status !== "playing" && puzzle.answer && (
        <Result
          answer={puzzle.answer}
          puzzleNumber={puzzle.number}
          guesses={board.guesses}
          status={board.status}
          state={state}
          isArchive={isArchive}
          playedLive={playedLive}
          takeFocus={finishedHere}
        />
      )}
    </div>
  );
}

function PuzzleImage({
  src,
  guessCount,
  isOver,
}: {
  src: string | null;
  guessCount: number;
  isOver: boolean;
}) {
  // The URL already names a progressively larger TMDB size; the blur on top is
  // polish rather than protection, which is why it can be pure CSS.
  const blur = isOver ? 0 : Math.max(0, 12 - guessCount * 2);

  if (!src) {
    return (
      <div className="aspect-video rounded-xl bg-gray-900 border border-gray-800" />
    );
  }

  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-900 border border-gray-800">
      {/* eslint-disable-next-line @next/next/no-img-element -- the size is chosen
          per guess, which is exactly what next/image would try to override */}
      <img
        src={src}
        alt={
          isOver
            ? "Today's film"
            : "A blurred still from today's film, sharpening with each guess"
        }
        className="w-full h-full object-cover transition-[filter] duration-500"
        style={{ filter: blur > 0 ? `blur(${blur}px)` : undefined }}
      />
    </div>
  );
}

function GuessPips({ guesses }: { guesses: DailyGuess[] }) {
  return (
    <div className="flex justify-center gap-2" aria-hidden="true">
      {Array.from({ length: MAX_GUESSES }).map((_, index) => {
        const guess = guesses[index];
        return (
          <span
            key={index}
            className={cn(
              "h-2.5 w-8 rounded-full",
              !guess && "bg-gray-800",
              guess?.correct && "bg-green-500",
              guess && !guess.correct && "bg-red-500/70",
            )}
          />
        );
      })}
    </div>
  );
}

function GuessPicker({
  onPick,
  disabled,
  alreadyGuessed,
}: {
  onPick: (item: MediaItem) => void;
  disabled: boolean;
  alreadyGuessed: Set<number>;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<MediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Each keystroke starts its own request and they can return out of order, so
  // only the most recent one is allowed to write to state.
  const runId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  function updateQuery(value: string) {
    if (value === query) return;

    // Include edits below the search threshold and picking a suggestion:
    // neither starts another request that could supersede an old answer.
    runId.current += 1;
    setQuery(value);
    if (value.trim().length < MIN_QUERY_LENGTH) {
      setFound([]);
      setIsSearching(false);
    }
  }

  const trimmed = query.trim();
  // Keep suggestions while another searchable query is being debounced. A
  // shorter query clears them in its input handler and never shows a list.
  const results = trimmed.length < MIN_QUERY_LENGTH ? NO_SUGGESTIONS : found;

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) return;

    const id = ++runId.current;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Films only, asked of the film search. The answer is always a film, and
        // filtering a mixed page instead lost the film outright whenever series
        // and people filled that page ("Friends", "Ray").
        const response = await searchMovies(trimmed, 1);
        if (id !== runId.current) return;

        setFound(response.results.slice(0, MAX_SUGGESTIONS));
      } catch (error) {
        console.error("Error searching for a guess:", error);
        if (id === runId.current) setFound([]);
      } finally {
        if (id === runId.current) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      runId.current += 1;
    };
  }, [query]);

  function pick(item: MediaItem) {
    if (disabled) return;

    // Clearing the query empties the list, and a suggestion that had focus goes
    // with it – focus fell to the page. It goes back to the box, where the next
    // guess is typed. Only when focus was in the list: a tap that never focused
    // the button (iOS) should not pop the keyboard back up.
    const focusWasInList = listRef.current?.contains(document.activeElement) ?? false;

    onPick(item);
    updateQuery("");
    if (focusWasInList) inputRef.current?.focus();
  }

  return (
    <div className="space-y-2">
      <label htmlFor="daily-guess" className="sr-only">
        Guess the film
      </label>
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id="daily-guess"
          type="text"
          autoComplete="off"
          value={query}
          // Native disabled blurs the focused box in browsers, which is exactly
          // where focus has just been put back after a pick. Read-only keeps it
          // focusable while a guess is being saved; the handlers refuse input.
          readOnly={disabled}
          aria-disabled={disabled}
          onChange={(event) => {
            if (!disabled) updateQuery(event.target.value);
          }}
          placeholder="Type a film title…"
          className="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 aria-disabled:opacity-60 aria-disabled:cursor-wait"
        />
      </div>

      {isSearching && results.length === 0 && (
        <p className="text-xs text-gray-500 px-1">Searching…</p>
      )}

      {results.length > 0 && (
        <ul
          ref={listRef}
          className="rounded-lg border border-gray-800 bg-gray-900 divide-y divide-gray-800 overflow-hidden"
        >
          {results.map((item) => {
            const guessed = alreadyGuessed.has(item.id);
            return (
              <li key={item.id}>
                <button
                  onClick={() => pick(item)}
                  disabled={disabled || guessed}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:bg-white/10"
                >
                  <Film className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
                  <span className="text-sm text-white truncate">
                    {item.title}
                  </span>
                  {item.release_date && (
                    <span className="text-xs text-gray-500 shrink-0">
                      {item.release_date.slice(0, 4)}
                    </span>
                  )}
                  {guessed && (
                    <span className="text-xs text-gray-500 ml-auto shrink-0">
                      already guessed
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Hints({ hints }: { hints: DailyPuzzleView["hints"] }) {
  const rows: Array<{ label: string; value: string }> = [];

  if (hints.decade) rows.push({ label: "Released", value: `The ${hints.decade}` });
  if (hints.genres?.length) {
    rows.push({ label: "Genre", value: hints.genres.join(", ") });
  }
  if (hints.runtime) {
    rows.push({ label: "Runtime", value: `${hints.runtime} minutes` });
  }
  // A film with no tagline on TMDB still spends its rung – saying so is honest,
  // and silently skipping to the cast would give away a stronger clue early.
  if ("tagline" in hints) {
    rows.push({
      label: "Tagline",
      value: hints.tagline || "No tagline on record",
    });
  }
  if ("director" in hints) {
    rows.push({
      label: "Directed by",
      value: hints.director || "Not credited on TMDb",
    });
  }
  if (hints.cast?.length) {
    rows.push({ label: "Starring", value: hints.cast.join(", ") });
  }

  if (rows.length === 0) return null;

  return (
    <dl className="rounded-xl border border-gray-800 bg-gray-900/60 divide-y divide-gray-800">
      {rows.map((row) => (
        <div key={row.label} className="flex gap-4 px-4 py-3 text-sm">
          <dt className="text-gray-500 w-28 shrink-0">{row.label}</dt>
          <dd className="text-white">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Result({
  answer,
  puzzleNumber,
  guesses,
  status,
  state,
  isArchive,
  playedLive,
  takeFocus,
}: {
  answer: NonNullable<DailyPuzzleView["answer"]>;
  puzzleNumber: number;
  guesses: DailyGuess[];
  status: "won" | "lost";
  state: DailyGameState;
  isArchive: boolean;
  /** An archived day that was played on the day, shown as it finished. */
  playedLive: boolean;
  /** The guess that finished the board was made here, and its picker is gone. */
  takeFocus: boolean;
}) {
  const [copied, markCopied] = useTransientFlag(2500);
  const heading = useRef<HTMLParagraphElement>(null);
  // A result from the day kept without its board: the outcome is known, the
  // guesses that led there are not.
  const resultOnly = guesses.length === 0;

  useEffect(() => {
    if (takeFocus) heading.current?.focus();
  }, [takeFocus]);

  async function share() {
    // Always the front door, never the archived day – a link to the exact puzzle
    // would spoil it for whoever follows it.
    const url =
      typeof window === "undefined"
        ? absoluteUrl("/daily")
        : `${window.location.origin}/daily`;
    // A day played on the day is no catch-up, wherever it is shared from.
    const text = buildShareText(
      puzzleNumber,
      guesses,
      status,
      url,
      isArchive && !playedLive,
    );

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (error) {
        // A dismissed sheet is intentional; a refused or unsupported share
        // still falls through to the clipboard. Treating a dismissal the same
        // way sent a cancelled share on to a clipboard write that iOS refuses
        // outside the gesture – and an error toast for having changed your mind.
        if (
          error !== null && typeof error === "object" &&
          "name" in error && error.name === "AbortError"
        ) return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch {
      toast.showToast("Could not copy your result", "error");
    }
  }

  const winRate =
    state.played > 0 ? Math.round((state.won / state.played) * 100) : 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-5 space-y-4",
        status === "won"
          ? "border-green-500/40 bg-green-500/10"
          : "border-gray-700 bg-gray-900/60",
      )}
    >
      <div className="flex items-start gap-4">
        <div className="relative w-16 aspect-2/3 shrink-0 rounded-lg overflow-hidden bg-gray-800">
          {answer.posterPath && (
            <Image
              src={getImageUrl(answer.posterPath, "w185")}
              alt={answer.title}
              fill
              className="object-cover"
            />
          )}
        </div>
        <div className="min-w-0">
          <p
            ref={heading}
            tabIndex={-1}
            className={cn(
              "text-sm font-semibold focus:outline-none",
              status === "won" ? "text-green-300" : "text-red-300",
            )}
          >
            {status === "won"
              ? resultOnly
                ? "Solved on the day"
                : `Got it in ${guesses.length}!`
              : resultOnly
                ? "Not solved on the day"
                : "Out of guesses"}
          </p>
          <Link
            href={movieHref(answer.slug)}
            prefetch={false}
            className="text-lg font-bold text-white hover:text-blue-300 transition-colors"
          >
            {answer.title}
          </Link>
          {answer.year && (
            <span className="text-gray-400 text-sm ml-2">{answer.year}</span>
          )}
          {answer.overview && (
            <p className="text-sm text-gray-400 mt-1 line-clamp-3 leading-relaxed">
              {answer.overview}
            </p>
          )}
        </div>
      </div>

      {!isArchive && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-400">
          <span>Played {state.played}</span>
          <span>Won {winRate}%</span>
          {state.bestStreak > 0 && <span>Best streak {state.bestStreak}</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {/* The grid is the whole of a shared result; without the guesses there
            is nothing to post. */}
        {!resultOnly && (
          <button
            onClick={share}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {copied ? (
              <Check className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Share2 className="w-4 h-4" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Share result"}
          </button>
        )}
        <Link
          href={movieHref(answer.slug)}
          prefetch={false}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors"
        >
          <Film className="w-4 h-4" aria-hidden="true" />
          About this film
        </Link>
        <Link
          href="/daily/archive"
          prefetch={false}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors"
        >
          <History className="w-4 h-4" aria-hidden="true" />
          {isArchive ? "Back to the archive" : "Play an older one"}
        </Link>
      </div>

      {/* The one moment a countdown is worth showing: the board is finished, and
          the honest answer to "what now" is a time. */}
      {!isArchive && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          Next puzzle in <NextPuzzleCountdown />
        </p>
      )}
    </div>
  );
}
