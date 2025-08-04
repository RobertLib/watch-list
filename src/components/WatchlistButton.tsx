"use client";

import { useState, useSyncExternalStore } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { toast } from "@/components/Toast";
import { MediaItem } from "@/types/tmdb";
import { trackWatchlistAdd, trackWatchlistRemove } from "@/lib/analytics";

interface WatchlistButtonProps {
  item: MediaItem;
  variant?: "default" | "compact" | "large";
  className?: string;
}

export function WatchlistButton({
  item,
  variant = "default",
  className,
}: WatchlistButtonProps) {
  const { addItem, removeItem, isInWatchlist } = useWatchlist();
  const [isAnimating, setIsAnimating] = useState(false);
  // Prevent hydration mismatch by not showing state-dependent content on server
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const inWatchlist = isMounted
    ? isInWatchlist(item.id, item.media_type as "movie" | "tv")
    : false;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsAnimating(true);

    if (inWatchlist) {
      const success = removeItem(item.id, item.media_type as "movie" | "tv");
      if (success) {
        trackWatchlistRemove(
          item.id,
          item.media_type as "movie" | "tv",
          item.title
        );
        toast.showToast(`Removed "${item.title}" from watchlist`, "success");
      }
    } else {
      const success = addItem(item);
      if (success) {
        trackWatchlistAdd(
          item.id,
          item.media_type as "movie" | "tv",
          item.title
        );
        toast.showToast(`Added "${item.title}" to watchlist`, "success");
      } else {
        toast.showToast(`"${item.title}" is already in your watchlist`, "info");
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
        "group relative bg-black/70 backdrop-blur-sm rounded-full transition-all duration-300 hover:bg-black/80 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-transparent",
        getVariantStyles(),
        isAnimating && "scale-125",
        isMounted && inWatchlist && "bg-red-600/80 hover:bg-red-600/90",
        className
      )}
      aria-label={
        isMounted
          ? inWatchlist
            ? `Remove ${item.title} from watchlist`
            : `Add ${item.title} to watchlist`
          : "Toggle watchlist"
      }
      title={
        isMounted
          ? inWatchlist
            ? "Remove from watchlist"
            : "Add to watchlist"
          : "Watchlist"
      }
    >
      <div className="relative">
        {isMounted && inWatchlist ? (
          <Heart
            className={cn(
              "text-white fill-current transition-all duration-300",
              getIconSize(),
              isAnimating && "scale-110"
            )}
            aria-hidden="true"
          />
        ) : (
          <Heart
            className={cn(
              "text-white transition-all duration-300 hover:fill-white hover:text-white",
              getIconSize()
            )}
            aria-hidden="true"
          />
        )}
      </div>
    </button>
  );
}
