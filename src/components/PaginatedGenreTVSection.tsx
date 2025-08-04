"use client";

import { useState } from "react";
import { TVShow } from "@/types/tmdb";
import { MediaSection } from "./MediaSection";
import { LoadMoreButton } from "./LoadMoreButton";
import { convertTVShowToMediaItem } from "@/lib/media-converters";

interface PaginatedGenreTVSectionProps {
  genreId: number;
  genreName: string;
  fetchFunction: (
    genreId: number,
    page: number
  ) => Promise<{ results: TVShow[]; total_pages: number }>;
  initialTVShows: TVShow[];
  initialPage?: number;
  initialTotalPages?: number;
}

export function PaginatedGenreTVSection({
  genreId,
  genreName,
  fetchFunction,
  initialTVShows,
  initialPage = 1,
  initialTotalPages = 1,
}: PaginatedGenreTVSectionProps) {
  const [tvShows, setTVShows] = useState<TVShow[]>(initialTVShows);
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

    setTVShows((prevTVShows) => {
      // Create a set of existing TV show IDs to avoid duplicates
      const existingIds = new Set(prevTVShows.map((show) => show.id));

      // Filter out TV shows that already exist
      const newShows = response.results.filter(
        (show) => !existingIds.has(show.id)
      );

      return [...prevTVShows, ...newShows];
    });
    setCurrentPage(nextPage);
    setTotalPages(response.total_pages);
    setHasNextPage(nextPage < response.total_pages);
  };

  const mediaItems = tvShows.map(convertTVShowToMediaItem);

  return (
    <div>
      <MediaSection
        title=""
        items={mediaItems}
        size="medium"
        emptyMessage={`No ${genreName.toLowerCase()} TV shows found.`}
        className="mb-0"
      />
      {hasNextPage && tvShows.length > 0 && (
        <LoadMoreButton onLoadMore={loadMore}>
          Load More {genreName} TV Shows
        </LoadMoreButton>
      )}
    </div>
  );
}
