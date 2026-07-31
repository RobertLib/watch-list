const WATCH_PROVIDER_FILTER_COOKIE = "watch-provider-filter";
const SELECTED_PROVIDERS_COOKIE = "selected-watch-providers";

/** Upper bound for stored provider IDs - the API only offers 30 per region */
const MAX_SELECTED_PROVIDERS = 50;

export type WatchProviderFilter = "all" | "streaming-only";

export function isWatchProviderFilter(
  value: unknown,
): value is WatchProviderFilter {
  return value === "all" || value === "streaming-only";
}

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
 * Drop anything that is not a usable provider ID and de-duplicate.
 * Server actions are reachable directly, so the payload is never trusted.
 */
export function sanitizeProviderIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];

  const valid = ids.filter(
    (id): id is number => Number.isInteger(id) && (id as number) > 0,
  );

  return Array.from(new Set(valid)).slice(0, MAX_SELECTED_PROVIDERS);
}

/**
 * Provider filter value standing for "the platforms saved in my profile".
 * Kept as a sentinel because the saved platforms live in an httpOnly cookie and
 * can only be resolved on the server.
 */
export const MY_PROVIDERS = "mine";

/**
 * Validate a provider filter value coming from the URL or a server action.
 * Returns the `MY_PROVIDERS` sentinel, `|`-separated provider IDs for TMDB, or
 * "" when the value carries nothing usable.
 */
export function sanitizeWatchProvidersFilter(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  if (value === MY_PROVIDERS) return MY_PROVIDERS;

  const ids = sanitizeProviderIds(
    value.split(/[,|]/).map((id) => parseInt(id.trim(), 10)),
  );

  return ids.join("|");
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
