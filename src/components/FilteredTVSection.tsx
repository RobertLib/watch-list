"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { MediaGrid } from "./MediaGrid";
import { LoadMoreButton } from "./LoadMoreButton";
import { FilterPresets } from "./FilterPresets";
import { LoadingSpinner } from "./LoadingSpinner";
import { discoverTVShowsWithFilters } from "@/app/actions";
import { TV_PRESETS } from "@/components/FilterPresets";
import type { TVShow, MediaItem } from "@/types/tmdb";
import type { FilterOptions } from "@/types/filters";

// Extract filter options from URL search params (used both for lazy state init and in useEffect)
function extractFiltersFromParams(params: {
  get: (key: string) => string | null;
}): FilterOptions {
  const presetId = params.get("preset");
  const hasOtherFilters =
    params.get("sort_by") ||
    params.get("year") ||
    params.get("genre") ||
    params.get("min_rating") ||
    params.get("language");

  if (presetId && !hasOtherFilters) {
    const preset = TV_PRESETS.find((p) => p.id === presetId);
    if (preset) return preset.filters;
  }

  const filters: FilterOptions = {};
  const sortBy = params.get("sort_by");
  if (sortBy) filters.sortBy = sortBy;
  const year = params.get("year");
  if (year) filters.year = year;
  const genre = params.get("genre");
  if (genre) filters.genre = genre;
  const minRating = params.get("min_rating");
  if (minRating) filters.minRating = Number(minRating);
  const language = params.get("language");
  if (language) filters.withOriginalLanguage = language;
  return filters;
}

function checkHasActiveFilters(filters: FilterOptions): boolean {
  return Object.values(filters).some(
    (value) =>
      value !== undefined && value !== "" && value !== "popularity.desc",
  );
}

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
}

export function FilteredTVSection({
  title,
  initialTVShows = [],
  initialTotalPages = 1,
}: FilteredTVSectionProps) {
  const searchParams = useSearchParams();

  // Synchronously detect active filters from URL to avoid flashing unfiltered content
  // when the user navigates back to this page with a filter already applied.
  const initialFiltersFromURL = extractFiltersFromParams(searchParams);
  const initialHasFilters = checkHasActiveFilters(initialFiltersFromURL);

  const [tvShows, setTVShows] = useState<TVShow[]>(
    initialHasFilters ? [] : initialTVShows,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    initialHasFilters ? 1 : initialTotalPages,
  );
  const [loading, setLoading] = useState(initialHasFilters);
  const [hasFilters, setHasFilters] = useState(initialHasFilters);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterOptions>(
    initialHasFilters ? initialFiltersFromURL : {},
  );
  const lastCallbackFilters = useRef<string>("");

  // Extract filters from URL parameters
  const getFiltersFromParams = useCallback((): FilterOptions => {
    return extractFiltersFromParams(searchParams);
  }, [searchParams]);

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
    } catch (error) {
      console.error("Error loading TV shows:", error);
    } finally {
      setLoading(false);
    }
  };

  // Handle filter changes (from presets or FilterBar callback)
  const handleFiltersChange = (filters: FilterOptions) => {
    const hasActiveFilters = Object.values(filters).some(
      (value) =>
        value !== undefined && value !== "" && value !== "popularity.desc",
    );
    setHasFilters(hasActiveFilters);
    setActiveFilters(hasActiveFilters ? filters : {});
    if (hasActiveFilters) {
      lastCallbackFilters.current = JSON.stringify(filters);
      loadTVShows(1, filters);
    }
  };

  // Load TV shows when URL parameters change
  useEffect(() => {
    const filters = getFiltersFromParams();
    const hasActiveFilters = Object.values(filters).some(
      (value) =>
        value !== undefined && value !== "" && value !== "popularity.desc",
    );

    setHasFilters(hasActiveFilters);

    if (hasActiveFilters) {
      const filtersKey = JSON.stringify(filters);
      if (filtersKey === lastCallbackFilters.current) {
        lastCallbackFilters.current = "";
        return;
      }
      setActiveFilters(filters);
      loadTVShows(1, filters);
    } else {
      // Reset to initial TV shows if no filters
      lastCallbackFilters.current = "";
      setActiveFilters({});
      setTVShows(initialTVShows);
      setHasLoadedMore(false);
      setCurrentPage(1);
      setTotalPages(initialTotalPages);
    }
  }, [searchParams, initialTVShows, initialTotalPages, getFiltersFromParams]);

  const handleLoadMore = async () => {
    if (currentPage < totalPages && !loading) {
      if (!hasFilters) setHasLoadedMore(true);
      await loadTVShows(currentPage + 1, activeFilters);
    }
  };

  const displayTVShows = hasFilters || hasLoadedMore ? tvShows : initialTVShows;
  const displayItems: MediaItem[] = displayTVShows.map(tvShowToMediaItem);
  const canLoadMore = currentPage < totalPages;

  return (
    <section className="mb-12">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-4">{title}</h2>
        <FilterPresets type="tv" onFiltersChange={handleFiltersChange} />
      </div>

      {loading && displayTVShows.length === 0 ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <MediaGrid items={displayItems} />

          {canLoadMore && (
            <LoadMoreButton onLoadMore={handleLoadMore} disabled={loading} />
          )}
        </>
      )}
    </section>
  );
}
