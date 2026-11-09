"use client";

import { useWatchlist } from "@/contexts/WatchlistContext";
import { cn } from "@/lib/utils";

interface WatchlistCounterProps {
  className?: string;
}

export function WatchlistCounter({ className }: WatchlistCounterProps) {
  const { watchlist, isLoading } = useWatchlist();

  if (isLoading || watchlist.length === 0) {
    return null;
  }

  const count = watchlist.length;

  return (
    <span
      className={cn(
        "bg-red-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-4.5 h-4.5 flex items-center justify-center",
        className,
      )}
    >
      {/* The badge caps at "99+" to fit. What is spoken is the real number, in
          words, as part of the name of the link the badge sits in – a bare
          "3" after "Watchlist" says nothing about what was counted. */}
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">
        {`, ${count} ${count === 1 ? "title" : "titles"} saved`}
      </span>
    </span>
  );
}
