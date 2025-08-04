/**
 * The streaming platforms a region offers, in an order worth showing.
 *
 * This was the `/api/streaming-providers` route. It moved into a plain module
 * when the app stopped having a server: the only reason it was a route was that
 * the region and the saved platforms lived in cookies the browser could not
 * read, and both are in local storage now.
 */

import { TMDB_CONFIG, TTL, tmdbFetchJson } from "./tmdb-cache";

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

/** How many platforms the pickers offer. Past this the list stops being a list. */
const MAX_PROVIDERS_SHOWN = 30;

/** Not `encodeURIComponent`: a region that needs escaping is not a region. */
function regionParam(region: string): string {
  if (!/^[A-Z]{2}$/.test(region)) {
    throw new Error(`Invalid region: ${String(region)}`);
  }

  return region;
}

export async function getStreamingProviders(
  regionCode: string,
): Promise<StreamingProvider[]> {
  const url = `${TMDB_CONFIG.BASE_URL}/watch/providers/movie?watch_region=${regionParam(
    regionCode,
  )}`;

  const data = await tmdbFetchJson<{ results?: StreamingProvider[] }>(
    url,
    TTL.DAY,
  );

  const providers = data.results ?? [];

  return [...providers]
    .sort((a, b) => {
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
    })
    .slice(0, MAX_PROVIDERS_SHOWN);
}
