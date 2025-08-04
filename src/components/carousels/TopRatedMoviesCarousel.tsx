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
  providers: movie.providers,
});

async function TopRatedMoviesContent() {
  const topRatedData = await tmdbServerApi.getTopRatedMovies();

  const items = topRatedData.results.map(convertMovieToMediaItem);

  return <MediaCarousel title="Top Rated Movies" items={items} />;
}

function TopRatedMoviesCarouselSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 bg-gray-700 rounded w-56 animate-pulse" />
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

export function TopRatedMoviesCarousel() {
  return (
    <Suspense fallback={<TopRatedMoviesCarouselSkeleton />}>
      <TopRatedMoviesContent />
    </Suspense>
  );
}
