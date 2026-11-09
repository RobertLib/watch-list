"use client";

import { Suspense } from "react";
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
import {
  MOVIE_SECTIONS,
  type MovieSectionsSnapshot,
} from "@/lib/listing-sections";

/**
 * Everything under the banner on /movies.
 *
 * The five opening pages load independently. A failed section can be retried
 * without replacing the other listings or discarding their loaded pages.
 *
 * The four fixed sections start from the build's snapshot of their page one,
 * so the prerendered page lists their titles and links to them. The filterable
 * "Discover" grid reads its filters from the query string, so it sits behind a
 * Suspense boundary of its own and renders in the browser only.
 */
export function MoviesContent({
  snapshot = null,
}: {
  snapshot?: MovieSectionsSnapshot | null;
}) {
  const settingsKey = useSettingsKey();

  return (
    <>
      <Suspense fallback={<LoadingSection title="Discover Movies" count={12} />}>
        <DiscoverMovies settingsKey={settingsKey} />
      </Suspense>
      <AsyncDiscoverySection
        title="Trending This Week"
        loadKey={settingsKey}
        loadFirstPage={MOVIE_SECTIONS.trending}
        placeholder={snapshot?.trending}
      >
        {(trending, snapshotState) => (
          <PaginatedMovieSection
            snapshot={snapshotState}
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
        loadFirstPage={MOVIE_SECTIONS.nowPlaying}
        placeholder={snapshot?.nowPlaying}
      >
        {(nowPlaying, snapshotState) => (
          <PaginatedMovieSection
            snapshot={snapshotState}
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
        loadFirstPage={MOVIE_SECTIONS.upcoming}
        placeholder={snapshot?.upcoming}
      >
        {(upcoming, snapshotState) => (
          <PaginatedMovieSection
            snapshot={snapshotState}
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
        loadFirstPage={MOVIE_SECTIONS.topRated}
        placeholder={snapshot?.topRated}
      >
        {(topRated, snapshotState) => (
          <PaginatedMovieSection
            snapshot={snapshotState}
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

function DiscoverMovies({ settingsKey }: { settingsKey: string }) {
  const { data, isLoading, reload } = useAsyncData(
    () => tmdbDiscoverApi.getPopularMovies(1),
    [settingsKey],
  );

  if (isLoading) return <LoadingSection title="Discover Movies" count={12} />;

  return (
    <FilteredMovieSection
      title="Discover Movies"
      initialMovies={data?.results}
      initialTotalPages={data?.total_pages}
      initialTotalResults={data?.total_results}
      initialLoadError={!data}
      onInitialRetry={reload}
    />
  );
}
