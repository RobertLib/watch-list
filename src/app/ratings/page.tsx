import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { Star } from "lucide-react";
import { RatedTitles } from "@/components/RatedTitles";

export const metadata: Metadata = pageMetadata({
  title: "What I Rated",
  description:
    "Every title you have scored out of ten, with the histogram of how you actually rate things.",
  noindex: true,
});

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
