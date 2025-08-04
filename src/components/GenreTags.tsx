"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useGenres } from "@/contexts/GenresContext";
import { Genre } from "@/types/tmdb";
import { cn } from "@/lib/utils";

interface GenreTagsProps {
  // Can accept either genre_ids or complete genres
  genreIds?: number[];
  genres?: Genre[];
  mediaType?: "movie" | "tv";
  maxTags?: number;
  className?: string;
  variant?: "card" | "detail";
}

export function GenreTags({
  genreIds,
  genres,
  mediaType,
  maxTags = 3,
  className,
  variant = "detail",
}: GenreTagsProps) {
  const { movieGenres, tvGenres, loading } = useGenres();
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const displayGenres = useMemo(() => {
    // If we have genres directly, use them
    if (genres && genres.length > 0) {
      return genres.slice(0, maxTags);
    }

    // Otherwise use genreIds with context
    if (genreIds && genreIds.length > 0 && mediaType) {
      if (loading || !isClient) return [];

      const allGenres = mediaType === "movie" ? movieGenres : tvGenres;
      return allGenres
        .filter((genre) => genreIds.includes(genre.id))
        .slice(0, maxTags);
    }

    return [];
  }, [
    genres,
    genreIds,
    mediaType,
    maxTags,
    movieGenres,
    tvGenres,
    loading,
    isClient,
  ]);

  // If using genreIds but data is still loading, or we have no genres, or not client-side yet
  if ((genreIds && (loading || !isClient)) || displayGenres.length === 0) {
    return null;
  }

  const baseClasses = "flex flex-wrap gap-2";
  const variantClasses = {
    card: "gap-1",
    detail: "gap-2",
  };

  const tagClasses = {
    card: "px-2 py-1 bg-gray-700/80 text-gray-200 text-xs rounded-md",
    detail:
      "px-3 py-1 text-sm font-medium bg-white/20 text-white rounded-full backdrop-blur-sm",
  };

  return (
    <div className={cn(baseClasses, variantClasses[variant], className)}>
      {displayGenres.map((genre) => (
        <span key={genre.id} className={tagClasses[variant]}>
          {genre.name}
        </span>
      ))}
    </div>
  );
}
