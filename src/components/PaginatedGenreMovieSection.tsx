"use client";

import { useState } from "react";
import { Movie } from "@/types/tmdb";
import { MediaSection } from "./MediaSection";
import { LoadMoreButton } from "./LoadMoreButton";
import { convertMovieToMediaItem } from "@/lib/media-converters";

interface PaginatedGenreMovieSectionProps {
  genreId: number;
  genreName: string;
  fetchFunction: (
    genreId: number,
    page: number
  ) => Promise<{ results: Movie[]; total_pages: number }>;
  initialMovies: Movie[];
  initialPage?: number;
  initialTotalPages?: number;
}

export function PaginatedGenreMovieSection({
  genreId,
  genreName,
  fetchFunction,
  initialMovies,
  initialPage = 1,
  initialTotalPages = 1,
}: PaginatedGenreMovieSectionProps) {
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
    const response = await fetchFunction(genreId, nextPage);

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
        title=""
        items={mediaItems}
        size="medium"
        emptyMessage={`No ${genreName.toLowerCase()} movies found.`}
        className="mb-0"
      />
      {hasNextPage && movies.length > 0 && (
        <LoadMoreButton onLoadMore={loadMore}>
          Load More {genreName} Movies
        </LoadMoreButton>
      )}
    </div>
  );
}
