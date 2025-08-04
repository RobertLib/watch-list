"use client";

import { tmdbDiscoverApi } from "@/lib/tmdb-discover";
import { PaginatedMovieSection } from "@/components/PaginatedMovieSection";
import { FilteredMovieSection } from "@/components/FilteredMovieSection";
import { AsyncDiscoverySection } from "@/components/AsyncDiscoverySection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import {
  getTopRatedMovies,
  getNowPlayingMovies,
  getUpcomingMovies,
  getTrendingMoviesWeekly,
} from "@/lib/api";

/**
 * Everything under the banner on /movies.
 *
 * The five opening pages load independently. A failed section can be retried
 * without replacing the other listings or discarding their loaded pages.
 */
export function MoviesContent() {
  const settingsKey = useSettingsKey();

  const { data, isLoading, reload } = useAsyncData(
    () => tmdbDiscoverApi.getPopularMovies(1),
    [settingsKey],
  );

  return (
    <>
      {isLoading ? (
        <LoadingSection title="Discover Movies" count={12} />
      ) : (
        <FilteredMovieSection
          title="Discover Movies"
          initialMovies={data?.results}
          initialTotalPages={data?.total_pages}
          initialTotalResults={data?.total_results}
          initialLoadError={!data}
          onInitialRetry={reload}
        />
      )}
      <AsyncDiscoverySection
        title="Trending This Week"
        loadKey={settingsKey}
        loadFirstPage={() => tmdbDiscoverApi.getTrendingMoviesWeekly(1)}
      >
        {(trending) => (
          <PaginatedMovieSection
            title="Trending This Week"
            fetchFunction={getTrendingMoviesWeekly}
            initialMovies={trending.results}
            initialTotalPages={trending.total_pages}
          />
        )}
      </AsyncDiscoverySection>
      <AsyncDiscoverySection
        title="Now Playing"
        loadKey={settingsKey}
        loadFirstPage={() => tmdbDiscoverApi.getNowPlayingMovies(1)}
      >
        {(nowPlaying) => (
          <PaginatedMovieSection
            title="Now Playing"
            fetchFunction={getNowPlayingMovies}
            initialMovies={nowPlaying.results}
            initialTotalPages={nowPlaying.total_pages}
          />
        )}
      </AsyncDiscoverySection>
      <AsyncDiscoverySection
        title="Coming Soon"
        loadKey={settingsKey}
        loadFirstPage={() => tmdbDiscoverApi.getUpcomingMovies(1)}
      >
        {(upcoming) => (
          <PaginatedMovieSection
            title="Coming Soon"
            fetchFunction={getUpcomingMovies}
            initialMovies={upcoming.results}
            initialTotalPages={upcoming.total_pages}
          />
        )}
      </AsyncDiscoverySection>
      <AsyncDiscoverySection
        title="Top Rated Movies"
        loadKey={settingsKey}
        loadFirstPage={() => tmdbDiscoverApi.getTopRatedMovies(1)}
      >
        {(topRated) => (
          <PaginatedMovieSection
            title="Top Rated Movies"
            fetchFunction={getTopRatedMovies}
            initialMovies={topRated.results}
            initialTotalPages={topRated.total_pages}
          />
        )}
      </AsyncDiscoverySection>
    </>
  );
}

export function MoviesLoadingFallback() {
  return (
    <>
      <LoadingSection title="Discover Movies" count={12} />
      <LoadingSection title="Trending This Week" count={12} />
      <LoadingSection title="Now Playing" count={12} />
      <LoadingSection title="Coming Soon" count={12} />
      <LoadingSection title="Top Rated Movies" count={12} />
    </>
  );
}
