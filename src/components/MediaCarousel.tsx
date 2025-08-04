"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaItem } from "@/types/tmdb";
import { MemoizedMediaCard } from "./MediaCard";
import { WatchProvider } from "@/types/tmdb";
import { cn } from "@/lib/utils";
import { getProvidersForItems } from "@/lib/providers-cache";
import { throttle, debounce } from "@/lib/throttle";

interface MediaCarouselProps {
  title: string;
  items: MediaItem[];
  loading?: boolean;
  className?: string;
  onCardClick?: () => void;
  preloadProviders?: boolean; // New prop to control preloading
}

export function MediaCarousel({
  title,
  items,
  loading = false,
  className,
  onCardClick,
  preloadProviders = false, // Changed to false - only load on hover/interaction
}: MediaCarouselProps) {
  const [showLeftButton, setShowLeftButton] = useState(false);
  const [showRightButton, setShowRightButton] = useState(true);
  const [providersData, setProvidersData] = useState<
    Record<string, WatchProvider[]>
  >({});
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadAllProviders = useCallback(async () => {
    if (providersLoaded) return;

    setLoadingProviders(true);

    try {
      // Use the optimized batch function for all items
      const newProvidersData = await getProvidersForItems(items);
      setProvidersData(newProvidersData);
      setProvidersLoaded(true);
    } catch (error) {
      console.error("Error loading providers:", error);
    } finally {
      setLoadingProviders(false);
    }
  }, [items, providersLoaded]);

  // Auto-load providers when items are available (if preloadProviders is true)
  useEffect(() => {
    if (items.length > 0 && !providersLoaded && preloadProviders) {
      // Small delay to allow component to mount properly, then preload
      const timeoutId = setTimeout(() => {
        loadAllProviders();
      }, 200);

      return () => clearTimeout(timeoutId);
    }
  }, [items.length, providersLoaded, preloadProviders, loadAllProviders]);

  // Debounced mouse enter handler to load providers on hover
  const handleMouseEnter = useMemo(
    () =>
      debounce(() => {
        if (!providersLoaded && !loadingProviders) {
          loadAllProviders();
        }
      }, 300), // 300ms delay to prevent excessive calls
    [providersLoaded, loadingProviders, loadAllProviders]
  );

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;

    const scrollAmount = 400;
    const container = scrollContainerRef.current;

    if (direction === "left") {
      container.scrollBy({ left: -scrollAmount, behavior: "smooth" });
    } else {
      container.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  // Throttled scroll handler to improve performance
  const handleScrollThrottled = useMemo(
    () =>
      throttle(() => {
        if (!scrollContainerRef.current) return;

        const container = scrollContainerRef.current;
        const { scrollLeft, scrollWidth, clientWidth } = container;

        setShowLeftButton(scrollLeft > 0);
        setShowRightButton(scrollLeft < scrollWidth - clientWidth - 10);
      }, 100), // Throttle to every 100ms
    []
  );

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="h-8 bg-gray-700 rounded w-48 animate-pulse" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-48 h-72 bg-gray-700 rounded-lg animate-pulse flex-shrink-0"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) return null;

  return (
    <div className={cn("space-y-4", className)} onMouseEnter={handleMouseEnter}>
      <h2 className="text-2xl font-bold text-white">{title}</h2>

      <div className="relative group">
        {/* Left scroll button */}
        {showLeftButton && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-r-md p-2 transition-all duration-200 opacity-0 group-hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black focus:opacity-100"
            aria-label="Scroll left to see previous items"
          >
            <ChevronLeft className="w-6 h-6" aria-hidden="true" />
          </button>
        )}

        {/* Right scroll button */}
        {showRightButton && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-l-md p-2 transition-all duration-200 opacity-0 group-hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black focus:opacity-100"
            aria-label="Scroll right to see more items"
          >
            <ChevronRight className="w-6 h-6" aria-hidden="true" />
          </button>
        )}

        {/* Scrollable container */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScrollThrottled}
          className="flex gap-4 overflow-x-auto scrollbar-hide -mt-4 -mx-4 p-4"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          role="region"
          aria-label={`${title} carousel`}
          tabIndex={0}
        >
          {items.map((item) => {
            const key = `${item.id}-${item.media_type}`;
            const itemProviders = providersData[key] || [];

            return (
              <MemoizedMediaCard
                key={key}
                item={item}
                providers={itemProviders}
                loadingProviders={loadingProviders}
                className="flex-shrink-0"
                onCardClick={onCardClick}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
