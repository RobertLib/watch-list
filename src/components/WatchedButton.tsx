"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWatched } from "@/contexts/WatchedContext";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { toast } from "@/components/Toast";
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
  const { addItem, removeItem, isWatched } = useWatched();
  const { removeItem: removeFromWatchlist, isInWatchlist } = useWatchlist();
  const [isAnimating, setIsAnimating] = useState(false);

  const watched = isWatched(item.id, item.media_type);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsAnimating(true);

    if (watched) {
      const success = removeItem(item.id, item.media_type);
      if (success) {
        toast.showToast(`Removed "${item.title}" from watched`, "success");
      }
    } else {
      const success = addItem(item);
      if (success) {
        // Having seen something answers the question the watchlist exists to
        // ask, so it stops waiting there.
        const wasQueued = isInWatchlist(item.id, item.media_type);
        if (wasQueued) {
          removeFromWatchlist(item.id, item.media_type);
        }

        toast.showToast(
          wasQueued
            ? `Marked "${item.title}" as watched and removed it from your watchlist`
            : `Marked "${item.title}" as watched`,
          "success",
        );
      } else {
        toast.showToast(`"${item.title}" is already marked as watched`, "info");
      }
    }

    setTimeout(() => setIsAnimating(false), 300);
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
