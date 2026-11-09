"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaItem } from "@/types/tmdb";
import { MemoizedMediaCard } from "./MediaCard";
import { cn } from "@/lib/utils";
import { throttle } from "@/lib/throttle";

interface MediaCarouselProps {
  title: string;
  subtitle?: string; // Optional line under the title, e.g. why these items
  items: MediaItem[];
  loading?: boolean;
  className?: string;
  onCardClick?: () => void;
  id?: string; // Unique identifier for scroll position persistence
  /**
   * A row is a section of its page by default. Where the page groups rows under
   * headings of its own – "Movies" and "TV Shows" on the home page – the rows
   * are subsections, and an `h2` there would put them level with the group.
   */
  headingLevel?: 2 | 3;
}

function CarouselHeader({
  title,
  subtitle,
  headingLevel,
}: {
  title: string;
  subtitle?: string;
  headingLevel: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <div className="mb-6">
      <Heading className="text-2xl font-bold text-white">{title}</Heading>
      {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );
}

const SCROLL_BUTTON_CLASS =
  "absolute top-1/2 -translate-y-1/2 z-10 bg-black/70 backdrop-blur-sm rounded-full p-3 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400";

/**
 * One of the two arrows. Always mounted, never `disabled`.
 *
 * Both used to be rendered only while there was somewhere to scroll, so pressing
 * "Scroll right" until the end removed the very button that had focus, and
 * focus fell to <body> – a screen reader lost its place, and nothing on screen
 * showed where the keyboard was. A `disabled` button would do the same:
 * browsers blur it. So an arrow with nowhere to go is
 * `aria-disabled`, ignores its clicks, leaves the tab order, and lets the
 * pointer through to the card beneath – but keeps focus if it has it, and stays
 * visible while it does.
 */
function ScrollButton({
  direction,
  enabled,
  onClick,
}: {
  direction: "left" | "right";
  enabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={enabled ? onClick : undefined}
      className={cn(
        SCROLL_BUTTON_CLASS,
        direction === "left" ? "left-0" : "right-0",
        enabled
          ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/90"
          : "opacity-0 pointer-events-none focus-visible:opacity-50 cursor-default",
      )}
      aria-label={direction === "left" ? "Scroll left" : "Scroll right"}
      aria-disabled={!enabled}
      tabIndex={enabled ? undefined : -1}
    >
      <Icon className="w-6 h-6 text-white" aria-hidden="true" />
    </button>
  );
}

// Generate a storage key for scroll position
function getScrollStorageKey(id: string): string {
  return `carousel-scroll-${id}`;
}

export function MediaCarousel({
  title,
  subtitle,
  items,
  loading = false,
  className,
  onCardClick,
  id,
  headingLevel = 2,
}: MediaCarouselProps) {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const throttledUpdateRef = useRef<((event: Event) => void) | null>(null);
  const carouselId = id || title.toLowerCase().replace(/\s+/g, "-");
  const hasItems = items.length > 0;

  const updateButtonVisibility = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  // Save scroll position to sessionStorage
  const saveScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !carouselId) return;

    try {
      sessionStorage.setItem(
        getScrollStorageKey(carouselId),
        String(container.scrollLeft),
      );
    } catch {
      // sessionStorage might not be available
    }
  }, [carouselId]);

  // Restore scroll position from sessionStorage
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (loading || !hasItems || !container || !carouselId) return;

    let frame: number | null = null;

    try {
      const savedPosition = sessionStorage.getItem(
        getScrollStorageKey(carouselId),
      );
      if (savedPosition) {
        const scrollLeft = parseInt(savedPosition, 10);
        if (!isNaN(scrollLeft)) {
          // Use requestAnimationFrame to ensure the container is fully rendered
          frame = requestAnimationFrame(() => {
            container.scrollLeft = scrollLeft;
            updateButtonVisibility();
          });
        }
      }
    } catch {
      // sessionStorage might not be available
    }

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [carouselId, hasItems, loading, updateButtonVisibility]);

  // Overflow changes without scrolling too: on the first paint, when titles
  // arrive, and when the row or its responsive cards change width.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (loading || !container) return;

    let frame: number | null = null;
    const scheduleMeasurement = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateButtonVisibility();
      });
    };

    scheduleMeasurement();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleMeasurement);
    observer?.observe(container);
    // Also covers responsive card widths and browsers without ResizeObserver.
    window.addEventListener("resize", scheduleMeasurement);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [items, loading, updateButtonVisibility]);

  useEffect(() => {
    const updateAndSave = () => {
      updateButtonVisibility();
      saveScrollPosition();
    };

    const throttled = throttle(updateAndSave, 100);
    throttledUpdateRef.current = throttled;

    // A scroll that ends as the carousel unmounts leaves a trailing call
    // scheduled against a container that is no longer on the page.
    return () => {
      throttled.cancel();
      if (throttledUpdateRef.current === throttled) {
        throttledUpdateRef.current = null;
      }
    };
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
        <CarouselHeader
          title={title}
          subtitle={subtitle}
          headingLevel={headingLevel}
        />
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
      <CarouselHeader
        title={title}
        subtitle={subtitle}
        headingLevel={headingLevel}
      />

      <div className="relative group">
        <ScrollButton
          direction="left"
          enabled={canScrollLeft}
          onClick={scrollLeft}
        />
        <ScrollButton
          direction="right"
          enabled={canScrollRight}
          onClick={scrollRight}
        />

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
