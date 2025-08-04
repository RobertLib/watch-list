"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { MediaGrid } from "./MediaGrid";
import { LoadMoreButton } from "./LoadMoreButton";
import { FilterPresets } from "./FilterPresets";
import { LoadingSpinner } from "./LoadingSpinner";
import { discoverMoviesWithFilters } from "@/app/actions";
import { MOVIE_PRESETS } from "@/components/FilterPresets";
import type { Movie, MediaItem } from "@/types/tmdb";
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
    const preset = MOVIE_PRESETS.find((p) => p.id === presetId);
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

// Helper function to convert Movie to MediaItem
const movieToMediaItem = (movie: Movie): MediaItem => ({
  id: movie.id,
  title: movie.title,
  overview: movie.overview,
  poster_path: movie.poster_path,
  backdrop_path: movie.backdrop_path,
  release_date: movie.release_date,
  vote_average: movie.vote_average,
  vote_count: movie.vote_count,
  genre_ids: movie.genre_ids,
  media_type: "movie" as const,
  providers: movie.providers,
});

interface FilteredMovieSectionProps {
  title: string;
  initialMovies?: Movie[];
  initialTotalPages?: number;
}

export function FilteredMovieSection({
  title,
  initialMovies = [],
  initialTotalPages = 1,
}: FilteredMovieSectionProps) {
  const searchParams = useSearchParams();

  // Synchronously detect active filters from URL to avoid flashing unfiltered content
  // when the user navigates back to this page with a filter already applied.
  const initialFiltersFromURL = extractFiltersFromParams(searchParams);
  const initialHasFilters = checkHasActiveFilters(initialFiltersFromURL);

  const [movies, setMovies] = useState<Movie[]>(
    initialHasFilters ? [] : initialMovies,
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
  // Tracks the last filters loaded via handleFiltersChange to prevent double-fetch
  // when FilterBar both calls the callback and updates the URL simultaneously.
  const lastCallbackFilters = useRef<string>("");

  // Extract filters from URL parameters
  const getFiltersFromParams = useCallback((): FilterOptions => {
    return extractFiltersFromParams(searchParams);
  }, [searchParams]);

  // Load movies based on current filters
  const loadMovies = async (page: number = 1, filters: FilterOptions = {}) => {
    setLoading(true);
    try {
      const response = await discoverMoviesWithFilters(page, filters);

      if (page === 1) {
        setMovies(response.results);
      } else {
        setMovies((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          return [
            ...prev,
            ...response.results.filter((m) => !existingIds.has(m.id)),
          ];
        });
      }

      setCurrentPage(response.page);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error("Error loading movies:", error);
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
      // Mark these filters as handled so the URL-change useEffect can skip its duplicate fetch
      lastCallbackFilters.current = JSON.stringify(filters);
      loadMovies(1, filters);
    }
    // When clearing filters (!hasActiveFilters), let the useEffect reset state via URL change.
    // If there's no URL change (e.g. a preset that had no URL params), displayMovies already
    // falls back to initialMovies, so no explicit reset is needed here.
  };

  // Load movies when URL parameters change
  useEffect(() => {
    const filters = getFiltersFromParams();
    const hasActiveFilters = Object.values(filters).some(
      (value) =>
        value !== undefined && value !== "" && value !== "popularity.desc",
    );

    setHasFilters(hasActiveFilters);

    if (hasActiveFilters) {
      // Skip if handleFiltersChange already loaded these exact filters (prevents double-fetch
      // caused by FilterBar updating the URL and calling the callback simultaneously).
      const filtersKey = JSON.stringify(filters);
      if (filtersKey === lastCallbackFilters.current) {
        lastCallbackFilters.current = "";
        return;
      }
      setActiveFilters(filters);
      loadMovies(1, filters);
    } else {
      // Reset to initial movies if no filters
      lastCallbackFilters.current = "";
      setActiveFilters({});
      setMovies(initialMovies);
      setHasLoadedMore(false);
      setCurrentPage(1);
      setTotalPages(initialTotalPages);
    }
  }, [searchParams, initialMovies, initialTotalPages, getFiltersFromParams]);

  const handleLoadMore = async () => {
    if (currentPage < totalPages && !loading) {
      if (!hasFilters) setHasLoadedMore(true);
      await loadMovies(currentPage + 1, activeFilters);
    }
  };

  // Use the movies state when filters are active or when the user has loaded extra pages.
  // Otherwise fall back to the SSR-rendered initialMovies to avoid layout shifts.
  const displayMovies = hasFilters || hasLoadedMore ? movies : initialMovies;
  const displayItems: MediaItem[] = displayMovies.map(movieToMediaItem);
  const canLoadMore = currentPage < totalPages;

  return (
    <section className="mb-12">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-4">{title}</h2>
        <FilterPresets type="movie" onFiltersChange={handleFiltersChange} />
      </div>

      {loading && displayMovies.length === 0 ? (
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
