"use client";

import { cn } from "@/lib/utils";
import { MediaItem } from "@/types/tmdb";
import { MediaGrid } from "./MediaGrid";

interface MediaSectionProps {
  title: string;
  items: MediaItem[];
  loading?: boolean;
  className?: string;
  size?: "small" | "medium" | "large";
  emptyMessage?: string;
}

export function MediaSection({
  title,
  items,
  loading = false,
  className,
  size = "medium",
  emptyMessage = "No items found.",
}: MediaSectionProps) {
  return (
    <section className={cn("mb-12", className)}>
      {title && <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>}
      <MediaGrid
        items={items}
        loading={loading}
        size={size}
        emptyMessage={emptyMessage}
      />
    </section>
  );
}
