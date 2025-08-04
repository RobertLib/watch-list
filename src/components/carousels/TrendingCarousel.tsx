import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";

async function TrendingContent() {
  const trendingData = await tmdbServerApi.getTrending("all", "week");

  return (
    <MediaCarousel title="Trending This Week" items={trendingData.results} />
  );
}

function TrendingCarouselSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 bg-gray-700 rounded w-48 animate-pulse" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-48 h-72 bg-gray-700 rounded-lg animate-pulse flex-shrink-0"
          />
        ))}
      </div>
    </div>
  );
}

export function TrendingCarousel() {
  return (
    <Suspense fallback={<TrendingCarouselSkeleton />}>
      <TrendingContent />
    </Suspense>
  );
}
