import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { convertTVShowToMediaItem } from "@/lib/media-converters";
import { CarouselSkeleton } from "@/components/skeletons";

async function PopularTVShowsContent() {
  const popularTVData = await tmdbServerApi.getPopularTVShows();

  const items = popularTVData.results.map(convertTVShowToMediaItem);

  return <MediaCarousel title="Popular TV Shows" items={items} />;
}

export function PopularTVShowsCarousel() {
  return (
    <Suspense fallback={<CarouselSkeleton titleWidth="w-52" />}>
      <PopularTVShowsContent />
    </Suspense>
  );
}
