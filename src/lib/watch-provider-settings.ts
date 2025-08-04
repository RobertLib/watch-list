const WATCH_PROVIDER_FILTER_COOKIE = "watch-provider-filter";
const SELECTED_PROVIDERS_COOKIE = "selected-watch-providers";

export type WatchProviderFilter = "all" | "streaming-only";

/**
 * Get the cookie name for watch provider filter
 */
export function getWatchProviderFilterCookieName(): string {
  return WATCH_PROVIDER_FILTER_COOKIE;
}

/**
 * Get the cookie name for selected providers
 */
export function getSelectedProvidersCookieName(): string {
  return SELECTED_PROVIDERS_COOKIE;
}

/**
 * Convert provider IDs array to cookie value string
 */
export function providerIdsToCookieValue(ids: number[]): string {
  return ids.join(",");
}

/**
 * Parse provider IDs from cookie value string
 * Returns empty array if no providers are saved (user hasn't configured yet)
 */
export function parseProviderIdsFromCookie(cookieValue: string): number[] {
  if (!cookieValue) return [];

  const ids = cookieValue
    .split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id) && id > 0);

  return ids;
}
