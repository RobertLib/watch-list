import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { convertTrendingToMediaItem } from "@/lib/media-converters";
import { CarouselSkeleton } from "@/components/skeletons";

async function TrendingContent() {
  const trendingData = await tmdbServerApi.getTrending("all", "week");

  const items = trendingData.results.map(convertTrendingToMediaItem);

  return <MediaCarousel title="Trending This Week" items={items} />;
}

export function TrendingCarousel() {
  return (
    <Suspense fallback={<CarouselSkeleton titleWidth="w-48" />}>
      <TrendingContent />
    </Suspense>
  );
}
