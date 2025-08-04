"use client";

import { tmdbDiscoverApi } from "@/lib/tmdb-discover";
import { PaginatedMovieSection } from "@/components/PaginatedMovieSection";
import { FilteredMovieSection } from "@/components/FilteredMovieSection";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { LoadingSection } from "@/components/LoadingSpinner";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import { settle } from "@/lib/settle";
import {
  getTopRatedMovies,
  getNowPlayingMovies,
  getUpcomingMovies,
  getTrendingMoviesWeekly,
} from "@/lib/api";

/**
 * Everything under the banner on /movies.
 *
 * The five opening pages are fetched together and in parallel, which is what the
 * Server Component did – the difference is only that it is an effect now, and
 * that a change of region or platform re-runs it.
 *
 * Each of the five is settled on its own. They are five independent listings,
 * and one of them rate-limiting is no reason to withhold the other four – which
 * is exactly what a plain `Promise.all` did.
 */
export function MoviesContent() {
  const settingsKey = useSettingsKey();

  const { data, isLoading, reload } = useAsyncData(
    () =>
      Promise.all([
        settle(tmdbDiscoverApi.getPopularMovies(1), "popular movies"),
        settle(tmdbDiscoverApi.getTrendingMoviesWeekly(1), "trending movies"),
        settle(tmdbDiscoverApi.getNowPlayingMovies(1), "now playing"),
        settle(tmdbDiscoverApi.getUpcomingMovies(1), "upcoming movies"),
        settle(tmdbDiscoverApi.getTopRatedMovies(1), "top rated movies"),
      ]),
    [settingsKey],
  );

  if (isLoading) return <MoviesLoadingFallback />;

  const [popular, trending, nowPlaying, upcoming, topRated] = data ?? [];

  // Nothing answered at all. That is a failure to report rather than a page to
  // render empty – and, on a first visit, very often a missing TMDB token.
  if (!popular && !trending && !nowPlaying && !upcoming && !topRated) {
    return (
      <LoadFailureNotice
        title="Could not load movies"
        description="TMDB did not answer. Check your connection and try again – nothing on your watchlist is affected."
        onRetry={reload}
      />
    );
  }

  return (
    <>
      {popular && (
        <FilteredMovieSection
          title="Discover Movies"
          initialMovies={popular.results}
          initialTotalPages={popular.total_pages}
          initialTotalResults={popular.total_results}
        />
      )}
      {trending && (
        <PaginatedMovieSection
          title="Trending This Week"
          fetchFunction={getTrendingMoviesWeekly}
          initialMovies={trending.results}
          initialTotalPages={trending.total_pages}
        />
      )}
      {nowPlaying && (
        <PaginatedMovieSection
          title="Now Playing"
          fetchFunction={getNowPlayingMovies}
          initialMovies={nowPlaying.results}
          initialTotalPages={nowPlaying.total_pages}
        />
      )}
      {upcoming && (
        <PaginatedMovieSection
          title="Coming Soon"
          fetchFunction={getUpcomingMovies}
          initialMovies={upcoming.results}
          initialTotalPages={upcoming.total_pages}
        />
      )}
      {topRated && (
        <PaginatedMovieSection
          title="Top Rated Movies"
          fetchFunction={getTopRatedMovies}
          initialMovies={topRated.results}
          initialTotalPages={topRated.total_pages}
        />
      )}
    </>
  );
}

export function MoviesLoadingFallback() {
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
