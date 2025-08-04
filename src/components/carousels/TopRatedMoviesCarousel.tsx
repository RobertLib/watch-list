import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { convertMovieToMediaItem } from "@/lib/media-converters";
import { CarouselSkeleton } from "@/components/skeletons";

async function TopRatedMoviesContent() {
  const topRatedData = await tmdbServerApi.getTopRatedMovies();

  const items = topRatedData.results.map(convertMovieToMediaItem);

  return <MediaCarousel title="Top Rated Movies" items={items} />;
}

export function TopRatedMoviesCarousel() {
  return (
    <Suspense fallback={<CarouselSkeleton titleWidth="w-56" />}>
      <TopRatedMoviesContent />
    </Suspense>
  );
}
