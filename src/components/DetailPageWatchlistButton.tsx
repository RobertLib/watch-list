"use client";

import { useSyncExternalStore } from "react";
import { WatchlistButton } from "@/components/WatchlistButton";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { MediaItem } from "@/types/tmdb";
import { useT } from "@/i18n/LocaleProvider";

interface DetailPageWatchlistButtonProps {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  voteAverage: number;
  mediaType: "movie" | "tv";
}

export function DetailPageWatchlistButton({
  id,
  title,
  posterPath,
  releaseDate,
  voteAverage,
  mediaType,
}: DetailPageWatchlistButtonProps) {
  const { isInWatchlist } = useWatchlist();
  const t = useT();
  // Prevent hydration mismatch by not showing state-dependent content on server
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const mediaItem: MediaItem = {
    id,
    title,
    poster_path: posterPath,
    backdrop_path: null,
    overview: "",
    release_date: releaseDate,
    vote_average: voteAverage,
    vote_count: 0,
    genre_ids: [],
    media_type: mediaType,
  };

  const inWatchlist = isMounted ? isInWatchlist(id, mediaType) : false;

  return (
    <div className="flex items-center mt-6">
      <WatchlistButton item={mediaItem} variant="large" />
      <span className="ml-3 text-sm text-gray-300">
        {isMounted
          ? inWatchlist
            ? t("Remove from Watchlist", "Odebrat ze seznamu")
            : t("Add to Watchlist", "Přidat na seznam")
          : t("Watchlist", "Seznam")}
      </span>
    </div>
  );
}
