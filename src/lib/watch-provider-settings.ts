/** Upper bound for stored provider IDs - the API only offers 30 per region */
const MAX_SELECTED_PROVIDERS = 50;

export type WatchProviderFilter = "all" | "streaming-only";

export function isWatchProviderFilter(
  value: unknown,
): value is WatchProviderFilter {
  return value === "all" || value === "streaming-only";
}

/**
 * Convert provider IDs array to the string kept in local storage
 */
export function providerIdsToStoredValue(ids: number[]): string {
  return ids.join(",");
}

/**
 * Drop anything that is not a usable provider ID and de-duplicate.
 * The values come from local storage and from URLs, so neither is trusted.
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
 * Kept as a sentinel so a filter URL keeps meaning "whatever I am subscribed to"
 * rather than freezing the platform list at the moment the link was made.
 */
export const MY_PROVIDERS = "mine";

/**
 * Validate a provider filter value coming from the URL or from storage.
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
 * Parse provider IDs from the stored value string.
 * Returns an empty array if no providers are saved (user hasn't configured yet).
 *
 * Through `sanitizeProviderIds`, the same gate the writes go through. The read
 * used to have its own, looser filter – no de-duplication and no cap – so a
 * hand-edited "8,8,8" came back as three copies of one platform, and a stored
 * value only had to be long to walk past the bound the writer enforces.
 */
export function parseStoredProviderIds(storedValue: string): number[] {
  if (!storedValue) return [];

  return sanitizeProviderIds(
    storedValue.split(",").map((id) => parseInt(id.trim(), 10)),
  );
}
