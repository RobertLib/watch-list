import { Suspense } from "react";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { PaginatedTVSection } from "@/components/PaginatedTVSection";
import { FilteredTVSection } from "@/components/FilteredTVSection";
import { LoadingSection } from "@/components/LoadingSpinner";
import {
  getPopularTVShows,
  getTopRatedTVShows,
  getAiringTodayTVShows,
} from "@/app/actions";

async function TVShowsDataWrapper() {
  const [popular, topRated, airingToday] = await Promise.all([
    tmdbServerApi.getPopularTVShows(1),
    tmdbServerApi.getTopRatedTVShows(1),
    tmdbServerApi.getAiringTodayTVShows(1),
  ]);

  return (
    <>
      <FilteredTVSection
        title="Discover TV Shows"
        initialTVShows={popular.results}
        initialTotalPages={popular.total_pages}
      />
      <PaginatedTVSection
        title="Popular TV Shows"
        fetchFunction={getPopularTVShows}
        initialTVShows={popular.results}
        initialTotalPages={popular.total_pages}
      />
      <PaginatedTVSection
        title="Top Rated TV Shows"
        fetchFunction={getTopRatedTVShows}
        initialTVShows={topRated.results}
        initialTotalPages={topRated.total_pages}
      />
      <PaginatedTVSection
        title="Airing Today"
        fetchFunction={getAiringTodayTVShows}
        initialTVShows={airingToday.results}
        initialTotalPages={airingToday.total_pages}
      />
    </>
  );
}

function TVShowsLoadingFallback() {
  return (
    <>
      <LoadingSection title="Discover TV Shows" rows={2} cols={6} />
      <LoadingSection title="Popular TV Shows" rows={2} cols={6} />
      <LoadingSection title="Top Rated TV Shows" rows={2} cols={6} />
      <LoadingSection title="Airing Today" rows={2} cols={6} />
    </>
  );
}

export function TVShowsContent() {
  return (
    <Suspense fallback={<TVShowsLoadingFallback />}>
      <TVShowsDataWrapper />
    </Suspense>
  );
}
