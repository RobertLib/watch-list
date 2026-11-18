"use client";

import { Suspense } from "react";
import { tmdbDiscoverApi } from "@/lib/tmdb-discover";
import { PaginatedMovieSection } from "@/components/PaginatedMovieSection";
import { FilteredMovieSection } from "@/components/FilteredMovieSection";
import { AsyncDiscoverySection } from "@/components/AsyncDiscoverySection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import { useT } from "@/i18n/LocaleProvider";
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
  const t = useT();
  const trendingTitle = t("Trending This Week", "Trendy tohoto týdne");
  const nowPlayingTitle = t("Now Playing", "V kinech");
  const upcomingTitle = t("Coming Soon", "Připravujeme");
  const topRatedTitle = t("Top Rated Movies", "Nejlépe hodnocené filmy");

  return (
    <>
      <Suspense
        fallback={
          <LoadingSection
            title={t("Discover Movies", "Objevujte filmy")}
            count={12}
          />
        }
      >
        <DiscoverMovies settingsKey={settingsKey} />
      </Suspense>
      <AsyncDiscoverySection
        title={trendingTitle}
        loadKey={settingsKey}
        loadFirstPage={MOVIE_SECTIONS.trending}
        placeholder={snapshot?.trending}
      >
        {(trending, snapshotState) => (
          <PaginatedMovieSection
            snapshot={snapshotState}
            title={trendingTitle}
            fetchFunction={getTrendingMoviesWeekly}
            initialMovies={trending.results}
            initialTotalPages={trending.total_pages}
          />
        )}
      </AsyncDiscoverySection>
      <AsyncDiscoverySection
        title={nowPlayingTitle}
        loadKey={settingsKey}
        loadFirstPage={MOVIE_SECTIONS.nowPlaying}
        placeholder={snapshot?.nowPlaying}
      >
        {(nowPlaying, snapshotState) => (
          <PaginatedMovieSection
            snapshot={snapshotState}
            title={nowPlayingTitle}
            fetchFunction={getNowPlayingMovies}
            initialMovies={nowPlaying.results}
            initialTotalPages={nowPlaying.total_pages}
          />
        )}
      </AsyncDiscoverySection>
      <AsyncDiscoverySection
        title={upcomingTitle}
        loadKey={settingsKey}
        loadFirstPage={MOVIE_SECTIONS.upcoming}
        placeholder={snapshot?.upcoming}
      >
        {(upcoming, snapshotState) => (
          <PaginatedMovieSection
            snapshot={snapshotState}
            title={upcomingTitle}
            fetchFunction={getUpcomingMovies}
            initialMovies={upcoming.results}
            initialTotalPages={upcoming.total_pages}
          />
        )}
      </AsyncDiscoverySection>
      <AsyncDiscoverySection
        title={topRatedTitle}
        loadKey={settingsKey}
        loadFirstPage={MOVIE_SECTIONS.topRated}
        placeholder={snapshot?.topRated}
      >
        {(topRated, snapshotState) => (
          <PaginatedMovieSection
            snapshot={snapshotState}
            title={topRatedTitle}
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
  const t = useT();
  const title = t("Discover Movies", "Objevujte filmy");

  if (isLoading) return <LoadingSection title={title} count={12} />;

  return (
    <FilteredMovieSection
      title={title}
      initialMovies={data?.results}
      initialTotalPages={data?.total_pages}
      initialTotalResults={data?.total_results}
      initialLoadError={!data}
      onInitialRetry={reload}
    />
  );
}
