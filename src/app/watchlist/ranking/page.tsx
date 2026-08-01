import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Swords } from "lucide-react";
import { WatchlistRanking } from "@/components/WatchlistRanking";

export const metadata: Metadata = {
  title: "Rank Your Watchlist",
  description:
    "Put your watchlist in order by answering one question at a time: which of these two would you rather watch? Ends in a personal top ten you can share.",
  // Every entry is derived from this browser's storage, exactly like the
  // watchlist page it hangs off.
  robots: { index: false, follow: false },
  alternates: {
    canonical: "https://www.watch-list.me/watchlist/ranking",
  },
};

export default function WatchlistRankingPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <Link
          href="/watchlist"
          prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Watchlist
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <Swords className="h-8 w-8 text-purple-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Rank your watchlist</h1>
        </div>
        <p className="text-gray-400">
          Nobody can order eighty films. Everybody can pick between two. Enough
          of those and the order falls out on its own.
        </p>
      </div>

      {/* What it is actually for, before the first pair rather than after.
          Without this the page is two posters and a bar that fills up, which
          answers no question anybody had. */}
      <ol className="mb-8 space-y-2.5 text-sm text-gray-400">
        <li className="flex gap-3">
          <span className="shrink-0 text-purple-400 font-mono">1</span>
          <span>
            You pick between two titles off your own watchlist. Fast, no
            thinking – just the one you would rather put on.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 text-purple-400 font-mono">2</span>
          <span>
            Each answer nudges both titles up or down. Beating something you
            already rate highly counts for more than beating something you
            don&apos;t.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 text-purple-400 font-mono">3</span>
          <span>
            After a couple of dozen rounds your watchlist has a real order –
            a personal top ten you can share as a link, and a first pick for
            the next time you cannot decide.
          </span>
        </li>
      </ol>

      <WatchlistRanking />
    </div>
  );
}
