"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Flame, History, Trophy } from "lucide-react";
import {
  effectiveStreak,
  getGameStateSnapshot,
  getServerGameStateSnapshot,
  outcomeForDay,
  subscribeToGameState,
  type DayOutcome,
} from "@/lib/daily-game";
import { badgesFor, TOTAL_BADGES } from "@/lib/daily-badges";
import { recentDays, todayUtc } from "@/lib/daily-puzzle";
import { cn } from "@/lib/utils";

// Eight weeks. Far enough back to show a run worth protecting, close enough that
// every square still means something to the person looking at it.
const CALENDAR_DAYS = 56;

const OUTCOME_STYLE: Record<DayOutcome, string> = {
  won: "bg-green-500",
  lost: "bg-red-500/70",
  archived: "bg-blue-500/60",
  today: "bg-gray-700 ring-1 ring-blue-400",
  missed: "bg-gray-800",
};

const OUTCOME_LABEL: Record<DayOutcome, string> = {
  won: "solved",
  lost: "played, not solved",
  archived: "caught up later",
  today: "today, not played yet",
  missed: "not played",
};

/**
 * The record behind the streak: which days went how, and what has been earned.
 *
 * A single number ("4 day streak") says nothing about what is at stake tomorrow.
 * A grid does – the run is visible, the gaps are visible, and so is the fact that
 * a gap can be filled in from the archive.
 */
export function DailyStreakPanel() {
  const state = useSyncExternalStore(
    subscribeToGameState,
    getGameStateSnapshot,
    getServerGameStateSnapshot,
  );

  const today = todayUtc();
  const days = useMemo(
    // Oldest first, so the grid reads left to right and today lands last.
    () => recentDays(today, CALENDAR_DAYS).reverse(),
    [today],
  );

  const badges = useMemo(() => badgesFor(state), [state]);
  const earned = badges.filter((badge) => badge.earned);
  const streak = effectiveStreak(state, today);
  const winRate =
    state.played > 0 ? Math.round((state.won / state.played) * 100) : 0;

  // Nothing played and nothing earned – an empty grid and nine grey badges is a
  // worse first impression than no panel at all.
  if (state.played === 0 && Object.keys(state.archive).length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="daily-record-heading"
      className="max-w-2xl mx-auto rounded-xl border border-gray-800 bg-gray-900/60 p-5 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="daily-record-heading"
          className="text-lg font-semibold text-white"
        >
          Your record
        </h2>
        <div className="flex items-center gap-4 text-sm">
          {streak > 0 && (
            <span className="flex items-center gap-1.5 text-orange-300">
              <Flame className="w-4 h-4" aria-hidden="true" />
              {streak}
            </span>
          )}
          {state.bestStreak > 0 && (
            <span className="flex items-center gap-1.5 text-gray-400">
              <Trophy className="w-4 h-4" aria-hidden="true" />
              best {state.bestStreak}
            </span>
          )}
          <span className="text-gray-400">
            {state.played} played · {winRate}% solved
          </span>
        </div>
      </div>

      <div>
        <div
          className="grid grid-flow-col grid-rows-7 gap-1 justify-start"
          role="img"
          aria-label={`Daily puzzle results for the last ${days.length} days: ${
            state.won
          } solved, ${state.played - state.won} missed.`}
        >
          {days.map((day) => {
            const outcome = outcomeForDay(state, day, today);
            return (
              <span
                key={day}
                title={`${day} – ${OUTCOME_LABEL[outcome]}`}
                className={cn("h-3 w-3 rounded-sm", OUTCOME_STYLE[outcome])}
              />
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <Legend className="bg-green-500" label="Solved" />
          <Legend className="bg-red-500/70" label="Missed" />
          <Legend className="bg-blue-500/60" label="From the archive" />
          <Legend className="bg-gray-800" label="Never played" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300">
            Badges{" "}
            <span className="text-gray-500">
              {earned.length}/{TOTAL_BADGES}
            </span>
          </h3>
          <Link
            href="/daily/archive"
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <History className="w-4 h-4" aria-hidden="true" />
            Archive
          </Link>
        </div>

        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {badges.map((badge) => (
            <li
              key={badge.id}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2",
                badge.earned
                  ? "border-yellow-500/30 bg-yellow-500/10"
                  : "border-gray-800 bg-black/30",
              )}
            >
              <span
                aria-hidden="true"
                className={cn("text-lg", !badge.earned && "grayscale opacity-40")}
              >
                {badge.emoji}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-xs font-medium truncate",
                    badge.earned ? "text-yellow-200" : "text-gray-400",
                  )}
                >
                  {badge.label}
                </p>
                <p className="text-[11px] text-gray-500 truncate">
                  {badge.earned
                    ? badge.description
                    : badge.progress
                      ? `${badge.progress.current}/${badge.progress.target}`
                      : badge.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", className)} aria-hidden="true" />
      {label}
    </span>
  );
}
