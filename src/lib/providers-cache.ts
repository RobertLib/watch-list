import { WatchProvider } from "@/types/tmdb";
import { tmdbApi } from "@/lib/tmdb";
import { getRegion } from "@/lib/region-server";
import { getRegionCode } from "@/lib/region";

// Global cache for watch providers
export const providersCache = new Map<
  string,
  {
    data: WatchProvider[];
    timestamp: number;
  }
>();

// Global pending requests to prevent duplicate API calls for the same provider data
// This ensures that if multiple components request the same movie/TV show providers,
// only one API call is made and all components share the result
const pendingRequests = new Map<string, Promise<WatchProvider[]>>();

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache

// Function to get providers with caching
export const getProviders = async (
  mediaId: number,
  mediaType: "movie" | "tv"
): Promise<WatchProvider[]> => {
  // Get current region first to include it in cache key
  const currentRegion = await getRegion();
  const regionCode = getRegionCode(currentRegion);
  const cacheKey = `${mediaType}-${mediaId}-${regionCode}`;

  // Check cache first
  const cached = providersCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  // Check if there's already a pending request for this item
  const pendingRequest = pendingRequests.get(cacheKey);
  if (pendingRequest) {
    return pendingRequest;
  }

  // Create new request and store it in pending requests
  const request = (async () => {
    try {
      let response;

      if (mediaType === "movie") {
        response = await tmdbApi.getMovieWatchProviders(mediaId);
      } else {
        response = await tmdbApi.getTVWatchProviders(mediaId);
      }

      // Get current region providers
      const regionProviders = response.results[regionCode];
      const providersData = regionProviders?.flatrate || [];

      // Cache the result
      providersCache.set(cacheKey, {
        data: providersData,
        timestamp: Date.now(),
      });

      return providersData;
    } catch (error) {
      console.error("Error fetching watch providers:", error);
      // Cache empty result to avoid repeated failed requests
      providersCache.set(cacheKey, {
        data: [],
        timestamp: Date.now(),
      });
      return [];
    } finally {
      // Remove from pending requests when done
      pendingRequests.delete(cacheKey);
    }
  })();

  // Store the promise in pending requests
  pendingRequests.set(cacheKey, request);

  return request;
};

// Optimized batch function to load providers for multiple items at once
export const getProvidersForItems = async (
  items: Array<{ id: number; media_type: "movie" | "tv" }>
): Promise<Record<string, WatchProvider[]>> => {
  const currentRegion = await getRegion();
  const regionCode = getRegionCode(currentRegion);

  const result: Record<string, WatchProvider[]> = {};
  const itemsToFetch: Array<{
    id: number;
    media_type: "movie" | "tv";
    key: string;
  }> = [];

  // Check cache and pending requests first for all items
  for (const item of items) {
    const cacheKey = `${item.media_type}-${item.id}-${regionCode}`;
    const itemKey = `${item.id}-${item.media_type}`;

    // Check cache first
    const cached = providersCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      result[itemKey] = cached.data;
    } else {
      // Check if there's a pending request
      const pendingRequest = pendingRequests.get(cacheKey);
      if (pendingRequest) {
        try {
          const data = await pendingRequest;
          result[itemKey] = data;
        } catch {
          result[itemKey] = [];
        }
      } else {
        itemsToFetch.push({ ...item, key: itemKey });
      }
    }
  }

  // If all items are cached, return early
  if (itemsToFetch.length === 0) {
    return result;
  }

  // Batch fetch the remaining items with improved rate limiting
  const batchSize = 20; // Reduced from 40 to be more conservative
  const delay = 500; // Reduced delay between batches

  for (let i = 0; i < itemsToFetch.length; i += batchSize) {
    const batch = itemsToFetch.slice(i, i + batchSize);

    // Process batch in parallel with error handling and pending request tracking
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const cacheKey = `${item.media_type}-${item.id}-${regionCode}`;

        // Create request promise and store in pending requests
        const request = (async () => {
          try {
            let response;

            if (item.media_type === "movie") {
              response = await tmdbApi.getMovieWatchProviders(item.id);
            } else {
              response = await tmdbApi.getTVWatchProviders(item.id);
            }

            const regionProviders = response.results[regionCode];
            const providersData = regionProviders?.flatrate || [];

            // Cache the result
            providersCache.set(cacheKey, {
              data: providersData,
              timestamp: Date.now(),
            });

            return providersData;
          } catch (error) {
            console.error(
              `Error fetching providers for ${item.media_type} ${item.id}:`,
              error
            );
            // Cache empty result to avoid repeated failed requests
            providersCache.set(cacheKey, {
              data: [],
              timestamp: Date.now(),
            });
            return [];
          } finally {
            // Remove from pending requests when done
            pendingRequests.delete(cacheKey);
          }
        })();

        // Store the promise in pending requests
        pendingRequests.set(cacheKey, request);

        const data = await request;
        return { key: item.key, data };
      })
    );

    // Process results
    results.forEach((promiseResult) => {
      if (promiseResult.status === "fulfilled") {
        const { key, data } = promiseResult.value;
        result[key] = data;
      }
    });

    // Add delay between batches to respect rate limits
    if (i + batchSize < itemsToFetch.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return result;
};
