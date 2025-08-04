"use client";

import { useRef, useState } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWatched } from "@/contexts/WatchedContext";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useProfileGuard } from "@/hooks/useProfileGuard";
import { toast } from "@/components/Toast";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { setTitleWatched } from "@/lib/watched-actions";
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
  const { isWatched, refreshWatched, profileId } = useWatched();
  const { refreshWatchlist, profileId: watchlistProfileId } = useWatchlist();
  const { checkProfile } = useProfileGuard();
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);

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

  const handleClick = async () => {
    if (saving.current || !checkProfile(profileId)) return;
    if (!watched && watchlistProfileId !== profileId) {
      toast.showToast("Your active profile changed. Review the current title and try again.", "info");
      return;
    }
    saving.current = true;
    setIsSaving(true);
    try {
      const result = await setTitleWatched(profileId, mediaItem, watched);
      // Refresh outside the write scope: the active owner may have changed
      // while the complete action was waiting behind a restore or deletion.
      refreshWatched();
      refreshWatchlist();
      if (result.status === "profile-unavailable") {
        toast.showToast("The profile for this action was deleted. Review the current title and try again.", "info");
      } else if (result.status === "changed") {
        toast.showToast("Your watched list changed. Review the current title and try again.", "info");
      } else if (result.status === "failed") {
        toast.showToast(STORAGE_REFUSED_MESSAGE, "error");
      } else if (result.status === "watchlist-failed") {
        toast.showToast(
          `Marked "${title}" as watched, but your browser would not remove it from your watchlist`,
          "error",
        );
      } else if (result.status === "ok") {
        toast.showToast(
          watched
            ? `Removed "${title}" from watched`
            : result.removedFromWatchlist
              ? `Marked "${title}" as watched and removed it from your watchlist`
              : `Marked "${title}" as watched`,
          "success",
        );
      }
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-6 inline-flex items-center">
      <button
        onClick={handleClick}
        disabled={isSaving}
        aria-busy={isSaving}
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
