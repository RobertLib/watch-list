import type { Metadata } from "next";
import Link from "next/link";
import { History, Scale } from "lucide-react";
import { DailyGame } from "@/components/DailyGame";
import { DailyStreakPanel } from "@/components/DailyStreakPanel";

export const metadata: Metadata = {
  title: "Daily Film Puzzle",
  description:
    "Guess the film from a blurred still. One puzzle a day, the same one for everybody, six guesses – and a clue for every wrong one. No account, no sign-up.",
  openGraph: {
    title: "Daily Film Puzzle – WatchList",
    description:
      "Guess the film from a blurred still. One puzzle a day, six guesses, a clue for every wrong one.",
    type: "website",
    url: "https://www.watch-list.me/daily",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Daily Film Puzzle – WatchList",
      },
    ],
  },
  keywords: [
    "movie guessing game",
    "daily film puzzle",
    "guess the movie",
    "film quiz",
    "movie trivia game",
    "daily movie game",
  ],
  twitter: {
    card: "summary_large_image",
    title: "Daily Film Puzzle – WatchList",
    description:
      "Guess the film from a blurred still. One puzzle a day, six guesses.",
    images: ["/opengraph-image.png"],
  },
  alternates: {
    canonical: "https://www.watch-list.me/daily",
  },
};

export default function DailyPage() {
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
            <Scale className="w-6 h-6 text-purple-400 mb-3" aria-hidden="true" />
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

      {/* Server-rendered so the page says something to a crawler, and to a first
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
            You start with a heavily blurred still from one film. Everyone playing
            today gets the same one.
          </li>
          <li>
            Type a title and pick it from the list. Guesses are matched exactly, so
            you never have to worry about spelling or which edition of a title
            counts.
          </li>
          <li>
            Every wrong guess sharpens the image and reveals a clue – decade first,
            then genre, runtime, tagline, director and finally the cast.
          </li>
          <li>
            Win within six guesses to keep your streak. Play tomorrow to extend it;
            skip a day and it starts over.
          </li>
        </ul>
      </section>
    </div>
  );
}
