"use client";

import { useState } from "react";
import { TVShow } from "@/types/tmdb";
import { MediaSection } from "./MediaSection";
import { SnapshotAwareLoadMore, type SnapshotState } from "./AsyncDiscoverySection";
import { convertTVShowToMediaItem } from "@/lib/media-converters";
import { MAX_TMDB_PAGE, sanitizePage } from "@/lib/discover-filters";

interface PaginatedTVSectionProps {
  title: string;
  fetchFunction: (
    page: number,
  ) => Promise<{ results: TVShow[]; total_pages: number }>;
  initialTVShows: TVShow[];
  initialPage?: number;
  initialTotalPages?: number;
  /** From `AsyncDiscoverySection`: whether the first page is the build's snapshot. */
  snapshot?: SnapshotState;
}

export function PaginatedTVSection({
  title,
  fetchFunction,
  initialTVShows,
  initialPage = 1,
  initialTotalPages = 1,
  snapshot,
}: PaginatedTVSectionProps) {
  const [tvShows, setTVShows] = useState<TVShow[]>(initialTVShows);
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

    setTVShows((prevTVShows) => {
      // Create a set of existing TV show IDs to avoid duplicates
      const existingIds = new Set(prevTVShows.map((show) => show.id));

      // Filter out TV shows that already exist
      const newShows = response.results.filter(
        (show) => !existingIds.has(show.id),
      );

      return [...prevTVShows, ...newShows];
    });
    setCurrentPage(nextPage);
    setTotalPages(Math.min(response.total_pages, MAX_TMDB_PAGE));
  };

  const mediaItems = tvShows.map(convertTVShowToMediaItem);

  return (
    <div>
      <MediaSection
        title={title}
        items={mediaItems}
        size="medium"
        emptyMessage="No TV shows found."
      />
      {hasNextPage && tvShows.length > 0 && (
        <SnapshotAwareLoadMore snapshot={snapshot} onLoadMore={loadMore}>
          Load More TV Shows
        </SnapshotAwareLoadMore>
      )}
    </div>
  );
}
