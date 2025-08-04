import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { convertTVShowToMediaItem } from "@/lib/media-converters";
import { CarouselSkeleton } from "@/components/skeletons";

async function PopularTVShowsContent() {
  let popularTVData;
  try {
    popularTVData = await tmdbServerApi.getPopularTVShows();
  } catch {
    return null;
  }

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
