import type { Metadata } from "next";
import { DailyGame } from "@/components/DailyGame";

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
