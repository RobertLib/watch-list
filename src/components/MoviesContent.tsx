import { Suspense } from "react";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { PaginatedMovieSection } from "@/components/PaginatedMovieSection";
import { FilteredMovieSection } from "@/components/FilteredMovieSection";
import { LoadingSection } from "@/components/LoadingSpinner";
import {
  getTopRatedMovies,
  getNowPlayingMovies,
  getUpcomingMovies,
  getTrendingMoviesWeekly,
} from "@/app/actions";

async function MoviesDataWrapper() {
  const [popular, trending, nowPlaying, upcoming, topRated] = await Promise.all(
    [
      tmdbServerApi.getPopularMovies(1),
      tmdbServerApi.getTrendingMoviesWeekly(1),
      tmdbServerApi.getNowPlayingMovies(1),
      tmdbServerApi.getUpcomingMovies(1),
      tmdbServerApi.getTopRatedMovies(1),
    ],
  );

  return (
    <>
      <FilteredMovieSection
        title="Discover Movies"
        initialMovies={popular.results}
        initialTotalPages={popular.total_pages}
      />
      <PaginatedMovieSection
        title="Trending This Week"
        fetchFunction={getTrendingMoviesWeekly}
        initialMovies={trending.results}
        initialTotalPages={trending.total_pages}
      />
      <PaginatedMovieSection
        title="Now Playing"
        fetchFunction={getNowPlayingMovies}
        initialMovies={nowPlaying.results}
        initialTotalPages={nowPlaying.total_pages}
      />
      <PaginatedMovieSection
        title="Coming Soon"
        fetchFunction={getUpcomingMovies}
        initialMovies={upcoming.results}
        initialTotalPages={upcoming.total_pages}
      />
      <PaginatedMovieSection
        title="Top Rated Movies"
        fetchFunction={getTopRatedMovies}
        initialMovies={topRated.results}
        initialTotalPages={topRated.total_pages}
      />
    </>
  );
}

function MoviesLoadingFallback() {
  return (
    <>
      <LoadingSection title="Discover Movies" rows={2} cols={6} />
      <LoadingSection title="Trending This Week" rows={2} cols={6} />
      <LoadingSection title="Now Playing" rows={2} cols={6} />
      <LoadingSection title="Coming Soon" rows={2} cols={6} />
      <LoadingSection title="Top Rated Movies" rows={2} cols={6} />
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
