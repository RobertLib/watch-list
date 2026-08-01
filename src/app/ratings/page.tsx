import type { Metadata } from "next";
import { Star } from "lucide-react";
import { RatedTitles } from "@/components/RatedTitles";

export const metadata: Metadata = {
  title: "Everything You Rated",
  description:
    "Every film and series you have scored, with your score. Kept in this browser, like everything else here.",
  // Built entirely from the visitor's own storage, like the watchlist.
  robots: { index: false, follow: false },
  alternates: { canonical: "https://www.watch-list.me/ratings" },
};

export default function RatingsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Star className="h-8 w-8 text-yellow-400" aria-hidden="true" />
          <h1 className="text-3xl font-bold">Everything you rated</h1>
        </div>
        <p className="text-gray-400">
          Your scores, in one place – whether or not the title is still on your
          watchlist or marked watched.
        </p>
      </div>

      <RatedTitles />
    </div>
  );
}
