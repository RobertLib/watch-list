"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { MediaGrid } from "./MediaGrid";
import { LoadMoreButton } from "./LoadMoreButton";
import { FilterPresets, MOVIE_PRESETS } from "./FilterPresets";
import { LoadingSpinner } from "./LoadingSpinner";
import { ViewModeToggle } from "./ViewModeToggle";
import { discoverMoviesWithFilters } from "@/lib/api";
import {
  formatResultCount,
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
  const { options: resolvedOptions, isActive: hasFilters } =
    resolveDiscoverFilters(searchParams, "movie", MOVIE_PRESETS);
  const filtersKey = JSON.stringify(resolvedOptions);
  // `resolveDiscoverFilters` builds a fresh object every render, but the same URL
  // always serialises to the same key – so pinning the identity to that key lets
  // the effect below depend on the options themselves instead of reading them
  // out of a ref it had to write to during render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filterOptions = useMemo(() => resolvedOptions, [filtersKey]);

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

  // Leaving or changing the filters throws the current listing away. Done here
  // rather than in the effect below so the discarded results never reach the
  // screen, and so the effect is left with nothing to do but fetch.
  const [renderedKey, setRenderedKey] = useState(filtersKey);
  if (renderedKey !== filtersKey) {
    setRenderedKey(filtersKey);
    setMovies(hasFilters ? [] : initialMovies);
    setHasLoadedMore(false);
    setCurrentPage(1);
    setTotalPages(hasFilters ? 1 : initialTotalPages);
    setTotalResults(hasFilters ? undefined : initialTotalResults);
    setLoading(hasFilters);
  }

  // Load movies based on current filters
  // Load the first page whenever the filters in the URL change. The reset above
  // has already put the listing back to its loading state, so all that is left
  // here is the request itself.
  useEffect(() => {
    // The unfiltered listing is already on screen – it is what the section was
    // rendered with, and the reset above put it back.
    if (!hasFilters) return;

    // The filters can move on before this resolves; whatever comes back for the
    // filters the user has already left is dropped rather than painted over the
    // listing that replaced them.
    let isCurrent = true;

    discoverMoviesWithFilters(1, filterOptions).then(
      (response) => {
        if (!isCurrent) return;
        setMovies(response.results);
        setCurrentPage(response.page);
        setTotalPages(response.total_pages);
        setTotalResults(response.total_results);
        setLoading(false);
      },
      (error) => {
        if (!isCurrent) return;
        console.error("Error loading movies:", error);
        setLoading(false);
      },
    );

    return () => {
      isCurrent = false;
    };
  }, [filterOptions, hasFilters]);

  // Appends the next page to what is already there – the one path that adds to
  // the listing instead of replacing it.
  const handleLoadMore = async () => {
    if (currentPage >= totalPages || loading) return;

    if (!hasFilters) setHasLoadedMore(true);
    setLoading(true);

    try {
      const response = await discoverMoviesWithFilters(currentPage + 1, filterOptions);
      setMovies((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        return [
          ...prev,
          ...response.results.filter((m) => !existingIds.has(m.id)),
        ];
      });
      setCurrentPage(response.page);
      setTotalPages(response.total_pages);
      setTotalResults(response.total_results);
    } catch (error) {
      console.error("Error loading movies:", error);
    } finally {
      setLoading(false);
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
