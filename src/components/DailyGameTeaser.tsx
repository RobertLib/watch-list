"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Flame, Puzzle } from "lucide-react";
import {
  effectiveStreak,
  getGameStateSnapshot,
  getServerGameStateSnapshot,
  subscribeToGameState,
} from "@/lib/daily-game";
import { MAX_GUESSES, puzzleNumberForDay, todayUtc } from "@/lib/daily-puzzle";

/**
 * Home-page card for the daily puzzle.
 *
 * This is the return hook: a streak someone does not want to break is a reason to
 * open the site tomorrow that no amount of browsing surface provides. Which is
 * why the card leads with the streak once there is one.
 */
export function DailyGameTeaser() {
  const day = todayUtc();
  // Read straight from the store rather than copied into local state: the card
  // then updates the moment the puzzle is solved, including in another tab.
  const state = useSyncExternalStore(
    subscribeToGameState,
    getGameStateSnapshot,
    getServerGameStateSnapshot,
  );

  const streak = effectiveStreak(state, day);
  const board = state.today?.day === day ? state.today : null;
  const playedToday = board !== null && board.status !== "playing";

  return (
    <Link
      href="/daily"
      prefetch={false}
      className="group flex flex-wrap items-center gap-4 rounded-xl border border-gray-800 bg-linear-to-r from-blue-950/40 to-purple-950/30 p-5 hover:border-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="w-12 h-12 shrink-0 rounded-xl bg-blue-500/15 flex items-center justify-center">
        <Puzzle className="w-6 h-6 text-blue-300" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white group-hover:text-blue-300 transition-colors">
          Daily Film Puzzle
          <span className="text-gray-500 font-normal">
            {" "}
            #{puzzleNumberForDay(day)}
          </span>
        </p>
        <p className="text-sm text-gray-400">
          {playedToday
            ? board?.status === "won"
              ? `Solved today in ${board.guesses.length}/${MAX_GUESSES}. Come back tomorrow.`
              : "Today's puzzle beat you. There is another one tomorrow."
            : board && board.guesses.length > 0
              ? `${MAX_GUESSES - board.guesses.length} guesses left on today's puzzle.`
              : "Guess the film from a blurred still. Six guesses."}
        </p>
      </div>

      {streak > 0 && (
        <span className="flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1.5 text-sm font-semibold text-orange-300 shrink-0">
          <Flame className="w-4 h-4" aria-hidden="true" />
          {streak}
        </span>
      )}

      <span className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white shrink-0 group-hover:bg-white/20 transition-colors">
        {playedToday ? "See result" : board ? "Continue" : "Play"}
      </span>
    </Link>
  );
}
