import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DailyGame } from "@/components/DailyGame";
import {
  isPlayableDay,
  puzzleNumberForDay,
  todayUtc,
} from "@/lib/daily-puzzle";

interface PageProps {
  params: Promise<{ day: string }>;
}

/**
 * One puzzle out of the archive.
 *
 * `force-dynamic` because the set of playable days changes at midnight and a
 * prerendered "not found" for today would outlive its truth by a day.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { day } = await params;

  if (!isPlayableDay(day, todayUtc())) {
    return { title: "Puzzle not found", robots: { index: false, follow: false } };
  }

  return {
    title: `Daily Puzzle #${puzzleNumberForDay(day)}`,
    description: `The WatchList daily film puzzle from ${day}. Guess the film from a blurred still in six goes.`,
    // Not indexed, and not for the usual reason. There is nothing private here –
    // but the archive is one page per day forever, each of them thin and nearly
    // identical, and a crawler working through them is the definition of wasted
    // crawl budget. `/daily/archive` is the page worth ranking.
    robots: { index: false, follow: true },
  };
}

export default async function ArchivedPuzzlePage({ params }: PageProps) {
  const { day } = await params;

  // A future day is the case that matters: the schedule is a pure function of the
  // date, so serving one would hand out an answer nobody has earned yet.
  if (!isPlayableDay(day, todayUtc())) notFound();

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
