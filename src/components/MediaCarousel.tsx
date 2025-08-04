"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaItem } from "@/types/tmdb";
import { MemoizedMediaCard } from "./MediaCard";
import { cn } from "@/lib/utils";
import { throttle } from "@/lib/throttle";

interface MediaCarouselProps {
  title: string;
  items: MediaItem[];
  loading?: boolean;
  className?: string;
  onCardClick?: () => void;
  id?: string; // Unique identifier for scroll position persistence
}

// Generate a storage key for scroll position
function getScrollStorageKey(id: string): string {
  return `carousel-scroll-${id}`;
}

export function MediaCarousel({
  title,
  items,
  loading = false,
  className,
  onCardClick,
  id,
}: MediaCarouselProps) {
  const [showLeftButton, setShowLeftButton] = useState(false);
  const [showRightButton, setShowRightButton] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const throttledUpdateRef = useRef<((event: Event) => void) | null>(null);
  const carouselId = id || title.toLowerCase().replace(/\s+/g, "-");

  const updateButtonVisibility = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftButton(scrollLeft > 0);
    setShowRightButton(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  // Save scroll position to sessionStorage
  const saveScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !carouselId) return;

    try {
      sessionStorage.setItem(
        getScrollStorageKey(carouselId),
        String(container.scrollLeft)
      );
    } catch {
      // sessionStorage might not be available
    }
  }, [carouselId]);

  // Restore scroll position from sessionStorage
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !carouselId) return;

    try {
      const savedPosition = sessionStorage.getItem(
        getScrollStorageKey(carouselId)
      );
      if (savedPosition) {
        const scrollLeft = parseInt(savedPosition, 10);
        if (!isNaN(scrollLeft)) {
          // Use requestAnimationFrame to ensure the container is fully rendered
          requestAnimationFrame(() => {
            container.scrollLeft = scrollLeft;
            updateButtonVisibility();
          });
        }
      }
    } catch {
      // sessionStorage might not be available
    }
  }, [carouselId, updateButtonVisibility]);

  useEffect(() => {
    const updateAndSave = () => {
      updateButtonVisibility();
      saveScrollPosition();
    };
    throttledUpdateRef.current = throttle(updateAndSave, 100);
  }, [updateButtonVisibility, saveScrollPosition]);

  const scrollLeft = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const cardWidth = 192; // w-48 = 192px
    const scrollAmount = cardWidth * 3; // Scroll 3 cards at a time
    container.scrollBy({ left: -scrollAmount, behavior: "smooth" });
  }, []);

  const scrollRight = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const cardWidth = 192; // w-48 = 192px
    const scrollAmount = cardWidth * 3; // Scroll 3 cards at a time
    container.scrollBy({ left: scrollAmount, behavior: "smooth" });
  }, []);

  if (loading) {
    return (
      <div className={cn("mb-12", className)}>
        <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-48 h-72 bg-gray-700 rounded-lg animate-pulse shrink-0"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return null;
  }

  return (
    <div className={cn("mb-12 relative", className)}>
      <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>

      <div className="relative group">
        {/* Left scroll button */}
        {showLeftButton && (
          <button
            onClick={scrollLeft}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-full p-3 transition-all duration-200 opacity-0 group-hover:opacity-100"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        )}

        {/* Right scroll button */}
        {showRightButton && (
          <button
            onClick={scrollRight}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-full p-3 transition-all duration-200 opacity-0 group-hover:opacity-100"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        )}

        {/* Carousel container */}
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide -mt-4 -mx-4 p-4"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          onScroll={(e) => throttledUpdateRef.current?.(e.nativeEvent)}
        >
          {items.map((item) => {
            const key = `${item.id}-${item.media_type}`;

            return (
              <div key={key} className="shrink-0">
                <MemoizedMediaCard
                  item={item}
                  size="medium"
                  onCardClick={onCardClick}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
