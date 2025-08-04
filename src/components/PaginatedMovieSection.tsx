"use client";

import { useState } from "react";
import { Movie } from "@/types/tmdb";
import { MediaSection } from "./MediaSection";
import { LoadMoreButton } from "./LoadMoreButton";
import { convertMovieToMediaItem } from "@/lib/media-converters";

interface PaginatedMovieSectionProps {
  title: string;
  fetchFunction: (
    page: number
  ) => Promise<{ results: Movie[]; total_pages: number }>;
  initialMovies: Movie[];
  initialPage?: number;
  initialTotalPages?: number;
}

export function PaginatedMovieSection({
  title,
  fetchFunction,
  initialMovies,
  initialPage = 1,
  initialTotalPages = 1,
}: PaginatedMovieSectionProps) {
  const [movies, setMovies] = useState<Movie[]>(initialMovies);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [hasNextPage, setHasNextPage] = useState(
    initialPage < initialTotalPages
  );

  const loadMore = async () => {
    if (currentPage >= totalPages) {
      setHasNextPage(false);
      return;
    }

    const nextPage = currentPage + 1;
    const response = await fetchFunction(nextPage);

    setMovies((prevMovies) => {
      // Create a set of existing movie IDs to avoid duplicates
      const existingIds = new Set(prevMovies.map((movie) => movie.id));

      // Filter out movies that already exist
      const newMovies = response.results.filter(
        (movie) => !existingIds.has(movie.id)
      );

      return [...prevMovies, ...newMovies];
    });
    setCurrentPage(nextPage);
    setTotalPages(response.total_pages);
    setHasNextPage(nextPage < response.total_pages);
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
        <LoadMoreButton onLoadMore={loadMore}>Load More Movies</LoadMoreButton>
      )}
    </div>
  );
}
