import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { convertTVShowToMediaItem } from "@/lib/media-converters";
import { CarouselSkeleton } from "@/components/skeletons";

async function AiringTodayContent() {
  let airingData;
  try {
    airingData = await tmdbServerApi.getAiringTodayTVShows();
  } catch {
    return null;
  }

  const items = airingData.results.map(convertTVShowToMediaItem);

  return <MediaCarousel title="Airing Today" items={items} />;
}

export function AiringTodayCarousel() {
  return (
    <Suspense fallback={<CarouselSkeleton titleWidth="w-36" />}>
      <AiringTodayContent />
    </Suspense>
  );
}
