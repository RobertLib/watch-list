"use client";

import { useState } from "react";
import { Movie } from "@/types/tmdb";
import { MediaSection } from "./MediaSection";
import { SnapshotAwareLoadMore, type SnapshotState } from "./AsyncDiscoverySection";
import { convertMovieToMediaItem } from "@/lib/media-converters";
import { MAX_TMDB_PAGE, sanitizePage } from "@/lib/discover-filters";

interface PaginatedMovieSectionProps {
  title: string;
  fetchFunction: (
    page: number,
  ) => Promise<{ results: Movie[]; total_pages: number }>;
  initialMovies: Movie[];
  initialPage?: number;
  initialTotalPages?: number;
  /** From `AsyncDiscoverySection`: whether the first page is the build's snapshot. */
  snapshot?: SnapshotState;
}

export function PaginatedMovieSection({
  title,
  fetchFunction,
  initialMovies,
  initialPage = 1,
  initialTotalPages = 1,
  snapshot,
}: PaginatedMovieSectionProps) {
  const [movies, setMovies] = useState<Movie[]>(initialMovies);
  const [currentPage, setCurrentPage] = useState(sanitizePage(initialPage));
  const [totalPages, setTotalPages] = useState(
    Math.min(initialTotalPages, MAX_TMDB_PAGE),
  );
  const hasNextPage = currentPage < totalPages;

  const loadMore = async () => {
    if (currentPage >= totalPages) {
      return;
    }

    const nextPage = currentPage + 1;
    const response = await fetchFunction(nextPage);

    setMovies((prevMovies) => {
      // Create a set of existing movie IDs to avoid duplicates
      const existingIds = new Set(prevMovies.map((movie) => movie.id));

      // Filter out movies that already exist
      const newMovies = response.results.filter(
        (movie) => !existingIds.has(movie.id),
      );

      return [...prevMovies, ...newMovies];
    });
    setCurrentPage(nextPage);
    setTotalPages(Math.min(response.total_pages, MAX_TMDB_PAGE));
  };

  const mediaItems = movies.map(convertMovieToMediaItem);

  return (
    <div>
      <MediaSection
        title={title}
        items={mediaItems}
        size="medium"
        emptyMessage="No movies found."
      />
      {hasNextPage && movies.length > 0 && (
        <SnapshotAwareLoadMore snapshot={snapshot} onLoadMore={loadMore}>
          Load More Movies
        </SnapshotAwareLoadMore>
      )}
    </div>
  );
}
