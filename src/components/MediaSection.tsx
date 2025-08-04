"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { MediaItem, WatchProvider } from "@/types/tmdb";
import { MediaGrid } from "./MediaGrid";
import { cn } from "@/lib/utils";
import { getProvidersForItems } from "@/lib/providers-cache";
import { useInitialHover } from "@/hooks/useInitialHover";
import { debounce } from "@/lib/throttle";

interface MediaSectionProps {
  title: string;
  items: MediaItem[];
  loading?: boolean;
  className?: string;
  size?: "small" | "medium" | "large";
  emptyMessage?: string;
  autoShowOverlayOnNewItems?: boolean;
  preloadProviders?: boolean; // New prop to control preloading
}

export function MediaSection({
  title,
  items,
  loading = false,
  className,
  size = "medium",
  emptyMessage = "No items found.",
  autoShowOverlayOnNewItems = true,
  preloadProviders = false, // Changed to false - only load on hover/interaction
}: MediaSectionProps) {
  const [providersData, setProvidersData] = useState<
    Record<string, WatchProvider[]>
  >({});
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [hasTriggeredLoad, setHasTriggeredLoad] = useState(false);

  const {
    elementRef: sectionRef,
    isHovered,
    handleMouseEnter: onMouseEnter,
    handleMouseLeave: onMouseLeave,
  } = useInitialHover<HTMLElement>();

  // Memoize items ID string for dependency tracking
  const itemsKey = useMemo(
    () => items.map((item) => item.id).join(","),
    [items]
  );

  // Pre-load providers for all items in this section with debouncing
  const debouncedLoadProviders = useMemo(
    () =>
      debounce(async () => {
        if (loadingProviders || items.length === 0 || hasTriggeredLoad) return;

        setHasTriggeredLoad(true);
        setLoadingProviders(true);

        try {
          // Use the optimized batch function
          const providers = await getProvidersForItems(items);
          setProvidersData(providers);
        } catch (error) {
          console.error("Error loading providers:", error);
        } finally {
          setLoadingProviders(false);
        }
      }, 300), // 300ms debounce to prevent rapid successive calls
    [items, hasTriggeredLoad, loadingProviders]
  );

  const loadAllProviders = useCallback(async () => {
    debouncedLoadProviders();
  }, [debouncedLoadProviders]);

  // Auto-load providers when items change or on mount (if preloadProviders is true)
  useEffect(() => {
    if (items.length > 0 && !hasTriggeredLoad && preloadProviders) {
      // Small delay to allow component to mount properly, then preload
      const timeoutId = setTimeout(() => {
        loadAllProviders();
      }, 300); // Shorter delay for better responsiveness

      return () => clearTimeout(timeoutId);
    }
  }, [items.length, hasTriggeredLoad, preloadProviders, loadAllProviders]);

  // Load providers when section is hovered (including initial hover detection)
  useEffect(() => {
    if (isHovered && !hasTriggeredLoad) {
      loadAllProviders();
    }
  }, [isHovered, hasTriggeredLoad, loadAllProviders]);

  // Reset state when items change significantly
  useEffect(() => {
    setHasTriggeredLoad(false);
    setProvidersData({});
  }, [itemsKey]);

  return (
    <section
      ref={sectionRef}
      className={cn("mb-12", className)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {title && <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>}
      <MediaGrid
        items={items}
        loading={loading}
        size={size}
        emptyMessage={emptyMessage}
        providersData={providersData}
        loadingProviders={loadingProviders}
        autoShowOverlayOnNewItems={autoShowOverlayOnNewItems}
        forceShowOverlay={isHovered}
      />
    </section>
  );
}
