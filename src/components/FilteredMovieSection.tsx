"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { MediaGrid } from "./MediaGrid";
import { LoadMoreButton } from "./LoadMoreButton";
import { FilterPresets } from "./FilterPresets";
import { LoadingSpinner } from "./LoadingSpinner";
import { discoverMoviesWithFilters } from "@/app/actions";
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
}

export function FilteredMovieSection({
  title,
  initialMovies = [],
  initialTotalPages = 1,
}: FilteredMovieSectionProps) {
  const searchParams = useSearchParams();
  const [movies, setMovies] = useState<Movie[]>(initialMovies);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [loading, setLoading] = useState(false);
  const [hasFilters, setHasFilters] = useState(false);

  // Extract filters from URL parameters
  const getFiltersFromParams = useCallback((): FilterOptions => {
    const filters: FilterOptions = {};

    const sortBy = searchParams.get("sort_by");
    if (sortBy) filters.sortBy = sortBy;

    const year = searchParams.get("year");
    if (year) filters.year = year;

    const genre = searchParams.get("genre");
    if (genre) filters.genre = genre;

    const minRating = searchParams.get("min_rating");
    if (minRating) filters.minRating = Number(minRating);

    const language = searchParams.get("language");
    if (language) filters.withOriginalLanguage = language;

    return filters;
  }, [searchParams]);

  // Load movies based on current filters
  const loadMovies = async (page: number = 1, filters: FilterOptions = {}) => {
    setLoading(true);
    try {
      const response = await discoverMoviesWithFilters(page, filters);

      if (page === 1) {
        setMovies(response.results);
      } else {
        setMovies((prev) => [...prev, ...response.results]);
      }

      setCurrentPage(response.page);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error("Error loading movies:", error);
    } finally {
      setLoading(false);
    }
  };

  // Handle filter changes
  const handleFiltersChange = (filters: FilterOptions) => {
    const hasActiveFilters = Object.values(filters).some(
      (value) =>
        value !== undefined && value !== "" && value !== "popularity.desc"
    );
    setHasFilters(hasActiveFilters);
    loadMovies(1, filters);
  };

  // Load movies when URL parameters change
  useEffect(() => {
    const filters = getFiltersFromParams();
    const hasActiveFilters = Object.values(filters).some(
      (value) =>
        value !== undefined && value !== "" && value !== "popularity.desc"
    );

    setHasFilters(hasActiveFilters);

    if (hasActiveFilters) {
      loadMovies(1, filters);
    } else {
      // Reset to initial movies if no filters
      setMovies(initialMovies);
      setCurrentPage(1);
      setTotalPages(initialTotalPages);
    }
  }, [searchParams, initialMovies, initialTotalPages, getFiltersFromParams]);

  const handleLoadMore = async () => {
    if (currentPage < totalPages && !loading) {
      const filters = getFiltersFromParams();
      await loadMovies(currentPage + 1, filters);
    }
  };

  const displayMovies = hasFilters ? movies : initialMovies;
  const displayItems: MediaItem[] = displayMovies.map(movieToMediaItem);
  const canLoadMore = hasFilters ? currentPage < totalPages : false;

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
