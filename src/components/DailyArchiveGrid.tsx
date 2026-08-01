"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, Circle, History, X } from "lucide-react";
import {
  getGameStateSnapshot,
  getServerGameStateSnapshot,
  outcomeForDay,
  subscribeToGameState,
  type DailyGameState,
  type DayOutcome,
} from "@/lib/daily-game";
import { puzzleNumberForDay, recentDays, todayUtc } from "@/lib/daily-puzzle";
import { cn } from "@/lib/utils";

// Four months back. The archive grows by a day at a time and nobody scrolls
// further than this; the cap keeps the page from becoming a wall of squares.
const ARCHIVE_DAYS = 120;

/**
 * Every puzzle that has run, and how it went.
 *
 * The point is the gaps. A streak that broke on Tuesday is the most common reason
 * someone stops playing altogether – seeing that Tuesday is still there, one
 * click away, is what turns a lapse back into a habit.
 */
export function DailyArchiveGrid() {
  const state = useSyncExternalStore(
    subscribeToGameState,
    getGameStateSnapshot,
    getServerGameStateSnapshot,
  );

  const today = todayUtc();
  const days = useMemo(() => recentDays(today, ARCHIVE_DAYS), [today]);

  const unplayed = days.filter(
    (day) => outcomeForDay(state, day, today) === "missed",
  ).length;

  return (
    <div className="space-y-6">
      <p className="text-gray-400">
        {days.length} puzzle{days.length === 1 ? "" : "s"} so far
        {unplayed > 0 && (
          <>
            {" · "}
            <span className="text-blue-300">{unplayed} you have not played</span>
          </>
        )}
        . Catching one up counts towards your archive badge, but never towards the
        streak.
      </p>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {days.map((day) => (
          <li key={day}>
            <ArchiveCard day={day} today={today} state={state} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const OUTCOME_TEXT: Record<DayOutcome, string> = {
  won: "Solved",
  lost: "Not solved",
  archived: "Caught up",
  today: "Today",
  missed: "Not played",
};

function ArchiveCard({
  day,
  today,
  state,
}: {
  day: string;
  today: string;
  state: DailyGameState;
}) {
  const outcome = outcomeForDay(state, day, today);
  const isToday = day === today;
  // A day in progress from the archive is neither finished nor untouched, and the
  // card should say "resume" rather than either.
  const inProgress = state.archive[day]?.status === "playing";

  return (
    <Link
      href={isToday ? "/daily" : `/daily/${day}`}
      prefetch={false}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        outcome === "won" && "border-green-500/40 bg-green-500/10",
        outcome === "archived" && "border-blue-500/40 bg-blue-500/10",
        outcome === "lost" && "border-red-500/30 bg-red-500/5",
        (outcome === "missed" || outcome === "today") &&
          "border-gray-800 bg-gray-900/60 hover:border-gray-700 hover:bg-gray-900",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          outcome === "won" && "bg-green-500/20 text-green-300",
          outcome === "archived" && "bg-blue-500/20 text-blue-300",
          outcome === "lost" && "bg-red-500/15 text-red-300",
          (outcome === "missed" || outcome === "today") &&
            "bg-gray-800 text-gray-500",
        )}
      >
        {outcome === "won" || outcome === "archived" ? (
          <Check className="w-4 h-4" aria-hidden="true" />
        ) : outcome === "lost" ? (
          <X className="w-4 h-4" aria-hidden="true" />
        ) : outcome === "today" ? (
          <Circle className="w-4 h-4" aria-hidden="true" />
        ) : (
          <History className="w-4 h-4" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-white truncate">
          #{puzzleNumberForDay(day)}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {day} · {inProgress ? "In progress" : OUTCOME_TEXT[outcome]}
        </p>
      </div>
    </Link>
  );
}
