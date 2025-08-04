"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { MediaGrid } from "./MediaGrid";
import { LoadMoreButton } from "./LoadMoreButton";
import { FilterPresets } from "./FilterPresets";
import { LoadingSpinner } from "./LoadingSpinner";
import { discoverTVShowsWithFilters } from "@/app/actions";
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
}

export function FilteredTVSection({
  title,
  initialTVShows = [],
  initialTotalPages = 1,
}: FilteredTVSectionProps) {
  const searchParams = useSearchParams();
  const [tvShows, setTVShows] = useState<TVShow[]>(initialTVShows);
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

  // Load TV shows based on current filters
  const loadTVShows = async (page: number = 1, filters: FilterOptions = {}) => {
    setLoading(true);
    try {
      const response = await discoverTVShowsWithFilters(page, filters);

      if (page === 1) {
        setTVShows(response.results);
      } else {
        setTVShows((prev) => [...prev, ...response.results]);
      }

      setCurrentPage(response.page);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error("Error loading TV shows:", error);
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
    loadTVShows(1, filters);
  };

  // Load TV shows when URL parameters change
  useEffect(() => {
    const filters = getFiltersFromParams();
    const hasActiveFilters = Object.values(filters).some(
      (value) =>
        value !== undefined && value !== "" && value !== "popularity.desc"
    );

    setHasFilters(hasActiveFilters);

    if (hasActiveFilters) {
      loadTVShows(1, filters);
    } else {
      // Reset to initial TV shows if no filters
      setTVShows(initialTVShows);
      setCurrentPage(1);
      setTotalPages(initialTotalPages);
    }
  }, [searchParams, initialTVShows, initialTotalPages, getFiltersFromParams]);

  const handleLoadMore = async () => {
    if (currentPage < totalPages && !loading) {
      const filters = getFiltersFromParams();
      await loadTVShows(currentPage + 1, filters);
    }
  };

  const displayTVShows = hasFilters ? tvShows : initialTVShows;
  const displayItems: MediaItem[] = displayTVShows.map(tvShowToMediaItem);
  const canLoadMore = hasFilters ? currentPage < totalPages : false;

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
