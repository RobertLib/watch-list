"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LANGUAGES, releaseYears } from "@/types/filters";
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
import { useStreamingProviders } from "@/hooks/useStreamingProviders";
import { ANY_PROVIDERS, MY_PROVIDERS } from "@/lib/watch-provider-settings";
import type { Genre } from "@/types/tmdb";

const SELECT_CLASS =
  "w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const LABEL_CLASS = "block text-sm font-medium text-gray-300 mb-2";

/**
 * The bar's footprint, for the prerendered HTML.
 *
 * The bar reads its state from the query string, which a prerender does not
 * have, so a page that prerenders its listing (`GenreListing`) puts this in its
 * place until the browser renders the real one. Same box, same grid, same six
 * controls' height – so the listing below does not jump when the bar arrives.
 */
export function DiscoverFilterBarSkeleton({ emptyHint }: { emptyHint?: string }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-6 mb-8" aria-hidden="true">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="h-5 w-24 mb-2 bg-gray-800 rounded animate-pulse" />
            <div className="h-[42px] bg-gray-800 border border-gray-700 rounded-md" />
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-700 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-400">{emptyHint ?? " "}</span>
      </div>
    </div>
  );
}

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
  /**
   * Set while the listing the bar filters is still fetching. The bar's own
   * transition ends as soon as the URL has changed, which is before the new
   * results have even been asked for – so on its own, "Updating results…"
   * would be gone again before the request it describes went out.
   */
  resultsPending?: boolean;
  /** Shown in place of the active-filter chips while nothing is filtered. */
  emptyHint?: string;
  /**
   * Query parameters that identify the listing rather than filter it – the genre
   * and platform a genre page is *about*. Every push carries them along, because
   * dropping them would navigate away from the page instead of filtering it.
   */
  keepParams?: Record<string, string>;
}

export function DiscoverFilterBar({
  type,
  genres,
  genreParamKey = "genre",
  genreLabel = "Genre",
  genreAllLabel = "All Genres",
  totalResults,
  resultsPending = false,
  emptyHint,
  keepParams,
}: DiscoverFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const sortOptions = getSortOptions(type);
  const isMovie = type === "movie";

  const {
    providers,
    myProviders,
    otherProviders,
    isLoading: isLoadingProviders,
  } = useStreamingProviders(type);

  // The URL is the single source of truth – every control reads the validated
  // filters back out of it, so a shared link reproduces the exact same view.
  const filters = parseDiscoverFilters(searchParams, type, genreParamKey);
  const hasFilters = hasActiveDiscoverFilters(filters);

  // Filter changes reset pagination and drop any quick-filter preset, since the
  // preset and the individual filters describe two different result sets.
  const withKeptParams = (query: string) => {
    const params = new URLSearchParams(query);
    for (const [key, value] of Object.entries(keepParams ?? {})) {
      if (value) params.set(key, value);
    }

    const result = params.toString();
    return result ? `${pathname}?${result}` : pathname;
  };

  const applyFilters = (patch: Partial<DiscoverFilters>) => {
    const nextFilters = { ...filters, ...patch };
    startTransition(() => {
      router.push(
        withKeptParams(buildDiscoverFilterQuery(nextFilters, 1, genreParamKey)),
        { scroll: false },
      );
    });
  };

  const clearFilters = () => {
    startTransition(() => {
      router.push(withKeptParams(""), { scroll: false });
    });
  };

  // The platform list only arrives after the first paint, and a shared link can
  // name a platform the current region no longer offers, so the selected value
  // never depends on the list being there.
  const selectedProviderName = providers.find(
    (provider) => String(provider.provider_id) === filters.provider,
  )?.provider_name;
  const isUnlistedProvider = Boolean(
    filters.provider &&
      filters.provider !== ANY_PROVIDERS &&
      filters.provider !== MY_PROVIDERS &&
      !selectedProviderName,
  );
  const showMyProvidersOption =
    myProviders.length > 0 || filters.provider === MY_PROVIDERS;
  const myProvidersLabel = isLoadingProviders
    ? "My Platforms"
    : myProviders.length > 0
      ? `My Platforms (${myProviders.length})`
      : "My Platforms (none picked yet)";

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
      label: `Language: ${LANGUAGES.find((l) => l.code === filters.language)?.name}`,
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
  if (filters.provider) {
    activeChips.push({
      key: "provider",
      label: `Platform: ${
        filters.provider === MY_PROVIDERS
          ? "My platforms"
          : filters.provider === ANY_PROVIDERS
            ? "Any platform"
            : (selectedProviderName ?? `#${filters.provider}`)
      }`,
      patch: { provider: "" },
    });
  }

  return (
    <div className="bg-gray-900/50 rounded-lg p-6 mb-8">
      <fieldset>
        <legend className="sr-only">
          Filter and sort options for {isMovie ? "movies" : "TV shows"}
        </legend>

        {/* Every select is named by the <label> above it, and by nothing else.
            Each used to carry an `aria-label` as well, which replaced the
            visible text: "Min. Rating" was announced as "Filter by minimum
            rating" and "Sort By" as "Sort content by", so a voice command
            naming the control on screen found nothing (WCAG 2.5.3). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
            >
              <option value="">All Years</option>
              {releaseYears().map((year) => (
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
            >
              <option value="">Any Rating</option>
              {MIN_RATING_OPTIONS.map((rating) => (
                <option key={rating} value={rating}>
                  {rating}+ ⭐
                </option>
              ))}
            </select>
          </div>

          {/* Original language */}
          <div>
            <label htmlFor="filter-language-select" className={LABEL_CLASS}>
              Original Language
            </label>
            <select
              id="filter-language-select"
              value={filters.language}
              onChange={(e) => applyFilters({ language: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">All Languages</option>
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
            >
              <option value="">{genreAllLabel}</option>
              {genres.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {genre.name}
                </option>
              ))}
            </select>
          </div>

          {/* Streaming platform – either the ones saved in the profile, or any
              single platform available in the region. */}
          <div>
            <label htmlFor="filter-provider-select" className={LABEL_CLASS}>
              Streaming Platform
            </label>
            <select
              id="filter-provider-select"
              value={filters.provider}
              onChange={(e) => applyFilters({ provider: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">Use profile setting</option>
              <option value={ANY_PROVIDERS}>Any Platform</option>
              {showMyProvidersOption && (
                <option value={MY_PROVIDERS}>{myProvidersLabel}</option>
              )}
              {isUnlistedProvider && (
                <option value={filters.provider}>
                  {isLoadingProviders
                    ? "Loading platforms…"
                    : `Platform #${filters.provider}`}
                </option>
              )}
              {myProviders.length > 0 && (
                <optgroup label="My platforms">
                  {myProviders.map((provider) => (
                    <option
                      key={provider.provider_id}
                      value={provider.provider_id}
                    >
                      {provider.provider_name}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherProviders.length > 0 && (
                <optgroup
                  label={
                    myProviders.length > 0
                      ? "All other platforms"
                      : "All platforms"
                  }
                >
                  {otherProviders.map((provider) => (
                    <option
                      key={provider.provider_id}
                      value={provider.provider_id}
                    >
                      {provider.provider_name}
                    </option>
                  ))}
                </optgroup>
              )}
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

        {/* Kept mounted through a pending load – there is no count to show
            then – because a live region only announces changes to content it
            already held, not its own arrival. */}
        {(totalResults !== undefined || resultsPending) && (
          <span className="ml-auto text-sm text-gray-400" aria-live="polite">
            {isPending || resultsPending || totalResults === undefined
              ? "Updating results…"
              : formatResultCount(totalResults, type)}
          </span>
        )}
      </div>
    </div>
  );
}
