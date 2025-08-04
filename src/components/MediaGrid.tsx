"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { MediaItem, WatchProvider } from "@/types/tmdb";
import { MemoizedMediaCard } from "./MediaCard";
import { cn } from "@/lib/utils";
import { getProvidersForItems } from "@/lib/providers-cache";

interface MediaGridProps {
  items: MediaItem[];
  loading?: boolean;
  className?: string;
  size?: "small" | "medium" | "large";
  emptyMessage?: string;
  onMouseEnter?: () => void;
  providersData?: Record<string, WatchProvider[]>;
  loadingProviders?: boolean;
  autoShowOverlayOnNewItems?: boolean;
  forceShowOverlay?: boolean;
  preloadProviders?: boolean;
}

export function MediaGrid({
  items,
  loading = false,
  className,
  size = "medium",
  emptyMessage = "No items found.",
  onMouseEnter,
  providersData: externalProvidersData,
  loadingProviders: externalLoadingProviders = false,
  autoShowOverlayOnNewItems = true,
  forceShowOverlay = false,
  preloadProviders = false, // Changed to false - only load on hover/interaction
}: MediaGridProps) {
  const [internalProvidersData, setInternalProvidersData] = useState<
    Record<string, WatchProvider[]>
  >({});
  const [internalLoadingProviders, setInternalLoadingProviders] =
    useState(false);
  const [hasTriggeredLoad, setHasTriggeredLoad] = useState(false);
  const [isGridHovered, setIsGridHovered] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const itemsLengthRef = useRef(items.length);

  // Use external providers data if provided, otherwise use internal
  const providersData = externalProvidersData || internalProvidersData;
  const loadingProviders = externalLoadingProviders || internalLoadingProviders;

  // Memoize items ID string for dependency tracking
  const itemsKey = useMemo(
    () => items.map((item) => item.id).join(","),
    [items]
  );

  const loadAllProviders = useCallback(async () => {
    if (
      internalLoadingProviders ||
      items.length === 0 ||
      hasTriggeredLoad ||
      externalProvidersData
    )
      return;

    setHasTriggeredLoad(true);
    setInternalLoadingProviders(true);

    try {
      // Use the optimized batch function for all items
      const newProvidersData = await getProvidersForItems(items);
      setInternalProvidersData(newProvidersData);
    } catch (error) {
      console.error("Error loading providers:", error);
    } finally {
      setInternalLoadingProviders(false);
    }
  }, [
    items,
    hasTriggeredLoad,
    internalLoadingProviders,
    externalProvidersData,
  ]);

  // Reset providers when items change (e.g., after applying filters)
  useEffect(() => {
    setHasTriggeredLoad(false);
    setInternalProvidersData({});
  }, [itemsKey]);

  // Auto-load providers when items are available and not loaded yet
  useEffect(() => {
    if (
      items.length > 0 &&
      !hasTriggeredLoad &&
      !internalLoadingProviders &&
      preloadProviders &&
      !externalProvidersData
    ) {
      const timeoutId = setTimeout(() => {
        loadAllProviders();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [
    items.length,
    hasTriggeredLoad,
    internalLoadingProviders,
    preloadProviders,
    externalProvidersData,
    loadAllProviders,
  ]); // Check if new items were added and re-trigger hover effect
  useEffect(() => {
    const newItemsLength = items.length;
    const prevItemsLength = itemsLengthRef.current;

    // If items have changed (either more or completely different items) and auto-show is enabled
    if (
      newItemsLength !== prevItemsLength &&
      autoShowOverlayOnNewItems &&
      gridRef.current
    ) {
      // Small delay to allow DOM updates, then trigger hover state
      const timeoutId = setTimeout(() => {
        // Trigger a synthetic mouse enter event to reactivate hover state
        const gridElement = gridRef.current;
        if (gridElement) {
          // Temporarily show overlay for all cards when new content loads
          setIsGridHovered(true);

          // Auto-hide after a short time unless user is actually hovering
          const hideTimeoutId = setTimeout(() => {
            // Check if the element is actually being hovered by using :hover selector
            const isActuallyHovered =
              gridElement.matches(":hover") ||
              gridElement.querySelector(":hover") !== null;
            if (!isActuallyHovered) {
              setIsGridHovered(false);
            }
          }, 1500); // Show overlay for 1.5 seconds after loading new content

          return () => clearTimeout(hideTimeoutId);
        }
      }, 150);

      return () => clearTimeout(timeoutId);
    }

    itemsLengthRef.current = newItemsLength;
  }, [items.length, autoShowOverlayOnNewItems]);

  const handleMouseEnter = () => {
    setIsGridHovered(true);
    if (!hasTriggeredLoad && !internalLoadingProviders) {
      loadAllProviders();
    }
  };

  const handleMouseLeave = () => {
    setIsGridHovered(false);
  };

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
      ref={gridRef}
      className={cn(
        "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 media-grid",
        className
      )}
      onMouseEnter={onMouseEnter || handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
            size={size}
            forceShowOverlay={forceShowOverlay || isGridHovered}
          />
        );
      })}
    </div>
  );
}
