"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useGenres } from "@/contexts/GenresContext";
import {
  MOVIE_SORT_OPTIONS,
  TV_SORT_OPTIONS,
  RELEASE_YEARS,
  LANGUAGES,
  type FilterOptions,
} from "@/types/filters";
import type { Genre } from "@/types/tmdb";
import { trackFilterApply, trackFilterClear } from "@/lib/analytics";

interface FilterBarProps {
  type: "movie" | "tv";
  onFiltersChange?: (filters: FilterOptions) => void;
}

export function FilterBar({ type, onFiltersChange }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { movieGenres, tvGenres } = useGenres();

  const genres = type === "movie" ? movieGenres : tvGenres;
  const sortOptions = type === "movie" ? MOVIE_SORT_OPTIONS : TV_SORT_OPTIONS;

  const currentSort = searchParams.get("sort_by") || "popularity.desc";
  const currentYear = searchParams.get("year") || "";
  const currentGenre = searchParams.get("genre") || "";
  const currentMinRating = searchParams.get("min_rating") || "";
  const currentLanguage = searchParams.get("language") || "";

  const updateFilters = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());

    // Update or remove parameters
    Object.entries(newParams).forEach(([key, value]) => {
      if (value && value !== "") {
        params.set(key, value);
        // Track filter application
        trackFilterApply(key, value, type);
      } else {
        params.delete(key);
      }
    });

    // Reset page when filters change
    params.delete("page");

    router.push(`${pathname}?${params.toString()}`, { scroll: false });

    // Call the callback if provided
    if (onFiltersChange) {
      const filters: FilterOptions = {
        sortBy: params.get("sort_by") || undefined,
        year: params.get("year") || undefined,
        genre: params.get("genre") || undefined,
        minRating: params.get("min_rating")
          ? Number(params.get("min_rating"))
          : undefined,
        withOriginalLanguage: params.get("language") || undefined,
      };
      onFiltersChange(filters);
    }
  };

  const clearFilters = () => {
    trackFilterClear(type);
    router.push(pathname, { scroll: false });

    if (onFiltersChange) {
      onFiltersChange({});
    }
  };

  const hasActiveFilters =
    currentYear ||
    currentGenre ||
    currentMinRating ||
    currentLanguage ||
    currentSort !== "popularity.desc";

  return (
    <div className="bg-gray-900/50 rounded-lg p-6 mb-8">
      <fieldset>
        <legend className="sr-only">
          Filter and sort options for {type === "movie" ? "movies" : "TV shows"}
        </legend>
        <div className="flex flex-wrap gap-4 items-end">
          {/* Sort By */}
          <div className="flex-1 min-w-50">
            <label
              htmlFor="sort-select"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Sort By
            </label>
            <select
              id="sort-select"
              value={currentSort}
              onChange={(e) => updateFilters({ sort_by: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Sort content by"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div className="flex-1 min-w-37.5">
            <label
              htmlFor="year-select"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              {type === "movie" ? "Release Year" : "First Air Year"}
            </label>
            <select
              id="year-select"
              value={currentYear}
              onChange={(e) => updateFilters({ year: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label={`Filter by ${
                type === "movie" ? "release" : "first air"
              } year`}
            >
              <option value="">All Years</option>
              {RELEASE_YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Genre Filter */}
          <div className="flex-1 min-w-37.5">
            <label
              htmlFor="genre-select"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Genre
            </label>
            <select
              id="genre-select"
              value={currentGenre}
              onChange={(e) => updateFilters({ genre: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Filter by genre"
            >
              <option value="">All Genres</option>
              {genres.map((genre: Genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.name}
                </option>
              ))}
            </select>
          </div>

          {/* Minimum Rating */}
          <div className="flex-1 min-w-37.5">
            <label
              htmlFor="rating-select"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Min. Rating
            </label>
            <select
              id="rating-select"
              value={currentMinRating}
              onChange={(e) => updateFilters({ min_rating: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Filter by minimum rating"
            >
              <option value="">Any Rating</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((rating) => (
                <option key={rating} value={rating}>
                  {rating}+ ⭐
                </option>
              ))}
            </select>
          </div>

          {/* Country/Language Filter */}
          <div className="flex-1 min-w-37.5">
            <label
              htmlFor="language-select"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Country of Origin
            </label>
            <select
              id="language-select"
              value={currentLanguage}
              onChange={(e) => updateFilters({ language: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Filter by country of origin"
            >
              <option value="">All Countries</option>
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <div className="shrink-0">
              <button
                onClick={clearFilters}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition-colors duration-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                aria-label="Clear all active filters"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </fieldset>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-gray-400" id="active-filters-label">
              Active filters:
            </span>
            <div role="list" aria-labelledby="active-filters-label">
              {currentSort !== "popularity.desc" && (
                <span
                  role="listitem"
                  className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
                >
                  Sort:{" "}
                  {sortOptions.find((o) => o.value === currentSort)?.label}
                </span>
              )}
              {currentYear && (
                <span
                  role="listitem"
                  className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
                >
                  Year: {currentYear}
                </span>
              )}
              {currentGenre && (
                <span
                  role="listitem"
                  className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
                >
                  Genre:{" "}
                  {
                    genres.find((g: Genre) => g.id.toString() === currentGenre)
                      ?.name
                  }
                </span>
              )}
              {currentMinRating && (
                <span
                  role="listitem"
                  className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
                >
                  Min Rating: {currentMinRating}+
                </span>
              )}
              {currentLanguage && (
                <span
                  role="listitem"
                  className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
                >
                  Country:{" "}
                  {LANGUAGES.find((l) => l.code === currentLanguage)?.name}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
