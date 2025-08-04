"use client";

import { MediaItem } from "@/types/tmdb";
import { MemoizedMediaCard } from "./MediaCard";
import { MemoizedMediaListRow } from "./MediaListRow";
import { useViewMode } from "@/hooks/useViewMode";
import { cn } from "@/lib/utils";

// Count columns from the space this listing actually has: comparison lists can
// occupy only half the page even on a wide viewport.
const GRID_CLASS = "grid gap-4 sm:gap-6";
const GRID_SIZE_CLASSES = {
  small:
    "grid-cols-[repeat(auto-fill,minmax(min(100%,7rem),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,8rem),1fr))]",
  medium:
    "grid-cols-[repeat(auto-fill,minmax(min(100%,8rem),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] lg:grid-cols-[repeat(auto-fill,minmax(min(100%,12rem),1fr))]",
  large:
    "grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))]",
};
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
      <div className={cn(GRID_CLASS, GRID_SIZE_CLASSES[size], className)}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="w-full aspect-[2/3] bg-gray-700 rounded-lg animate-pulse"
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
    <div
      className={cn(GRID_CLASS, GRID_SIZE_CLASSES[size], "media-grid", className)}
    >
      {items.map((item, index) => {
        const key = `${item.id}-${item.media_type}-${index}`;

        return (
          <MemoizedMediaCard
            key={key}
            item={item}
            size={size}
            fluid
            forceShowOverlay={forceShowOverlay}
          />
        );
      })}
    </div>
  );
}
