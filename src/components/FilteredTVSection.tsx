"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { MediaGrid } from "./MediaGrid";
import { LoadMoreButton } from "./LoadMoreButton";
import { FilterPresets, TV_PRESETS } from "./FilterPresets";
import { LoadingSpinner } from "./LoadingSpinner";
import { ViewModeToggle } from "./ViewModeToggle";
import { discoverTVShowsWithFilters } from "@/lib/api";
import {
  formatResultCount,
  resolveDiscoverFilters,
} from "@/lib/discover-filters";
import type { TVShow, MediaItem } from "@/types/tmdb";

// Helper function to convert TVShow to MediaItem
const tvShowToMediaItem = (tvShow: TVShow): MediaItem => ({
  id: tvShow.id,
  title: tvShow.name,
  overview: tvShow.overview,
  poster_path: tvShow.poster_path,
  backdrop_path: tvShow.backdrop_path,
  release_date: tvShow.first_air_date,
  vote_average: tvShow.vote_average,
  vote_count: tvShow.vote_count,
  genre_ids: tvShow.genre_ids,
  media_type: "tv" as const,
  providers: tvShow.providers,
});

interface FilteredTVSectionProps {
  title: string;
  initialTVShows?: TVShow[];
  initialTotalPages?: number;
  initialTotalResults?: number;
}

export function FilteredTVSection({
  title,
  initialTVShows = [],
  initialTotalPages = 1,
  initialTotalResults,
}: FilteredTVSectionProps) {
  const searchParams = useSearchParams();

  // The URL is the single source of truth: the filter bar and the presets only
  // push params, this section reacts to whatever ends up in the URL. Deriving it
  // during render also avoids flashing unfiltered content when the user lands
  // here with filters already applied.
  const { options: resolvedOptions, isActive: hasFilters } =
    resolveDiscoverFilters(searchParams, "tv", TV_PRESETS);
  const filtersKey = JSON.stringify(resolvedOptions);
  // `resolveDiscoverFilters` builds a fresh object every render, but the same URL
  // always serialises to the same key – so pinning the identity to that key lets
  // the effect below depend on the options themselves instead of reading them
  // out of a ref it had to write to during render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filterOptions = useMemo(() => resolvedOptions, [filtersKey]);

  const [tvShows, setTVShows] = useState<TVShow[]>(
    hasFilters ? [] : initialTVShows,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    hasFilters ? 1 : initialTotalPages,
  );
  const [totalResults, setTotalResults] = useState(
    hasFilters ? undefined : initialTotalResults,
  );
  const [loading, setLoading] = useState(hasFilters);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);

  // Leaving or changing the filters throws the current listing away. Done here
  // rather than in the effect below so the discarded results never reach the
  // screen, and so the effect is left with nothing to do but fetch.
  const [renderedKey, setRenderedKey] = useState(filtersKey);
  if (renderedKey !== filtersKey) {
    setRenderedKey(filtersKey);
    setTVShows(hasFilters ? [] : initialTVShows);
    setHasLoadedMore(false);
    setCurrentPage(1);
    setTotalPages(hasFilters ? 1 : initialTotalPages);
    setTotalResults(hasFilters ? undefined : initialTotalResults);
    setLoading(hasFilters);
  }

  // Load TV shows based on current filters
  // Load the first page whenever the filters in the URL change. The reset above
  // has already put the listing back to its loading state, so all that is left
  // here is the request itself.
  useEffect(() => {
    // The unfiltered listing is already on screen – it is what the section was
    // rendered with, and the reset above put it back.
    if (!hasFilters) return;

    // The filters can move on before this resolves; whatever comes back for the
    // filters the user has already left is dropped rather than painted over the
    // listing that replaced them.
    let isCurrent = true;

    discoverTVShowsWithFilters(1, filterOptions).then(
      (response) => {
        if (!isCurrent) return;
        setTVShows(response.results);
        setCurrentPage(response.page);
        setTotalPages(response.total_pages);
        setTotalResults(response.total_results);
        setLoading(false);
      },
      (error) => {
        if (!isCurrent) return;
        console.error("Error loading TV shows:", error);
        setLoading(false);
      },
    );

    return () => {
      isCurrent = false;
    };
  }, [filterOptions, hasFilters]);

  // Appends the next page to what is already there – the one path that adds to
  // the listing instead of replacing it.
  const handleLoadMore = async () => {
    if (currentPage >= totalPages || loading) return;

    if (!hasFilters) setHasLoadedMore(true);
    setLoading(true);

    try {
      const response = await discoverTVShowsWithFilters(currentPage + 1, filterOptions);
      setTVShows((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        return [
          ...prev,
          ...response.results.filter((s) => !existingIds.has(s.id)),
        ];
      });
      setCurrentPage(response.page);
      setTotalPages(response.total_pages);
      setTotalResults(response.total_results);
    } catch (error) {
      console.error("Error loading TV shows:", error);
    } finally {
      setLoading(false);
    }
  };

  const displayTVShows = hasFilters || hasLoadedMore ? tvShows : initialTVShows;
  const displayItems: MediaItem[] = displayTVShows.map(tvShowToMediaItem);
  const canLoadMore = currentPage < totalPages;

  return (
    <section className="mb-12">
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <ViewModeToggle className="ml-auto" />
        </div>
        <FilterPresets type="tv" />
      </div>

      {loading && displayTVShows.length === 0 ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-400 mb-4 min-h-5" aria-live="polite">
            {loading
              ? "Updating results…"
              : totalResults !== undefined &&
                formatResultCount(totalResults, "tv")}
          </p>

          <div
            className={
              loading ? "opacity-60 transition-opacity" : "transition-opacity"
            }
          >
            <MediaGrid items={displayItems} />
          </div>

          {canLoadMore && (
            <LoadMoreButton onLoadMore={handleLoadMore} disabled={loading} />
          )}
        </>
      )}
    </section>
  );
}
