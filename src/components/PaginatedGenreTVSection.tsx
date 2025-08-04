"use client";

import { useState, useEffect } from "react";
import { TVShow } from "@/types/tmdb";
import { MediaItem } from "@/types/tmdb";
import { MediaSection } from "./MediaSection";
import { LoadMoreButton } from "./LoadMoreButton";

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

function convertTVShowToMediaItem(tvShow: TVShow): MediaItem {
  return {
    id: tvShow.id,
    title: tvShow.name,
    overview: tvShow.overview,
    poster_path: tvShow.poster_path,
    backdrop_path: tvShow.backdrop_path,
    release_date: tvShow.first_air_date,
    vote_average: tvShow.vote_average,
    vote_count: tvShow.vote_count,
    genre_ids: tvShow.genre_ids,
    media_type: "tv" as const,
  };
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

  useEffect(() => {
    setTVShows(initialTVShows);
    setCurrentPage(initialPage);
    setTotalPages(initialTotalPages);
    setHasNextPage(initialPage < initialTotalPages);
  }, [initialTVShows, initialPage, initialTotalPages]);

  const loadMore = async () => {
    if (currentPage >= totalPages) {
      setHasNextPage(false);
      return;
    }

    const nextPage = currentPage + 1;
    const response = await fetchFunction(genreId, nextPage);

    setTVShows((prevTVShows) => [...prevTVShows, ...response.results]);
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
