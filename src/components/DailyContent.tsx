"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, History, Scale } from "lucide-react";
import { DailyGame } from "@/components/DailyGame";
import { DailyStreakPanel } from "@/components/DailyStreakPanel";
import { NotFoundNotice } from "@/components/NotFoundNotice";
import {
  isPlayableDay,
  puzzleNumberForDay,
  todayUtc,
} from "@/lib/daily-puzzle";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

/**
 * The daily puzzle: today's by default, or one out of the archive via `?day=`.
 *
 * Those were two routes. They are one page with a branch now, which is what the
 * query-string addressing buys – and it suits them, because the archived board
 * is the same board with a different header.
 */
export function DailyContent() {
  return (
    <Suspense fallback={<TodaysPuzzle />}>
      <DailyPuzzle />
    </Suspense>
  );
}

function DailyPuzzle() {
  const searchParams = useSearchParams();
  const requestedDay = searchParams.get("day");

  if (!requestedDay) return <TodaysPuzzle />;

  return <ArchivedPuzzle day={requestedDay} />;
}

/**
 * One puzzle out of the archive.
 *
 * A future day is the case that matters: the schedule is a pure function of the
 * date, so serving one would hand out an answer nobody has earned yet.
 */
function ArchivedPuzzle({ day }: { day: string }) {
  const playable = isPlayableDay(day, todayUtc());

  useDocumentTitle(
    playable ? `Daily Puzzle #${puzzleNumberForDay(day)}` : "Puzzle not found",
  );

  if (!playable) {
    return (
      <NotFoundNotice
        title="Puzzle not found"
        description="That is not a day the archive has a puzzle for – tomorrow's is not out yet."
        backHref="/daily/archive"
        backLabel="Browse the archive"
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto mb-8">
        <Link
          href="/daily/archive"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Archive
        </Link>
        <h1 className="text-3xl font-bold mb-2">
          Puzzle #{puzzleNumberForDay(day)}
        </h1>
        <p className="text-gray-400">
          Six guesses, same rules. Each wrong one sharpens the picture and
          unlocks a clue.
        </p>
      </div>

      <DailyGame day={day} />
    </div>
  );
}

function TodaysPuzzle() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">Daily Film Puzzle</h1>
        <p className="text-gray-400">
          One film a day, the same for everybody. Six guesses – each wrong one
          sharpens the picture and unlocks a clue.
        </p>
      </div>

      <DailyGame />

      <div className="mt-10 space-y-8">
        <DailyStreakPanel />

        <div className="max-w-2xl mx-auto grid sm:grid-cols-2 gap-4">
          <Link
            href="/daily/archive"
            prefetch={false}
            className="group rounded-xl border border-gray-800 bg-gray-900/60 p-5 hover:border-gray-700 hover:bg-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <History
              className="w-6 h-6 text-blue-400 mb-3"
              aria-hidden="true"
            />
            <h2 className="font-semibold text-white group-hover:text-blue-300 transition-colors">
              The archive
            </h2>
            <p className="text-sm text-gray-400 mt-1 leading-relaxed">
              Every puzzle that has run so far. A day you missed is still there.
            </p>
          </Link>

          <Link
            href="/daily/higher-lower"
            prefetch={false}
            className="group rounded-xl border border-gray-800 bg-gray-900/60 p-5 hover:border-gray-700 hover:bg-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Scale
              className="w-6 h-6 text-purple-400 mb-3"
              aria-hidden="true"
            />
            <h2 className="font-semibold text-white group-hover:text-purple-300 transition-colors">
              Higher or lower
            </h2>
            <p className="text-sm text-gray-400 mt-1 leading-relaxed">
              Which film scored better? No daily limit – play until you get one
              wrong.
            </p>
          </Link>
        </div>
      </div>

      {/* Part of the static shell, so the page says something to a first
          visitor while the board is still loading. */}
      <section
        aria-labelledby="how-to-play"
        className="max-w-2xl mx-auto mt-16 border-t border-gray-800 pt-8"
      >
        <h2 id="how-to-play" className="text-xl font-semibold text-white mb-3">
          How to play
        </h2>
        <ul className="text-gray-400 space-y-2 text-sm leading-relaxed list-disc pl-5">
          <li>
            You start with a heavily blurred still from one film. Everyone
            playing today gets the same one.
          </li>
          <li>
            Type a title and pick it from the list. Guesses are matched exactly,
            so you never have to worry about spelling or which edition of a
            title counts.
          </li>
          <li>
            Every wrong guess sharpens the image and reveals a clue – decade
            first, then genre, runtime, tagline, director and finally the cast.
          </li>
          <li>
            Win within six guesses to keep your streak. Play tomorrow to extend
            it; skip a day and it starts over.
          </li>
        </ul>
      </section>
    </div>
  );
}
