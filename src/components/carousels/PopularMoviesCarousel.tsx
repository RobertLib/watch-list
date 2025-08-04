import { Suspense } from "react";
import { MediaCarousel } from "../MediaCarousel";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { MediaItem, Movie } from "@/types/tmdb";

// Convert Movie to MediaItem
const convertMovieToMediaItem = (movie: Movie): MediaItem => ({
  ...movie,
  title: movie.title,
  release_date: movie.release_date,
  media_type: "movie" as const,
});

async function PopularMoviesContent() {
  const popularMoviesData = await tmdbServerApi.getPopularMovies();

  const items = popularMoviesData.results.map(convertMovieToMediaItem);

  return (
    <MediaCarousel
      title="Popular Movies"
      items={items}
      preloadProviders={false}
    />
  );
}

function PopularMoviesCarouselSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 bg-gray-700 rounded w-48 animate-pulse" />
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

export function PopularMoviesCarousel() {
  return (
    <Suspense fallback={<PopularMoviesCarouselSkeleton />}>
      <PopularMoviesContent />
    </Suspense>
  );
}
