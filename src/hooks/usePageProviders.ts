import { useState, useEffect } from "react";
import { MediaItem, WatchProvider } from "@/types/tmdb";
import { getProvidersForItems } from "@/lib/providers-cache";

/**
 * Hook to preload providers for all items on a page
 * Optimizes API calls by loading all providers in batches
 */
export function usePageProviders(allItems: MediaItem[], delay: number = 1000) {
  const [providersData, setProvidersData] = useState<
    Record<string, WatchProvider[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (allItems.length === 0 || loaded) return;

    setLoading(true);

    // Delay to avoid blocking initial page render
    const timeoutId = setTimeout(async () => {
      try {
        const providers = await getProvidersForItems(allItems);
        setProvidersData(providers);
        setLoaded(true);
      } catch (error) {
        console.error("Error preloading page providers:", error);
      } finally {
        setLoading(false);
      }
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [allItems, delay, loaded]);

  return { providersData, loading, loaded };
}
