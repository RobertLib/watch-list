"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { MediaGrid } from "./MediaGrid";
import { LoadMoreButton } from "./LoadMoreButton";
import { LoadFailureNotice } from "./LoadFailureNotice";
import { FilterPresets } from "./FilterPresets";
import { LoadingSpinner } from "./LoadingSpinner";
import { ViewModeToggle } from "./ViewModeToggle";
import { discoverMoviesWithFilters, getPopularMovies } from "@/lib/api";
import { getMoviePresets } from "@/lib/filter-presets";
import { useLocalDay } from "@/hooks/useLocalDay";
import {
  formatResultCount,
  MAX_TMDB_PAGE,
  resolveDiscoverFilters,
} from "@/lib/discover-filters";
import type { Movie, MediaItem } from "@/types/tmdb";

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
  initialLoadError?: boolean;
  onInitialRetry?: () => void;
}

export function FilteredMovieSection({
  title,
  initialMovies = [],
  initialTotalPages = 1,
  initialTotalResults,
  initialLoadError = false,
  onInitialRetry,
}: FilteredMovieSectionProps) {
  const searchParams = useSearchParams();
  // Relative presets follow local midnight and a suspended tab becoming visible.
  const day = useLocalDay();
  const presets = getMoviePresets(day);
  const localDayReady = day !== "";

  // The URL is the single source of truth: the filter bar and the presets only
  // push params, this section reacts to whatever ends up in the URL. Deriving it
  // during render also avoids flashing unfiltered content when the user lands
  // here with filters already applied.
  const { options: resolvedOptions, isActive: hasFilters } =
    resolveDiscoverFilters(searchParams, "movie", presets);
  const filtersKey = JSON.stringify(resolvedOptions);
  // `resolveDiscoverFilters` builds a fresh object every render, but unchanged
  // filter values serialise to the same key – so pinning the identity to it lets
  // the effect below depend on the options themselves instead of reading them
  // out of a ref it had to write to during render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filterOptions = useMemo(() => resolvedOptions, [filtersKey]);

  const [movies, setMovies] = useState<Movie[]>(hasFilters ? [] : initialMovies);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(
    hasFilters ? 1 : Math.min(initialTotalPages, MAX_TMDB_PAGE),
  );
  const [totalResults, setTotalResults] = useState(
    hasFilters ? undefined : initialTotalResults,
  );
  const [loading, setLoading] = useState(hasFilters);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const requestGeneration = useRef(0);

  // Leaving or changing the filters throws the current listing away. Done here
  // rather than in the effect below so the discarded results never reach the
  // screen, and so the effect is left with nothing to do but fetch.
  const [renderedKey, setRenderedKey] = useState(filtersKey);
  if (renderedKey !== filtersKey) {
    setRenderedKey(filtersKey);
    setMovies(hasFilters ? [] : initialMovies);
    setHasLoadedMore(false);
    setCurrentPage(1);
    setTotalPages(hasFilters ? 1 : Math.min(initialTotalPages, MAX_TMDB_PAGE));
    setTotalResults(hasFilters ? undefined : initialTotalResults);
    setLoading(hasFilters);
    setHasLoadError(false);
  }

  // Load movies based on current filters
  // Load the first page whenever the filters in the URL change. The reset above
  // has already put the listing back to its loading state, so all that is left
  // here is the request itself.
  useEffect(() => {
    const generation = ++requestGeneration.current;

    // The unfiltered listing is already on screen – it is what the section was
    // rendered with, and the reset above put it back.
    // Static export hydration starts without the visitor's day. Wait for the
    // browser snapshot so dated presets never request an unbounded first page.
    if (hasFilters && localDayReady) {
      discoverMoviesWithFilters(1, filterOptions).then(
        (response) => {
          if (generation !== requestGeneration.current) return;
          setMovies(response.results);
          setCurrentPage(response.page);
          setTotalPages(Math.min(response.total_pages, MAX_TMDB_PAGE));
          setTotalResults(response.total_results);
          setLoading(false);
        },
        (error) => {
          if (generation !== requestGeneration.current) return;
          console.error("Error loading movies:", error);
          setHasLoadError(true);
          setLoading(false);
        },
      );
    }

    return () => {
      // Invalidate both the first page and any pagination still in flight.
      requestGeneration.current += 1;
    };
  }, [filterOptions, hasFilters, localDayReady, loadAttempt]);

  const retryLoad = () => {
    setHasLoadError(false);
    setLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  };

  // Appends the next page to what is already there – the one path that adds to
  // the listing instead of replacing it.
  const handleLoadMore = async () => {
    if (currentPage >= totalPages || loading) return;

    const generation = requestGeneration.current;
    if (!hasFilters) setHasLoadedMore(true);
    setLoading(true);

    try {
      const response = await (hasFilters
        ? discoverMoviesWithFilters(currentPage + 1, filterOptions)
        : getPopularMovies(currentPage + 1));
      if (generation !== requestGeneration.current) return;
      setMovies((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        return [
          ...prev,
          ...response.results.filter((m) => !existingIds.has(m.id)),
        ];
      });
      setCurrentPage(response.page);
      setTotalPages(Math.min(response.total_pages, MAX_TMDB_PAGE));
      setTotalResults(response.total_results);
    } catch (error) {
      // The shared button owns pagination feedback. Only the current listing
      // may report a failure; an abandoned query must stay silent.
      if (generation === requestGeneration.current) throw error;
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  // Use the movies state when filters are active or when the user has loaded extra pages.
  // Otherwise fall back to the SSR-rendered initialMovies to avoid layout shifts.
  const displayMovies = hasFilters || hasLoadedMore ? movies : initialMovies;
  const displayItems: MediaItem[] = displayMovies.map(movieToMediaItem);
  const canLoadMore = currentPage < totalPages;
  // A failed popular request must not look like an empty successful listing.
  // URL filters use their own request and remain usable through that failure.
  const initialLoadFailed = !hasFilters && initialLoadError;

  return (
    <section className="mb-12">
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <ViewModeToggle className="ml-auto" />
        </div>
        <FilterPresets type="movie" presets={presets} />
      </div>

      {hasLoadError || initialLoadFailed ? (
        <LoadFailureNotice
          title="Could not load movies"
          onRetry={initialLoadFailed ? onInitialRetry : retryLoad}
          compact
        />
      ) : loading && displayMovies.length === 0 ? (
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
            <LoadMoreButton key={filtersKey} onLoadMore={handleLoadMore} disabled={loading} />
          )}
        </>
      )}
    </section>
  );
}
