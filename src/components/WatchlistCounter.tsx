"use client";

import { useWatchlist } from "@/contexts/WatchlistContext";

interface WatchlistCounterProps {
  className?: string;
}

export function WatchlistCounter({ className }: WatchlistCounterProps) {
  const { watchlist, isLoading } = useWatchlist();

  if (isLoading || watchlist.length === 0) {
    return null;
  }

  return (
    <span
      className={`bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-4.5 h-4.5 flex items-center justify-center ${className}`}
    >
      {watchlist.length > 99 ? "99+" : watchlist.length}
    </span>
  );
}
