"use client";

import { useRef, useState } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTransientFlag } from "@/hooks/useTransientFlag";
import { useProfileGuard } from "@/hooks/useProfileGuard";
import { useWatched } from "@/contexts/WatchedContext";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { toast } from "@/components/Toast";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { setTitleWatched } from "@/lib/watched-actions";
import { MediaItem } from "@/types/tmdb";

interface WatchedButtonProps {
  item: MediaItem;
  variant?: "default" | "compact" | "large";
  className?: string;
}

export function WatchedButton({
  item,
  variant = "default",
  className,
}: WatchedButtonProps) {
  const { isWatched, refreshWatched, profileId } = useWatched();
  const { refreshWatchlist, profileId: watchlistProfileId } = useWatchlist();
  const { checkProfile } = useProfileGuard();
  const [isAnimating, animate] = useTransientFlag(300);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);

  const watched = isWatched(item.id, item.media_type);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (saving.current || !checkProfile(profileId)) return;
    if (!watched && watchlistProfileId !== profileId) {
      toast.showToast("Your active profile changed. Review the current title and try again.", "info");
      return;
    }
    saving.current = true;
    setIsSaving(true);
    try {
      animate();
      const result = await setTitleWatched(profileId, item, watched);
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
          `Marked "${item.title}" as watched, but your browser would not remove it from your watchlist`,
          "error",
        );
      } else if (result.status === "ok") {
        toast.showToast(
          watched
            ? `Removed "${item.title}" from watched`
            : result.removedFromWatchlist
              ? `Marked "${item.title}" as watched and removed it from your watchlist`
              : `Marked "${item.title}" as watched`,
          "success",
        );
      }
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case "compact":
        return "p-1.5";
      case "large":
        return "p-3 text-base";
      default:
        return "p-2";
    }
  };

  const getIconSize = () => {
    switch (variant) {
      case "compact":
        return "w-3 h-3";
      case "large":
        return "w-6 h-6";
      default:
        return "w-4 h-4";
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isSaving}
      aria-busy={isSaving}
      className={cn(
        "group relative bg-black/70 backdrop-blur-sm rounded-full transition-all duration-300 hover:bg-black/80 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-transparent",
        getVariantStyles(),
        isAnimating && "scale-125",
        watched && "bg-green-600/80 hover:bg-green-600/90",
        className,
      )}
      aria-label={
        watched
          ? `Mark ${item.title} as not watched`
          : `Mark ${item.title} as watched`
      }
      aria-pressed={watched}
      title={watched ? "Watched – click to undo" : "Mark as watched"}
    >
      <Eye
        className={cn(
          "text-white transition-all duration-300",
          getIconSize(),
          isAnimating && "scale-110",
        )}
        aria-hidden="true"
      />
    </button>
  );
}
