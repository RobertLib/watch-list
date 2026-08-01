import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { WatchStatsContent } from "@/components/WatchStatsContent";

export const metadata: Metadata = {
  title: "Your Watching Stats",
  description:
    "Hours watched, genres you reach for, decades you live in, and how you score what you finish – all worked out from this browser alone.",
  // Every figure comes from the visitor's own storage, like the watchlist.
  robots: { index: false, follow: false },
  alternates: { canonical: "https://www.watch-list.me/stats" },
};

export default function StatsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="h-8 w-8 text-blue-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Your stats</h1>
        </div>
        <p className="text-gray-400">
          Worked out from what this browser holds. Nothing here has been sent
          anywhere.
        </p>
      </div>

      <WatchStatsContent />
    </div>
  );
}
