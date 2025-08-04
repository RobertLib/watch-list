"use client";

import { useState, useEffect } from "react";
import { Movie } from "@/types/tmdb";
import { MediaItem } from "@/types/tmdb";
import { MediaSection } from "./MediaSection";
import { LoadMoreButton } from "./LoadMoreButton";

interface PaginatedMovieSectionProps {
  title: string;
  fetchFunction: (
    page: number
  ) => Promise<{ results: Movie[]; total_pages: number }>;
  initialMovies: Movie[];
  initialPage?: number;
  initialTotalPages?: number;
}

function convertMovieToMediaItem(movie: Movie): MediaItem {
  return {
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
  };
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

  useEffect(() => {
    setMovies(initialMovies);
    setCurrentPage(initialPage);
    setTotalPages(initialTotalPages);
    setHasNextPage(initialPage < initialTotalPages);
  }, [initialMovies, initialPage, initialTotalPages]);

  const loadMore = async () => {
    if (currentPage >= totalPages) {
      setHasNextPage(false);
      return;
    }

    const nextPage = currentPage + 1;
    const response = await fetchFunction(nextPage);

    setMovies((prevMovies) => [...prevMovies, ...response.results]);
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
