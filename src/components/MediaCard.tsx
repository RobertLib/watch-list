"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, Calendar, Play, X } from "lucide-react";
import { MediaItem, WatchProvider } from "@/types/tmdb";
import { tmdbApi } from "@/lib/tmdb";
import { WatchProviders } from "./WatchProviders";
import { GenreTags } from "./GenreTags";
import { VideoOverlay } from "./VideoOverlay";
import { WatchlistButton } from "./WatchlistButton";
import { useVideoOverlay } from "@/hooks/useVideoOverlay";
import { cn, createSlug } from "@/lib/utils";
import { throttle } from "@/lib/throttle";

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
  const [isMobileOverlayVisible, setIsMobileOverlayVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const prevIsMobileRef = useRef<boolean>(false);

  // Lazy loading watch providers
  const [providers, setProviders] = useState<WatchProvider[]>(
    item.providers || providedProviders || []
  );
  const [loadingProviders, setLoadingProviders] =
    useState(providedLoadingState);
  const [hasLoadedProviders, setHasLoadedProviders] = useState(
    !!(item.providers || providedProviders)
  );

  const imageUrl = tmdbApi.getImageUrl(item.poster_path, "w500");
  const year = new Date(item.release_date).getFullYear();

  // Get title based on media type - handle both movies and TV shows
  const title =
    item.title ||
    ("name" in item ? (item as { name: string }).name : "Unknown Title");

  // Create slug URL from title and ID
  const slug = createSlug(title, item.id);
  const detailUrl = `/${item.media_type}/${slug}`;

  const sizeClasses = {
    small: "w-28 h-42 sm:w-32 sm:h-48",
    medium: "w-40 h-60 sm:w-48 sm:h-72",
    large: "w-52 h-78 sm:w-64 sm:h-96",
  };

  const handlePlayClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const mediaType = item.media_type === "movie" ? "movie" : "tv";
    await openVideo(item.id, mediaType, title);
  };

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // On mobile devices, first tap shows overlay, second tap navigates
      if (
        typeof window !== "undefined" &&
        "ontouchstart" in window &&
        window.innerWidth < 768
      ) {
        if (!isMobileOverlayVisible) {
          e.preventDefault();
          e.stopPropagation();
          setIsMobileOverlayVisible(true);
          return;
        }
      }

      // Normal click behavior (desktop or second tap on mobile)
      if (onCardClick) {
        onCardClick();
      }
    },
    [isMobileOverlayVisible, onCardClick]
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
      setLoadingProviders(true);
      try {
        const response = await fetch(
          `/api/watch-providers?id=${item.id}&mediaType=${item.media_type}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch watch providers");
        }

        const data = await response.json();

        if (!isCancelled) {
          setProviders(data.providers || []);
          setHasLoadedProviders(true);
        }
      } catch (error) {
        console.error("Error fetching watch providers:", error);
        if (!isCancelled) {
          setProviders([]);
          setHasLoadedProviders(true);
        }
      } finally {
        if (!isCancelled) {
          setLoadingProviders(false);
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
  ]);

  // Detect mobile on client side
  useEffect(() => {
    const checkMobile = () => {
      if (typeof window !== "undefined") {
        const isMobileDevice =
          "ontouchstart" in window && window.innerWidth < 768;
        // Only call setIsMobile if the value has actually changed
        if (prevIsMobileRef.current !== isMobileDevice) {
          setIsMobile(isMobileDevice);
          prevIsMobileRef.current = isMobileDevice;
        }
      }
    };

    // Throttle the resize handler to avoid excessive calls
    const throttledCheckMobile = throttle(checkMobile, 250);

    checkMobile();
    window.addEventListener("resize", throttledCheckMobile);

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", throttledCheckMobile);
      }
    };
  }, []);

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
      <Link
        href={detailUrl}
        prefetch={false}
        onClick={handleCardClick}
        className={cn(
          "block focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black rounded-lg",
          sizeClasses[size],
          className
        )}
        aria-label={`View details for ${title} (${year})`}
      >
        <article
          className={cn(
            "group relative rounded-lg overflow-hidden bg-gray-900 cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl w-full h-full"
          )}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
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

          {shouldShowOverlay && (
            <div
              className={cn(
                "absolute inset-0 bg-black/60 transition-opacity duration-300 flex flex-col justify-end p-4",
                forceShowOverlay || (isMobile && isMobileOverlayVisible)
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100"
              )}
              inert={!isOverlayVisible ? true : undefined}
            >
              {/* Close button for mobile */}
              {isMobile && isMobileOverlayVisible && (
                <button
                  onClick={handleCloseMobileOverlay}
                  className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-full p-1.5 hover:bg-black/90 transition-colors z-10"
                >
                  <X className="w-4 h-4 text-white" />
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
                    onClick={handlePlayClick}
                    disabled={isLoading}
                    className="bg-white/20 backdrop-blur-sm rounded-full p-2 hover:bg-white/30 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black"
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

          {/* Rating badge */}
          <div
            className={cn(
              "absolute top-2 bg-black/70 backdrop-blur-sm rounded-md px-2 py-1",
              isMobile && isMobileOverlayVisible ? "right-12" : "right-2"
            )}
            role="img"
            aria-label={`Rating: ${item.vote_average?.toFixed(
              1
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

          {/* Watchlist button */}
          <div className="absolute top-2 left-2">
            <WatchlistButton item={item} variant="compact" />
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
  }
);
