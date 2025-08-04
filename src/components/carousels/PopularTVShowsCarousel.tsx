import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { MediaItem, TVShow } from "@/types/tmdb";

// Convert TVShow to MediaItem
const convertTVShowToMediaItem = (show: TVShow): MediaItem => ({
  ...show,
  title: show.name,
  release_date: show.first_air_date,
  media_type: "tv" as const,
});

async function PopularTVShowsContent() {
  const popularTVData = await tmdbServerApi.getPopularTVShows();

  const items = popularTVData.results.map(convertTVShowToMediaItem);

  return (
    <MediaCarousel
      title="Popular TV Shows"
      items={items}
      preloadProviders={false}
    />
  );
}

function PopularTVShowsCarouselSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 bg-gray-700 rounded w-52 animate-pulse" />
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

export function PopularTVShowsCarousel() {
  return (
    <Suspense fallback={<PopularTVShowsCarouselSkeleton />}>
      <PopularTVShowsContent />
    </Suspense>
  );
}
