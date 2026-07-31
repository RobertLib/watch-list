"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { MediaGrid } from "./MediaGrid";
import { LoadMoreButton } from "./LoadMoreButton";
import { FilterPresets, MOVIE_PRESETS } from "./FilterPresets";
import { LoadingSpinner } from "./LoadingSpinner";
import { ViewModeToggle } from "./ViewModeToggle";
import { discoverMoviesWithFilters } from "@/app/actions";
import {
  formatResultCount,
  resolveDiscoverFilters,
} from "@/lib/discover-filters";
import type { Movie, MediaItem } from "@/types/tmdb";
import type { FilterOptions } from "@/types/filters";

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
  initialTotalResults?: number;
}

export function FilteredMovieSection({
  title,
  initialMovies = [],
  initialTotalPages = 1,
  initialTotalResults,
}: FilteredMovieSectionProps) {
  const searchParams = useSearchParams();

  // The URL is the single source of truth: the filter bar and the presets only
  // push params, this section reacts to whatever ends up in the URL. Deriving it
  // during render also avoids flashing unfiltered content when the user lands
  // here with filters already applied.
  const { options: filterOptions, isActive: hasFilters } =
    resolveDiscoverFilters(searchParams, "movie", MOVIE_PRESETS);
  const filtersKey = JSON.stringify(filterOptions);
  // Read inside the effect without making the object identity a dependency.
  const filterOptionsRef = useRef(filterOptions);
  filterOptionsRef.current = filterOptions;

  const [movies, setMovies] = useState<Movie[]>(hasFilters ? [] : initialMovies);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    hasFilters ? 1 : initialTotalPages,
  );
  const [totalResults, setTotalResults] = useState(
    hasFilters ? undefined : initialTotalResults,
  );
  const [loading, setLoading] = useState(hasFilters);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);

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
      setTotalResults(response.total_results);
    } catch (error) {
      console.error("Error loading movies:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load movies whenever the filters in the URL change
  useEffect(() => {
    if (!hasFilters) {
      // Reset to the server-rendered listing
      setMovies(initialMovies);
      setHasLoadedMore(false);
      setCurrentPage(1);
      setTotalPages(initialTotalPages);
      setTotalResults(initialTotalResults);
      setLoading(false);
      return;
    }

    loadMovies(1, filterOptionsRef.current);
  }, [
    filtersKey,
    hasFilters,
    initialMovies,
    initialTotalPages,
    initialTotalResults,
  ]);

  const handleLoadMore = async () => {
    if (currentPage < totalPages && !loading) {
      if (!hasFilters) setHasLoadedMore(true);
      await loadMovies(currentPage + 1, filterOptions);
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
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <ViewModeToggle className="ml-auto" />
        </div>
        <FilterPresets type="movie" />
      </div>

      {loading && displayMovies.length === 0 ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-400 mb-4 min-h-5" aria-live="polite">
            {loading
              ? "Updating results…"
              : totalResults !== undefined &&
                formatResultCount(totalResults, "movie")}
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
