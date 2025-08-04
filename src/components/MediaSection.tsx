"use client";

import { cn } from "@/lib/utils";
import { MediaItem } from "@/types/tmdb";
import { MediaGrid } from "./MediaGrid";
import { ViewModeToggle } from "./ViewModeToggle";

interface MediaSectionProps {
  title: string;
  items: MediaItem[];
  loading?: boolean;
  className?: string;
  size?: "small" | "medium" | "large";
  emptyMessage?: string;
  /**
   * Shows the card/list switch above the listing. Reserved for the main listing
   * of a page – the switch applies to every section, so one per page is enough.
   */
  showViewToggle?: boolean;
}

export function MediaSection({
  title,
  items,
  loading = false,
  className,
  size = "medium",
  emptyMessage = "No items found.",
  showViewToggle = false,
}: MediaSectionProps) {
  return (
    <section className={cn("mb-12", className)}>
      {(title || showViewToggle) && (
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          {title && <h2 className="text-2xl font-bold text-white">{title}</h2>}
          {showViewToggle && <ViewModeToggle className="ml-auto" />}
        </div>
      )}
      <MediaGrid
        items={items}
        loading={loading}
        size={size}
        emptyMessage={emptyMessage}
      />
    </section>
  );
}
