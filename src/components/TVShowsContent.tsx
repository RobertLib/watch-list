"use client";

import { tmdbDiscoverApi } from "@/lib/tmdb-discover";
import { PaginatedTVSection } from "@/components/PaginatedTVSection";
import { FilteredTVSection } from "@/components/FilteredTVSection";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { LoadingSection } from "@/components/LoadingSpinner";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import { settle } from "@/lib/settle";
import {
  getTopRatedTVShows,
  getAiringTodayTVShows,
  getTrendingTVShowsWeekly,
} from "@/lib/api";

/** Everything under the banner on /tv-shows – the mirror of `MoviesContent`. */
export function TVShowsContent() {
  const settingsKey = useSettingsKey();

  const { data, isLoading, reload } = useAsyncData(
    () =>
      Promise.all([
        settle(tmdbDiscoverApi.getPopularTVShows(1), "popular TV shows"),
        settle(tmdbDiscoverApi.getTrendingTVShowsWeekly(1), "trending TV shows"),
        settle(tmdbDiscoverApi.getAiringTodayTVShows(1), "airing today"),
        settle(tmdbDiscoverApi.getTopRatedTVShows(1), "top rated TV shows"),
      ]),
    [settingsKey],
  );

  if (isLoading) return <TVShowsLoadingFallback />;

  const [popular, trending, airingToday, topRated] = data ?? [];

  if (!popular && !trending && !airingToday && !topRated) {
    return (
      <LoadFailureNotice
        title="Could not load TV shows"
        description="TMDB did not answer. Check your connection and try again – nothing on your watchlist is affected."
        onRetry={reload}
      />
    );
  }

  return (
    <>
      {popular && (
        <FilteredTVSection
          title="Discover TV Shows"
          initialTVShows={popular.results}
          initialTotalPages={popular.total_pages}
          initialTotalResults={popular.total_results}
        />
      )}
      {trending && (
        <PaginatedTVSection
          title="Trending This Week"
          fetchFunction={getTrendingTVShowsWeekly}
          initialTVShows={trending.results}
          initialTotalPages={trending.total_pages}
        />
      )}
      {airingToday && (
        <PaginatedTVSection
          title="Airing Today"
          fetchFunction={getAiringTodayTVShows}
          initialTVShows={airingToday.results}
          initialTotalPages={airingToday.total_pages}
        />
      )}
      {topRated && (
        <PaginatedTVSection
          title="Top Rated TV Shows"
          fetchFunction={getTopRatedTVShows}
          initialTVShows={topRated.results}
          initialTotalPages={topRated.total_pages}
        />
      )}
    </>
  );
}

export function TVShowsLoadingFallback() {
  return (
    <>
      <LoadingSection title="Discover TV Shows" rows={2} cols={6} />
      <LoadingSection title="Trending This Week" rows={2} cols={6} />
      <LoadingSection title="Airing Today" rows={2} cols={6} />
      <LoadingSection title="Top Rated TV Shows" rows={2} cols={6} />
    </>
  );
}
