"use client";

import { MediaItem } from "@/types/tmdb";
import { MemoizedMediaCard } from "./MediaCard";
import { cn } from "@/lib/utils";

interface MediaGridProps {
  items: MediaItem[];
  loading?: boolean;
  className?: string;
  size?: "small" | "medium" | "large";
  emptyMessage?: string;
  forceShowOverlay?: boolean;
}

export function MediaGrid({
  items,
  loading = false,
  className,
  size = "medium",
  emptyMessage = "No items found.",
  forceShowOverlay = false,
}: MediaGridProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6",
          className
        )}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="w-full h-60 sm:h-72 bg-gray-700 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 media-grid",
        className
      )}
    >
      {items.map((item, index) => {
        const key = `${item.id}-${item.media_type}-${index}`;

        return (
          <MemoizedMediaCard
            key={key}
            item={item}
            size={size}
            forceShowOverlay={forceShowOverlay}
          />
        );
      })}
    </div>
  );
}
