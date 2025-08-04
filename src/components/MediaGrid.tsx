"use client";

import { MediaItem } from "@/types/tmdb";
import { MemoizedMediaCard } from "./MediaCard";
import { MemoizedMediaListRow } from "./MediaListRow";
import { useViewMode } from "@/hooks/useViewMode";
import { cn } from "@/lib/utils";

const GRID_CLASS =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6";
const LIST_CLASS = "flex flex-col gap-3";

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
  // A stored preference shared by every listing on the page, so switching the
  // layout in one section switches all of them.
  const { viewMode } = useViewMode();
  const isList = viewMode === "list";

  if (loading) {
    return isList ? (
      <div className={cn(LIST_CLASS, className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="w-full h-28 sm:h-32 bg-gray-700 rounded-lg animate-pulse"
          />
        ))}
      </div>
    ) : (
      <div className={cn(GRID_CLASS, className)}>
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

  if (isList) {
    return (
      <div className={cn(LIST_CLASS, "media-list", className)}>
        {items.map((item, index) => (
          <MemoizedMediaListRow
            key={`${item.id}-${item.media_type}-${index}`}
            item={item}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn(GRID_CLASS, "media-grid", className)}>
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
