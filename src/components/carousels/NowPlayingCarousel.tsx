import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { convertMovieToMediaItem } from "@/lib/media-converters";
import { CarouselSkeleton } from "@/components/skeletons";

async function NowPlayingContent() {
  const nowPlayingData = await tmdbServerApi.getNowPlayingMovies();

  const items = nowPlayingData.results.map(convertMovieToMediaItem);

  return <MediaCarousel title="Now Playing in Theaters" items={items} />;
}

export function NowPlayingCarousel() {
  return (
    <Suspense fallback={<CarouselSkeleton titleWidth="w-64" />}>
      <NowPlayingContent />
    </Suspense>
  );
}
