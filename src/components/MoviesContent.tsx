import { Suspense } from "react";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { PaginatedMovieSection } from "@/components/PaginatedMovieSection";
import { FilteredMovieSection } from "@/components/FilteredMovieSection";
import { LoadingSection } from "@/components/LoadingSpinner";
import {
  getPopularMovies,
  getTopRatedMovies,
  getNowPlayingMovies,
} from "@/app/actions";

async function MoviesDataWrapper() {
  const [popular, topRated, nowPlaying] = await Promise.all([
    tmdbServerApi.getPopularMovies(1),
    tmdbServerApi.getTopRatedMovies(1),
    tmdbServerApi.getNowPlayingMovies(1),
  ]);

  return (
    <>
      <FilteredMovieSection
        title="Discover Movies"
        initialMovies={popular.results}
        initialTotalPages={popular.total_pages}
      />
      <PaginatedMovieSection
        title="Popular Movies"
        fetchFunction={getPopularMovies}
        initialMovies={popular.results}
        initialTotalPages={popular.total_pages}
      />
      <PaginatedMovieSection
        title="Top Rated Movies"
        fetchFunction={getTopRatedMovies}
        initialMovies={topRated.results}
        initialTotalPages={topRated.total_pages}
      />
      <PaginatedMovieSection
        title="Now Playing"
        fetchFunction={getNowPlayingMovies}
        initialMovies={nowPlaying.results}
        initialTotalPages={nowPlaying.total_pages}
      />
    </>
  );
}

function MoviesLoadingFallback() {
  return (
    <>
      <LoadingSection title="Discover Movies" rows={2} cols={6} />
      <LoadingSection title="Popular Movies" rows={2} cols={6} />
      <LoadingSection title="Top Rated Movies" rows={2} cols={6} />
      <LoadingSection title="Now Playing" rows={2} cols={6} />
    </>
  );
}

export function MoviesContent() {
  return (
    <Suspense fallback={<MoviesLoadingFallback />}>
      <MoviesDataWrapper />
    </Suspense>
  );
}
