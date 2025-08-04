"use client";

import { useEffect } from "react";
import { MediaItem } from "@/types/tmdb";
import { MemoizedMediaCard } from "./MediaCard";
import { cn } from "@/lib/utils";
import { useInitialHover } from "@/hooks/useInitialHover";

interface MediaGridProps {
  items: MediaItem[];
  loading?: boolean;
  className?: string;
  size?: "small" | "medium" | "large";
  emptyMessage?: string;
  onMouseEnter?: () => void;
  forceShowOverlay?: boolean;
}

export function MediaGrid({
  items,
  loading = false,
  className,
  size = "medium",
  emptyMessage = "No items found.",
  onMouseEnter,
  forceShowOverlay = false,
}: MediaGridProps) {
  const {
    elementRef,
    isHovered,
    handleMouseEnter: handleHover,
    handleMouseLeave,
    recheckHover,
  } = useInitialHover<HTMLDivElement>();

  const handleMouseEnter = () => {
    handleHover();
    onMouseEnter?.();
  };

  // Recheck hover state when items change (e.g., after loading more items)
  useEffect(() => {
    if (items.length > 0) {
      // Small delay to ensure DOM has been updated with new items
      const timeoutId = setTimeout(() => {
        recheckHover();
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [items.length, recheckHover]);

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
      ref={elementRef}
      className={cn(
        "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 media-grid",
        className
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {items.map((item, index) => {
        const key = `${item.id}-${item.media_type}-${index}`;

        return (
          <MemoizedMediaCard
            key={key}
            item={item}
            size={size}
            forceShowOverlay={forceShowOverlay || isHovered}
          />
        );
      })}
    </div>
  );
}
