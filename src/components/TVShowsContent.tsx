"use client";

import { tmdbDiscoverApi } from "@/lib/tmdb-discover";
import { PaginatedTVSection } from "@/components/PaginatedTVSection";
import { FilteredTVSection } from "@/components/FilteredTVSection";
import { AsyncDiscoverySection } from "@/components/AsyncDiscoverySection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import { useLocalDay } from "@/hooks/useLocalDay";
import {
  getTopRatedTVShows,
  getAiringTodayTVShows,
  getTrendingTVShowsWeekly,
} from "@/lib/api";

/** Everything under the banner on /tv-shows – the mirror of `MoviesContent`. */
export function TVShowsContent() {
  const settingsKey = useSettingsKey();
  const day = useLocalDay();

  const { data, isLoading, reload } = useAsyncData(
    () => tmdbDiscoverApi.getPopularTVShows(1),
    [settingsKey],
  );

  return (
    <>
      {isLoading ? (
        <LoadingSection title="Discover TV Shows" count={12} />
      ) : (
        <FilteredTVSection
          title="Discover TV Shows"
          initialTVShows={data?.results}
          initialTotalPages={data?.total_pages}
          initialTotalResults={data?.total_results}
          initialLoadError={!data}
          onInitialRetry={reload}
        />
      )}
      <AsyncDiscoverySection
        title="Trending This Week"
        loadKey={settingsKey}
        loadFirstPage={() => tmdbDiscoverApi.getTrendingTVShowsWeekly(1)}
      >
        {(trending) => (
          <PaginatedTVSection
            title="Trending This Week"
            fetchFunction={getTrendingTVShowsWeekly}
            initialTVShows={trending.results}
            initialTotalPages={trending.total_pages}
          />
        )}
      </AsyncDiscoverySection>
      {/* Only this listing changes at midnight; other loaded pages stay mounted. */}
      <AsyncDiscoverySection
        title="Airing Today"
        loadKey={`${settingsKey}|${day}`}
        loadFirstPage={() => tmdbDiscoverApi.getAiringTodayTVShows(1)}
      >
        {(airingToday) => (
          <PaginatedTVSection
            title="Airing Today"
            fetchFunction={getAiringTodayTVShows}
            initialTVShows={airingToday.results}
            initialTotalPages={airingToday.total_pages}
          />
        )}
      </AsyncDiscoverySection>
      <AsyncDiscoverySection
        title="Top Rated TV Shows"
        loadKey={settingsKey}
        loadFirstPage={() => tmdbDiscoverApi.getTopRatedTVShows(1)}
      >
        {(topRated) => (
          <PaginatedTVSection
            title="Top Rated TV Shows"
            fetchFunction={getTopRatedTVShows}
            initialTVShows={topRated.results}
            initialTotalPages={topRated.total_pages}
          />
        )}
      </AsyncDiscoverySection>
    </>
  );
}

export function TVShowsLoadingFallback() {
  return (
    <>
      <LoadingSection title="Discover TV Shows" count={12} />
      <LoadingSection title="Trending This Week" count={12} />
      <LoadingSection title="Airing Today" count={12} />
      <LoadingSection title="Top Rated TV Shows" count={12} />
    </>
  );
}
