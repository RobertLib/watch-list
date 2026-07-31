"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { MediaGrid } from "./MediaGrid";
import { LoadMoreButton } from "./LoadMoreButton";
import { FilterPresets, TV_PRESETS } from "./FilterPresets";
import { LoadingSpinner } from "./LoadingSpinner";
import { discoverTVShowsWithFilters } from "@/app/actions";
import {
  formatResultCount,
  resolveDiscoverFilters,
} from "@/lib/discover-filters";
import type { TVShow, MediaItem } from "@/types/tmdb";
import type { FilterOptions } from "@/types/filters";

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
  const { options: filterOptions, isActive: hasFilters } =
    resolveDiscoverFilters(searchParams, "tv", TV_PRESETS);
  const filtersKey = JSON.stringify(filterOptions);
  // Read inside the effect without making the object identity a dependency.
  const filterOptionsRef = useRef(filterOptions);
  filterOptionsRef.current = filterOptions;

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

  // Load TV shows based on current filters
  const loadTVShows = async (page: number = 1, filters: FilterOptions = {}) => {
    setLoading(true);
    try {
      const response = await discoverTVShowsWithFilters(page, filters);

      if (page === 1) {
        setTVShows(response.results);
      } else {
        setTVShows((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          return [
            ...prev,
            ...response.results.filter((s) => !existingIds.has(s.id)),
          ];
        });
      }

      setCurrentPage(response.page);
      setTotalPages(response.total_pages);
      setTotalResults(response.total_results);
    } catch (error) {
      console.error("Error loading TV shows:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load TV shows whenever the filters in the URL change
  useEffect(() => {
    if (!hasFilters) {
      // Reset to the server-rendered listing
      setTVShows(initialTVShows);
      setHasLoadedMore(false);
      setCurrentPage(1);
      setTotalPages(initialTotalPages);
      setTotalResults(initialTotalResults);
      setLoading(false);
      return;
    }

    loadTVShows(1, filterOptionsRef.current);
  }, [
    filtersKey,
    hasFilters,
    initialTVShows,
    initialTotalPages,
    initialTotalResults,
  ]);

  const handleLoadMore = async () => {
    if (currentPage < totalPages && !loading) {
      if (!hasFilters) setHasLoadedMore(true);
      await loadTVShows(currentPage + 1, filterOptions);
    }
  };

  const displayTVShows = hasFilters || hasLoadedMore ? tvShows : initialTVShows;
  const displayItems: MediaItem[] = displayTVShows.map(tvShowToMediaItem);
  const canLoadMore = currentPage < totalPages;

  return (
    <section className="mb-12">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-4">{title}</h2>
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
