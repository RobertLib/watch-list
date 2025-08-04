/**
 * The streaming platforms a region offers, in an order worth showing.
 *
 * This was the `/api/streaming-providers` route. It moved into a plain module
 * when the app stopped having a server: the only reason it was a route was that
 * the region and the saved platforms lived in cookies the browser could not
 * read, and both are in local storage now.
 */

import { TMDB_CONFIG, TTL, tmdbFetchJson } from "./tmdb-cache";
import type { MediaType } from "@/types/tmdb";

export interface StreamingProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

// Global popular streaming platforms - ordered by global popularity
// These get sorted to the top regardless of TMDB's display_priority
const POPULAR_PROVIDER_IDS = [
  8, // Netflix
  337, // Disney Plus
  9, // Amazon Prime Video
  119, // Amazon Prime Video (alternate ID)
  1899, // Max (HBO Max)
  384, // HBO Max
  350, // Apple TV+
  2, // Apple TV
  1773, // SkyShowtime
  531, // Paramount+
  15, // Hulu
  387, // Peacock
  39, // Now TV
  283, // Crunchyroll
];

const POPULAR_PROVIDER_SET = new Set(POPULAR_PROVIDER_IDS);

/** The usual picker offer; saved platforms may also be shown outside this limit. */
export const MAX_PROVIDERS_SHOWN = 30;

/** Not `encodeURIComponent`: a region that needs escaping is not a region. */
function regionParam(region: string): string {
  if (!/^[A-Z]{2}$/.test(region)) {
    throw new Error(`Invalid region: ${String(region)}`);
  }

  return region;
}

/**
 * Full regional catalogue, required when checking whether a saved platform exists.
 * Profile settings cover both movies and TV; discovery can request its own type.
 */
export async function getRegionalStreamingProviders(
  regionCode: string,
  mediaType?: MediaType,
): Promise<StreamingProvider[]> {
  const region = regionParam(regionCode);
  const mediaTypes = mediaType ? [mediaType] : (["movie", "tv"] as const);

  // Require both catalogues for the shared picker: a partial response must not
  // make a saved TV-only or movie-only service look unavailable on region change.
  const responses = await Promise.all(
    mediaTypes.map((type) =>
      tmdbFetchJson<{ results?: StreamingProvider[] }>(
        `${TMDB_CONFIG.BASE_URL}/watch/providers/${type}?watch_region=${region}`,
        TTL.DAY,
      ),
    ),
  );

  const providers = new Map<number, StreamingProvider>();
  for (const response of responses) {
    for (const provider of response.results ?? []) {
      const existing = providers.get(provider.provider_id);
      if (!existing || provider.display_priority < existing.display_priority) {
        providers.set(provider.provider_id, provider);
      }
    }
  }

  return [...providers.values()].sort((a, b) => {
    const aIsPopular = POPULAR_PROVIDER_SET.has(a.provider_id);
    const bIsPopular = POPULAR_PROVIDER_SET.has(b.provider_id);

    // Popular providers come first
    if (aIsPopular && !bIsPopular) return -1;
    if (!aIsPopular && bIsPopular) return 1;

    // Among popular providers, sort by our predefined order
    if (aIsPopular && bIsPopular) {
      return (
        POPULAR_PROVIDER_IDS.indexOf(a.provider_id) -
        POPULAR_PROVIDER_IDS.indexOf(b.provider_id)
      );
    }

    // For non-popular, use display_priority
    return a.display_priority - b.display_priority;
  });
}

/** Bounded offer for the discovery filter bar. */
export async function getStreamingProviders(
  regionCode: string,
  mediaType?: MediaType,
): Promise<StreamingProvider[]> {
  const providers = await getRegionalStreamingProviders(regionCode, mediaType);
  return providers.slice(0, MAX_PROVIDERS_SHOWN);
}
