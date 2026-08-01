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
  Search,
  Share2,
  Trophy,
  X,
} from "lucide-react";
import { checkDailyGuess, getDailyPuzzle, searchMulti } from "@/app/actions";
import { toast } from "@/components/Toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import {
  buildShareText,
  effectiveStreak,
  getGameStateSnapshot,
  getServerGameStateSnapshot,
  recordGuess,
  saveGameState,
  stateForDay,
  subscribeToGameState,
  type DailyGameState,
  type DailyGuess,
} from "@/lib/daily-game";
import { MAX_GUESSES, todayUtc } from "@/lib/daily-puzzle";
import { getImageUrl } from "@/lib/tmdb-image";
import { cn } from "@/lib/utils";
import type { DailyPuzzleView } from "@/lib/daily-puzzle-server";
import type { MediaItem } from "@/types/tmdb";

// Enough to type a title; the picker does the rest.
const SEARCH_DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 6;

/**
 * The daily film puzzle.
 *
 * One film a day, the same one for everybody, six guesses, and a streak worth
 * protecting. Guesses are picked from a search box rather than typed free-hand, so
 * a guess is a TMDB id and checking it is exact – no arguing about whether
 * "Star Wars" counts as "Episode IV".
 */
export function DailyGame() {
  const day = todayUtc();
  const [puzzle, setPuzzle] = useState<DailyPuzzleView | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // The board is stored state, read through a store rather than copied into local
  // state – so there is one copy, and a guess made here also updates the card on
  // the home page.
  const stored = useSyncExternalStore(
    subscribeToGameState,
    getGameStateSnapshot,
    getServerGameStateSnapshot,
  );

  // Rolling the board onto today is a derivation, not a write: opening the page
  // must not count as having played.
  const state = useMemo(() => stateForDay(stored, day), [stored, day]);

  const board = state.today;
  const guessCount = board?.guesses.length ?? 0;
  const isOver = board ? board.status !== "playing" : false;

  // Re-asked after every guess: the server decides which hints have been earned,
  // so the answer is never sitting in the page waiting to be found.
  useEffect(() => {
    let isCurrent = true;

    (async () => {
      try {
        const view = await getDailyPuzzle(guessCount, isOver);
        if (isCurrent) setPuzzle(view);
      } catch (error) {
        console.error("Error loading the daily puzzle:", error);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [guessCount, isOver]);

  const submitGuess = useCallback(
    async (item: MediaItem) => {
      if (isOver || isChecking) return;

      setIsChecking(true);
      try {
        const correct = await checkDailyGuess(item.id);
        const guess: DailyGuess = {
          id: item.id,
          title: item.title,
          correct,
        };

        // Written straight to storage; the store notifies and the board re-reads,
        // so there is no local copy that could disagree with what was saved.
        saveGameState(recordGuess(state, day, guess));
      } catch (error) {
        console.error("Error checking the guess:", error);
        toast.showToast("Could not check that guess – try again", "error");
      } finally {
        setIsChecking(false);
      }
    },
    [state, isOver, isChecking, day],
  );

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
        </div>
      </div>

      <PuzzleImage
        day={day}
        step={puzzle.imageStep}
        guessCount={guessCount}
        isOver={isOver}
      />

      <GuessPips guesses={board?.guesses ?? []} />

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
        />
      )}
    </div>
  );
}

function PuzzleImage({
  day,
  step,
  guessCount,
  isOver,
}: {
  day: string;
  step: number;
  guessCount: number;
  isOver: boolean;
}) {
  // The proxy serves a progressively larger TMDB size; the blur on top is polish
  // rather than the protection, which is why it can be pure CSS.
  const blur = isOver ? 0 : Math.max(0, 12 - guessCount * 2);

  return (
    <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-900 border border-gray-800">
      {/* eslint-disable-next-line @next/next/no-img-element -- proxied through our
          own route, which next/image would try to optimise and re-fetch */}
      <img
        src={`/api/daily/image?day=${day}&step=${step}`}
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
  const [results, setResults] = useState<MediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Each keystroke starts its own request and they can return out of order, so
  // only the most recent one is allowed to write to state.
  const runId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const id = ++runId.current;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await searchMulti(trimmed, 1);
        if (id !== runId.current) return;

        setResults(
          response.results
            // The answer is always a film, so shows and people would only ever be
            // wasted guesses.
            .filter((item) => item.media_type === "movie")
            .slice(0, MAX_SUGGESTIONS),
        );
      } catch (error) {
        console.error("Error searching for a guess:", error);
        if (id === runId.current) setResults([]);
      } finally {
        if (id === runId.current) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  function pick(item: MediaItem) {
    onPick(item);
    setQuery("");
    setResults([]);
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
          id="daily-guess"
          type="text"
          autoComplete="off"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a film title…"
          className="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
        />
      </div>

      {isSearching && results.length === 0 && (
        <p className="text-xs text-gray-500 px-1">Searching…</p>
      )}

      {results.length > 0 && (
        <ul className="rounded-lg border border-gray-800 bg-gray-900 divide-y divide-gray-800 overflow-hidden">
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
}: {
  answer: NonNullable<DailyPuzzleView["answer"]>;
  puzzleNumber: number;
  guesses: DailyGuess[];
  status: "won" | "lost";
  state: DailyGameState;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url =
      typeof window === "undefined"
        ? "https://www.watch-list.me/daily"
        : `${window.location.origin}/daily`;
    const text = buildShareText(puzzleNumber, guesses, status, url);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Dismissed – fall through to the clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
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
            className={cn(
              "text-sm font-semibold",
              status === "won" ? "text-green-300" : "text-red-300",
            )}
          >
            {status === "won"
              ? `Got it in ${guesses.length}!`
              : "Out of guesses"}
          </p>
          <Link
            href={`/movie/${answer.slug}`}
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

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-400">
        <span>Played {state.played}</span>
        <span>Won {winRate}%</span>
        {state.bestStreak > 0 && <span>Best streak {state.bestStreak}</span>}
      </div>

      <div className="flex flex-wrap gap-3">
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
        <Link
          href={`/movie/${answer.slug}`}
          prefetch={false}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors"
        >
          <Film className="w-4 h-4" aria-hidden="true" />
          About this film
        </Link>
      </div>

      <p className="flex items-center gap-2 text-xs text-gray-500">
        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
        A new puzzle every day at midnight UTC.
      </p>
    </div>
  );
}
