"use client";

import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWatched } from "@/contexts/WatchedContext";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { toast } from "@/components/Toast";
import { MediaItem, MediaType } from "@/types/tmdb";

interface DetailPageWatchedButtonProps {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  voteAverage: number;
  mediaType: MediaType;
}

export function DetailPageWatchedButton({
  id,
  title,
  posterPath,
  releaseDate,
  voteAverage,
  mediaType,
}: DetailPageWatchedButtonProps) {
  const { addItem, removeItem, isWatched } = useWatched();
  const { removeItem: removeFromWatchlist, isInWatchlist } = useWatchlist();

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

  const watched = isWatched(id, mediaType);

  const handleClick = () => {
    if (watched) {
      if (removeItem(id, mediaType)) {
        toast.showToast(`Removed "${title}" from watched`, "success");
      }
      return;
    }

    if (!addItem(mediaItem)) return;

    // Having seen something answers the question the watchlist exists to ask,
    // so it stops waiting there.
    const wasQueued = isInWatchlist(id, mediaType);
    if (wasQueued) {
      removeFromWatchlist(id, mediaType);
    }

    toast.showToast(
      wasQueued
        ? `Marked "${title}" as watched and removed it from your watchlist`
        : `Marked "${title}" as watched`,
      "success",
    );
  };

  return (
    <div className="mt-6 inline-flex items-center">
      <button
        onClick={handleClick}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-black",
          watched
            ? "bg-green-600 hover:bg-green-700"
            : "bg-white/10 hover:bg-white/20",
        )}
        aria-pressed={watched}
      >
        <Eye className="w-4 h-4" aria-hidden="true" />
        {watched ? "Watched" : "Mark as watched"}
      </button>
    </div>
  );
}
