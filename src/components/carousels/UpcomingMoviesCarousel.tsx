import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { convertMovieToMediaItem } from "@/lib/media-converters";
import { CarouselSkeleton } from "@/components/skeletons";

async function UpcomingMoviesContent() {
  let upcomingData;
  try {
    upcomingData = await tmdbServerApi.getUpcomingMovies();
  } catch {
    return null;
  }

  const items = upcomingData.results.map(convertMovieToMediaItem);

  return <MediaCarousel title="Coming Soon to Theaters" items={items} />;
}

export function UpcomingMoviesCarousel() {
  return (
    <Suspense fallback={<CarouselSkeleton titleWidth="w-60" />}>
      <UpcomingMoviesContent />
    </Suspense>
  );
}
