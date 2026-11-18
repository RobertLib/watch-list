"use client";

import { Suspense } from "react";
import { tmdbDiscoverApi } from "@/lib/tmdb-discover";
import { PaginatedTVSection } from "@/components/PaginatedTVSection";
import { FilteredTVSection } from "@/components/FilteredTVSection";
import { AsyncDiscoverySection } from "@/components/AsyncDiscoverySection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import { useLocalDay } from "@/hooks/useLocalDay";
import { useT } from "@/i18n/LocaleProvider";
import {
  getTopRatedTVShows,
  getAiringTodayTVShows,
  getTrendingTVShowsWeekly,
} from "@/lib/api";
import { TV_SECTIONS, type TVSectionsSnapshot } from "@/lib/listing-sections";

/**
 * Everything under the banner on /tv-shows – the mirror of `MoviesContent`,
 * down to the build's snapshot for the fixed sections and a browser-only
 * "Discover" grid.
 */
export function TVShowsContent({
  snapshot = null,
}: {
  snapshot?: TVSectionsSnapshot | null;
}) {
  const settingsKey = useSettingsKey();
  const day = useLocalDay();
  const t = useT();
  const trendingTitle = t("Trending This Week", "Trendy tohoto týdne");
  const airingTodayTitle = t("Airing Today", "Dnes vysílané");
  const topRatedTitle = t("Top Rated TV Shows", "Nejlépe hodnocené seriály");

  return (
    <>
      <Suspense
        fallback={
          <LoadingSection
            title={t("Discover TV Shows", "Objevujte seriály")}
            count={12}
          />
        }
      >
        <DiscoverTVShows settingsKey={settingsKey} />
      </Suspense>
      <AsyncDiscoverySection
        title={trendingTitle}
        loadKey={settingsKey}
        loadFirstPage={TV_SECTIONS.trending}
        placeholder={snapshot?.trending}
      >
        {(trending, snapshotState) => (
          <PaginatedTVSection
            snapshot={snapshotState}
            title={trendingTitle}
            fetchFunction={getTrendingTVShowsWeekly}
            initialTVShows={trending.results}
            initialTotalPages={trending.total_pages}
          />
        )}
      </AsyncDiscoverySection>
      {/* Only this listing changes at midnight; other loaded pages stay mounted. */}
      <AsyncDiscoverySection
        title={airingTodayTitle}
        loadKey={`${settingsKey}|${day}`}
        loadFirstPage={TV_SECTIONS.airingToday}
        placeholder={snapshot?.airingToday}
      >
        {(airingToday, snapshotState) => (
          <PaginatedTVSection
            snapshot={snapshotState}
            title={airingTodayTitle}
            fetchFunction={getAiringTodayTVShows}
            initialTVShows={airingToday.results}
            initialTotalPages={airingToday.total_pages}
          />
        )}
      </AsyncDiscoverySection>
      <AsyncDiscoverySection
        title={topRatedTitle}
        loadKey={settingsKey}
        loadFirstPage={TV_SECTIONS.topRated}
        placeholder={snapshot?.topRated}
      >
        {(topRated, snapshotState) => (
          <PaginatedTVSection
            snapshot={snapshotState}
            title={topRatedTitle}
            fetchFunction={getTopRatedTVShows}
            initialTVShows={topRated.results}
            initialTotalPages={topRated.total_pages}
          />
        )}
      </AsyncDiscoverySection>
    </>
  );
}

function DiscoverTVShows({ settingsKey }: { settingsKey: string }) {
  const { data, isLoading, reload } = useAsyncData(
    () => tmdbDiscoverApi.getPopularTVShows(1),
    [settingsKey],
  );
  const t = useT();
  const title = t("Discover TV Shows", "Objevujte seriály");

  if (isLoading) return <LoadingSection title={title} count={12} />;

  return (
    <FilteredTVSection
      title={title}
      initialTVShows={data?.results}
      initialTotalPages={data?.total_pages}
      initialTotalResults={data?.total_results}
      initialLoadError={!data}
      onInitialRetry={reload}
    />
  );
}
