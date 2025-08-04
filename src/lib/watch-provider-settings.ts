const WATCH_PROVIDER_FILTER_COOKIE = "watch-provider-filter";

export type WatchProviderFilter = "all" | "streaming-only";

/**
 * Get the cookie name for watch provider filter
 */
export function getWatchProviderFilterCookieName(): string {
  return WATCH_PROVIDER_FILTER_COOKIE;
}
