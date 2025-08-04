import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { convertMovieToMediaItem } from "@/lib/media-converters";
import { CarouselSkeleton } from "@/components/skeletons";

async function PopularMoviesContent() {
  const popularMoviesData = await tmdbServerApi.getPopularMovies();

  const items = popularMoviesData.results.map(convertMovieToMediaItem);

  return <MediaCarousel title="Popular Movies" items={items} />;
}

export function PopularMoviesCarousel() {
  return (
    <Suspense fallback={<CarouselSkeleton titleWidth="w-48" />}>
      <PopularMoviesContent />
    </Suspense>
  );
}
