"use client";

import React, { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, Calendar, Play, X } from "lucide-react";
import { MediaItem, WatchProvider } from "@/types/tmdb";
import { getImageUrl } from "@/lib/tmdb-image";
import { WatchProviders } from "./WatchProviders";
import { getTitleProviders } from "@/lib/title-providers";
import { GenreTags } from "./GenreTags";
import { VideoOverlay } from "./VideoOverlay";
import { WatchlistButton } from "./WatchlistButton";
import { WatchedButton } from "./WatchedButton";
import { useWatched } from "@/contexts/WatchedContext";
import { useVideoOverlay } from "@/hooks/useVideoOverlay";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn, createSlug } from "@/lib/utils";
import { releaseYear } from "@/lib/dates";
import { mediaHref } from "@/lib/routes";

interface MediaCardProps {
  item: MediaItem;
  size?: "small" | "medium" | "large";
  showOverlay?: boolean;
  className?: string;
  providers?: WatchProvider[];
  loadingProviders?: boolean;
  forceShowOverlay?: boolean;
  onCardClick?: () => void;
}

/** What the lazy lookup answered, and for which title it answered. */
interface FetchedProviders {
  key: string;
  providers: WatchProvider[];
}

export function MediaCard({
  item,
  size = "medium",
  showOverlay = true,
  className,
  providers: providedProviders,
  loadingProviders: providedLoadingState = false,
  forceShowOverlay = false,
  onCardClick,
}: MediaCardProps) {
  const { isOpen, video, isLoading, openVideo, closeVideo } = useVideoOverlay();
  const { isWatched } = useWatched();
  const [isMobileOverlayVisible, setIsMobileOverlayVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // One subscription for the whole page. Each card used to run its own resize
  // listener and throttle to arrive at the same boolean.
  const isMobile = useIsMobile();

  // Lazily loaded watch providers.
  //
  // Derived from the props on every render rather than copied into state once:
  // the copy read `providers` and `loadingProviders` on mount and never again,
  // so a parent that handed the list in a render later – or flipped its loading
  // flag off – was silently ignored. What the card fetched for itself is the
  // only part that needs state, and it is keyed by title so a card re-used for
  // a different one does not show the previous title's platforms.
  const itemKey = `${item.media_type}-${item.id}`;
  const handedIn = item.providers ?? providedProviders;
  const [fetched, setFetched] = useState<FetchedProviders | null>(null);
  // Which title's lookup is in flight, rather than a bare boolean: a request the
  // effect below abandons – because the parent handed the list in after all, or
  // the card was re-used for another title – never reaches its `finally`, and a
  // boolean set on the way in would stay true for the life of the card.
  const [fetchingKey, setFetchingKey] = useState<string | null>(null);

  const fetchedForThisItem = fetched?.key === itemKey ? fetched : null;
  const hasLoadedProviders =
    handedIn !== undefined || fetchedForThisItem !== null;
  const providers = handedIn ?? fetchedForThisItem?.providers ?? [];
  const loadingProviders =
    providedLoadingState || (!hasLoadedProviders && fetchingKey === itemKey);

  const imageUrl = getImageUrl(item.poster_path, "w500");
  const year = releaseYear(item.release_date);
  const watched = isWatched(item.id, item.media_type);

  // Get title based on media type - handle both movies and TV shows
  const title =
    item.title ||
    ("name" in item ? (item as { name: string }).name : "Unknown Title");

  // Create slug URL from title and ID
  const slug = createSlug(title, item.id);
  const detailUrl = mediaHref(item.media_type, slug);

  const sizeClasses = {
    small: "w-28 h-42 sm:w-32 sm:h-48",
    medium: "w-40 h-60 sm:w-48 sm:h-72",
    large: "w-52 h-78 sm:w-64 sm:h-96",
  };

  const handlePlayClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const mediaType = item.media_type === "movie" ? "movie" : "tv";
    await openVideo(item.id, mediaType);
  };

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // On mobile devices, first tap shows overlay, second tap navigates
      if (isMobile && !isMobileOverlayVisible) {
        e.preventDefault();
        e.stopPropagation();
        setIsMobileOverlayVisible(true);
        return;
      }

      // Normal click behavior (desktop or second tap on mobile)
      if (onCardClick) {
        onCardClick();
      }
    },
    [isMobile, isMobileOverlayVisible, onCardClick],
  );

  const handleCloseMobileOverlay = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMobileOverlayVisible(false);
  }, []);

  // Lazy load watch providers when card is hovered or overlay shown
  useEffect(() => {
    // Only fetch if we haven't loaded providers yet and the overlay is visible
    const shouldFetchProviders =
      !hasLoadedProviders &&
      (isHovered || isMobileOverlayVisible || forceShowOverlay);

    if (!shouldFetchProviders) return;

    let isCancelled = false;

    const fetchProviders = async () => {
      setFetchingKey(itemKey);
      try {
        const { streaming } = await getTitleProviders(
          item.id,
          item.media_type,
        );

        if (!isCancelled) {
          setFetched({ key: itemKey, providers: streaming });
        }
      } catch (error) {
        console.error("Error fetching watch providers:", error);
        if (!isCancelled) {
          setFetched({ key: itemKey, providers: [] });
        }
      } finally {
        if (!isCancelled) {
          setFetchingKey(null);
        }
      }
    };

    fetchProviders();

    return () => {
      isCancelled = true;
    };
  }, [
    isHovered,
    isMobileOverlayVisible,
    forceShowOverlay,
    hasLoadedProviders,
    item.id,
    item.media_type,
    itemKey,
  ]);

  // Auto-hide mobile overlay after 5 seconds of inactivity
  useEffect(() => {
    if (isMobileOverlayVisible && isMobile) {
      const timeout = setTimeout(() => {
        setIsMobileOverlayVisible(false);
      }, 5000); // 5 seconds

      return () => clearTimeout(timeout);
    }
  }, [isMobileOverlayVisible, isMobile]);

  // Determine if overlay should be shown
  const shouldShowOverlay =
    showOverlay &&
    (forceShowOverlay || (isMobile ? isMobileOverlayVisible : true));

  // Determine if overlay is actually visible (for focus management)
  const isOverlayVisible =
    forceShowOverlay ||
    (isMobile && isMobileOverlayVisible) ||
    (!isMobile && isHovered);

  return (
    <>
      {/* The link and the controls are *siblings*. A button inside an anchor is
          invalid HTML – browsers repair it inconsistently, and a screen reader
          walking the link never discovers the play, save and seen buttons that
          used to sit in it. So the poster is the link, and everything clickable
          lives in a layer positioned over it. That layer passes clicks through
          (`pointer-events-none`) everywhere except the buttons themselves, so a
          tap on the title text still reaches the link underneath, exactly as it
          did when the text was inside it.

          Hover state lives on this wrapper rather than on the poster so that
          moving the mouse from the poster onto a button – a sibling, no longer a
          descendant – does not count as leaving the card. */}
      <div
        className={cn(
          "group relative rounded-lg transition-all duration-300 hover:scale-105 hover:shadow-xl",
          sizeClasses[size],
          className,
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Link
          href={detailUrl}
          prefetch={false}
          onClick={handleCardClick}
          className="block w-full h-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg"
          aria-label={`View details for ${title} (${year})${
            watched ? " – watched" : ""
          }`}
        >
          <article
            className={cn(
              "relative rounded-lg overflow-hidden bg-gray-900 cursor-pointer w-full h-full",
              // Marks a title as already seen without hiding the poster
              watched && "ring-2 ring-green-500/60",
            )}
          >
            <Image
              src={imageUrl}
              alt={`Poster for ${title}`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />

            {/* Mobile tap indicator */}
            {isMobile && !isMobileOverlayVisible && (
              <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-2">
                <p className="text-white text-xs text-center opacity-80">
                  Tap for details
                </p>
              </div>
            )}

            {/* Rating badge */}
            <div
              className={cn(
                "absolute top-2 bg-black/70 backdrop-blur-sm rounded-md px-2 py-1",
                isMobile && isMobileOverlayVisible ? "right-12" : "right-2",
              )}
              role="img"
              aria-label={`Rating: ${item.vote_average?.toFixed(
                1,
              )} out of 10 stars`}
            >
              <div className="flex items-center gap-1 text-xs text-white">
                <Star
                  className="w-3 h-3 fill-yellow-400 text-yellow-400"
                  aria-hidden="true"
                />
                <span>{item.vote_average?.toFixed(1)}</span>
              </div>
            </div>
          </article>
        </Link>

        {/* Controls layer – see the note on the wrapper. Rounded and clipped
            like the poster so the overlay's dark wash follows its corners. */}
        <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
          {shouldShowOverlay && (
            <div
              className={cn(
                "absolute inset-0 bg-black/60 transition-opacity duration-300 flex flex-col justify-end p-4",
                forceShowOverlay || (isMobile && isMobileOverlayVisible)
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
              inert={!isOverlayVisible ? true : undefined}
            >
              {/* Close button for mobile */}
              {isMobile && isMobileOverlayVisible && (
                <button
                  type="button"
                  onClick={handleCloseMobileOverlay}
                  className="pointer-events-auto absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-full p-1.5 hover:bg-black/90 transition-colors z-10"
                  aria-label={`Hide details for ${title}`}
                >
                  <X className="w-4 h-4 text-white" aria-hidden="true" />
                </button>
              )}

              <div className="space-y-2">
                <h3 className="text-white font-semibold text-sm line-clamp-2">
                  {title}
                </h3>

                <GenreTags
                  genreIds={item.genre_ids}
                  mediaType={item.media_type}
                  maxTags={2}
                  variant="card"
                  className="mb-2"
                />

                <div className="flex items-center gap-2 text-xs text-gray-300">
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    <span>{item.vote_average?.toFixed(1)}</span>
                  </div>

                  {item.release_date && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{year}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 capitalize">
                    {item.media_type}
                  </span>

                  <button
                    type="button"
                    onClick={handlePlayClick}
                    disabled={isLoading}
                    className="pointer-events-auto bg-white/20 backdrop-blur-sm rounded-full p-2 hover:bg-white/30 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black"
                    aria-label={`Play trailer for ${title}`}
                  >
                    <Play className="w-4 h-4 text-white" aria-hidden="true" />
                  </button>
                </div>

                <WatchProviders
                  providers={providers}
                  loading={loadingProviders}
                  className="mt-2"
                />
              </div>
            </div>
          )}

          {/* Watchlist and watched buttons */}
          <div className="pointer-events-auto absolute top-2 left-2 flex items-center gap-1.5">
            <WatchlistButton item={item} variant="compact" />
            <WatchedButton item={item} variant="compact" />
          </div>
        </div>
      </div>

      <VideoOverlay
        isOpen={isOpen}
        video={video}
        isLoading={isLoading}
        onClose={closeVideo}
      />
    </>
  );
}

// Memoize MediaCard to prevent unnecessary re-renders
export const MemoizedMediaCard = React.memo(
  MediaCard,
  (prevProps, nextProps) => {
    // Custom comparison for better performance
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.media_type === nextProps.item.media_type &&
      prevProps.size === nextProps.size &&
      prevProps.showOverlay === nextProps.showOverlay &&
      prevProps.forceShowOverlay === nextProps.forceShowOverlay &&
      prevProps.loadingProviders === nextProps.loadingProviders &&
      prevProps.providers?.length === nextProps.providers?.length &&
      prevProps.item.providers?.length === nextProps.item.providers?.length
    );
  },
);
