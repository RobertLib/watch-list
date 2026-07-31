"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LANGUAGES, RELEASE_YEARS } from "@/types/filters";
import {
  buildDiscoverFilterQuery,
  DEFAULT_SORT,
  formatResultCount,
  getSortOptions,
  hasActiveDiscoverFilters,
  MIN_RATING_OPTIONS,
  parseDiscoverFilters,
  type DiscoverFilters,
  type DiscoverMediaType,
  type GenreParamKey,
} from "@/lib/discover-filters";
import type { Genre } from "@/types/tmdb";

const SELECT_CLASS =
  "w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const LABEL_CLASS = "block text-sm font-medium text-gray-300 mb-2";

interface DiscoverFilterBarProps {
  type: DiscoverMediaType;
  /** Options of the genre select. */
  genres: Genre[];
  /**
   * On the genre detail pages the select narrows the listing with a *second*
   * genre, so it is labelled differently and travels under its own query key.
   */
  genreParamKey?: GenreParamKey;
  genreLabel?: string;
  genreAllLabel?: string;
  /** When given, the bar shows the result count (and its own pending state). */
  totalResults?: number;
  /** Shown in place of the active-filter chips while nothing is filtered. */
  emptyHint?: string;
}

export function DiscoverFilterBar({
  type,
  genres,
  genreParamKey = "genre",
  genreLabel = "Genre",
  genreAllLabel = "All Genres",
  totalResults,
  emptyHint,
}: DiscoverFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const sortOptions = getSortOptions(type);
  const isMovie = type === "movie";

  // The URL is the single source of truth – every control reads the validated
  // filters back out of it, so a shared link reproduces the exact same view.
  const filters = parseDiscoverFilters(searchParams, type, genreParamKey);
  const hasFilters = hasActiveDiscoverFilters(filters);

  // Filter changes reset pagination and drop any quick-filter preset, since the
  // preset and the individual filters describe two different result sets.
  const applyFilters = (patch: Partial<DiscoverFilters>) => {
    const nextFilters = { ...filters, ...patch };
    startTransition(() => {
      router.push(
        `${pathname}${buildDiscoverFilterQuery(nextFilters, 1, genreParamKey)}`,
        { scroll: false },
      );
    });
  };

  const clearFilters = () => {
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  };

  const activeChips: {
    key: string;
    label: string;
    patch: Partial<DiscoverFilters>;
  }[] = [];

  if (filters.sortBy) {
    activeChips.push({
      key: "sortBy",
      label: `Sort: ${sortOptions.find((o) => o.value === filters.sortBy)?.label}`,
      patch: { sortBy: "" },
    });
  }
  if (filters.year) {
    activeChips.push({
      key: "year",
      label: `${isMovie ? "Year" : "First aired"}: ${filters.year}`,
      patch: { year: "" },
    });
  }
  if (filters.minRating) {
    activeChips.push({
      key: "minRating",
      label: `Rating: ${filters.minRating}+`,
      patch: { minRating: "" },
    });
  }
  if (filters.language) {
    activeChips.push({
      key: "language",
      label: `Country: ${LANGUAGES.find((l) => l.code === filters.language)?.name}`,
      patch: { language: "" },
    });
  }
  if (filters.genre) {
    const selected = genres.find((g) => String(g.id) === filters.genre);
    activeChips.push({
      key: "genre",
      label: `${genreLabel}: ${selected?.name ?? filters.genre}`,
      patch: { genre: "" },
    });
  }

  return (
    <div className="bg-gray-900/50 rounded-lg p-6 mb-8">
      <fieldset>
        <legend className="sr-only">
          Filter and sort options for {isMovie ? "movies" : "TV shows"}
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Sort By */}
          <div>
            <label htmlFor="filter-sort-select" className={LABEL_CLASS}>
              Sort By
            </label>
            <select
              id="filter-sort-select"
              value={filters.sortBy}
              onChange={(e) => applyFilters({ sortBy: e.target.value })}
              className={SELECT_CLASS}
              aria-label="Sort content by"
            >
              {/* The default sort is represented by an empty value so that it
                  never shows up in the URL. */}
              <option value="">Most Popular</option>
              {sortOptions
                .filter((option) => option.value !== DEFAULT_SORT)
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label htmlFor="filter-year-select" className={LABEL_CLASS}>
              {isMovie ? "Release Year" : "First Air Year"}
            </label>
            <select
              id="filter-year-select"
              value={filters.year}
              onChange={(e) => applyFilters({ year: e.target.value })}
              className={SELECT_CLASS}
              aria-label={`Filter by ${isMovie ? "release" : "first air"} year`}
            >
              <option value="">All Years</option>
              {RELEASE_YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Minimum Rating */}
          <div>
            <label htmlFor="filter-rating-select" className={LABEL_CLASS}>
              Min. Rating
            </label>
            <select
              id="filter-rating-select"
              value={filters.minRating}
              onChange={(e) => applyFilters({ minRating: e.target.value })}
              className={SELECT_CLASS}
              aria-label="Filter by minimum rating"
            >
              <option value="">Any Rating</option>
              {MIN_RATING_OPTIONS.map((rating) => (
                <option key={rating} value={rating}>
                  {rating}+ ⭐
                </option>
              ))}
            </select>
          </div>

          {/* Country of Origin */}
          <div>
            <label htmlFor="filter-language-select" className={LABEL_CLASS}>
              Country of Origin
            </label>
            <select
              id="filter-language-select"
              value={filters.language}
              onChange={(e) => applyFilters({ language: e.target.value })}
              className={SELECT_CLASS}
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

          {/* Genre */}
          <div>
            <label htmlFor="filter-genre-select" className={LABEL_CLASS}>
              {genreLabel}
            </label>
            <select
              id="filter-genre-select"
              value={filters.genre}
              onChange={(e) => applyFilters({ genre: e.target.value })}
              className={SELECT_CLASS}
              aria-label={`Filter by ${genreLabel.toLowerCase()}`}
            >
              <option value="">{genreAllLabel}</option>
              {genres.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      {/* Active filters + result count */}
      <div className="mt-4 pt-4 border-t border-gray-700 flex flex-wrap items-center gap-2">
        {hasFilters ? (
          <>
            <span className="text-sm text-gray-400" id="active-filters-label">
              Active filters:
            </span>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-labelledby="active-filters-label"
            >
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => applyFilters(chip.patch)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
                  aria-label={`Remove filter ${chip.label}`}
                >
                  {chip.label} ✕
                </button>
              ))}
            </div>
            <button
              onClick={clearFilters}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              aria-label="Clear all active filters"
            >
              Clear Filters
            </button>
          </>
        ) : (
          emptyHint && <span className="text-sm text-gray-400">{emptyHint}</span>
        )}

        {totalResults !== undefined && (
          <span className="ml-auto text-sm text-gray-400" aria-live="polite">
            {isPending
              ? "Updating results…"
              : formatResultCount(totalResults, type)}
          </span>
        )}
      </div>
    </div>
  );
}
