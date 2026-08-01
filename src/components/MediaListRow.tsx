"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, Calendar, Play } from "lucide-react";
import { MediaItem } from "@/types/tmdb";
import { getImageUrl } from "@/lib/tmdb-image";
import { GenreTags } from "./GenreTags";
import { VideoOverlay } from "./VideoOverlay";
import { WatchlistButton } from "./WatchlistButton";
import { WatchedButton } from "./WatchedButton";
import { useWatched } from "@/contexts/WatchedContext";
import { useVideoOverlay } from "@/hooks/useVideoOverlay";
import { cn, createSlug } from "@/lib/utils";

interface MediaListRowProps {
  item: MediaItem;
  className?: string;
}

/**
 * The list counterpart of MediaCard: the same title as a wide row, where the
 * metadata is read straight off the page instead of waiting behind a hover
 * overlay. Streaming availability is left to the card and the detail page –
 * every row is on screen at once, so lazy-loading it per row would fire a
 * request for the whole listing while scrolling.
 */
export function MediaListRow({ item, className }: MediaListRowProps) {
  const { isOpen, video, isLoading, openVideo, closeVideo } = useVideoOverlay();
  const { isWatched } = useWatched();

  const imageUrl = getImageUrl(item.poster_path, "w500");
  const year = item.release_date
    ? new Date(item.release_date).getFullYear()
    : null;
  const watched = isWatched(item.id, item.media_type);
  const detailUrl = `/${item.media_type}/${createSlug(item.title, item.id)}`;

  const handlePlayClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await openVideo(item.id, item.media_type);
  };

  return (
    <>
      <Link
        href={detailUrl}
        prefetch={false}
        className={cn(
          "block rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black",
          className,
        )}
        aria-label={`View details for ${item.title}${
          year ? ` (${year})` : ""
        }${watched ? " – watched" : ""}`}
      >
        <article
          className={cn(
            "flex gap-4 rounded-lg bg-gray-900 p-3 transition-colors hover:bg-gray-800",
            // Marks a title as already seen, same as the poster ring does
            watched && "ring-2 ring-green-500/60",
          )}
        >
          <div className="relative w-16 sm:w-20 shrink-0 aspect-2/3 overflow-hidden rounded-md bg-gray-800">
            <Image
              src={imageUrl}
              alt={`Poster for ${item.title}`}
              fill
              className="object-cover"
              sizes="80px"
            />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-white line-clamp-1">
              {item.title}
            </h3>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
              <span>{item.media_type === "tv" ? "TV show" : "Movie"}</span>

              {year && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" aria-hidden="true" />
                  {year}
                </span>
              )}

              <span
                className="flex items-center gap-1"
                role="img"
                aria-label={`Rating: ${item.vote_average?.toFixed(
                  1,
                )} out of 10 stars`}
              >
                <Star
                  className="w-3 h-3 fill-yellow-400 text-yellow-400"
                  aria-hidden="true"
                />
                {item.vote_average?.toFixed(1)}
              </span>
            </div>

            <GenreTags
              genreIds={item.genre_ids}
              mediaType={item.media_type}
              maxTags={3}
              variant="card"
              className="mt-2"
            />

            {/* Hiding happens on the wrapper: `line-clamp` owns the `display`
                of the paragraph itself. */}
            {item.overview && (
              <div className="hidden sm:block">
                <p className="mt-2 text-sm text-gray-400 line-clamp-2">
                  {item.overview}
                </p>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center justify-center gap-2 sm:flex-row">
            <button
              onClick={handlePlayClick}
              disabled={isLoading}
              className="bg-black/70 backdrop-blur-sm rounded-full p-2 transition-all duration-300 hover:bg-black/80 hover:scale-110 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-transparent"
              aria-label={`Play trailer for ${item.title}`}
              title="Play trailer"
            >
              <Play className="w-4 h-4 text-white" aria-hidden="true" />
            </button>

            <WatchlistButton item={item} />
            <WatchedButton item={item} />
          </div>
        </article>
      </Link>

      <VideoOverlay
        isOpen={isOpen}
        video={video}
        isLoading={isLoading}
        onClose={closeVideo}
      />
    </>
  );
}

// Memoized for the same reason MediaCard is: a listing renders a few dozen of
// these and re-renders whenever a filter or a watchlist entry changes.
export const MemoizedMediaListRow = React.memo(
  MediaListRow,
  (prevProps, nextProps) =>
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.media_type === nextProps.item.media_type &&
    prevProps.className === nextProps.className,
);
