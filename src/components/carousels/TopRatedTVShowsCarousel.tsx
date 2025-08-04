import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { convertTVShowToMediaItem } from "@/lib/media-converters";
import { CarouselSkeleton } from "@/components/skeletons";

async function TopRatedTVShowsContent() {
  let topRatedData;
  try {
    topRatedData = await tmdbServerApi.getTopRatedTVShows();
  } catch {
    return null;
  }

  const items = topRatedData.results.map(convertTVShowToMediaItem);

  return <MediaCarousel title="Top Rated TV Shows" items={items} />;
}

export function TopRatedTVShowsCarousel() {
  return (
    <Suspense fallback={<CarouselSkeleton titleWidth="w-56" />}>
      <TopRatedTVShowsContent />
    </Suspense>
  );
}
