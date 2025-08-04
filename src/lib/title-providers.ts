/**
 * Where one title can be watched, in the visitor's region.
 *
 * The per-card lookup behind the poster overlay. It was `/api/watch-providers`,
 * a route that existed to read the region cookie; the region is a local-storage
 * value now, so the card asks TMDB itself.
 *
 * Bulk lookups for a whole list go through `watchlist-availability.ts` instead –
 * eighty of these in a row is eighty requests.
 */

import {
  getCachedMovieWatchProviders,
  getCachedTVWatchProviders,
} from "./tmdb-cache";
import { getRegion } from "./settings";
import { getRegionCode } from "./region";
import type { RegionWatchProviders, MediaType } from "@/types/tmdb";

export async function getTitleProviders(
  id: number,
  mediaType: MediaType,
): Promise<RegionWatchProviders> {
  const regionCode = getRegionCode(getRegion());

  const response =
    mediaType === "movie"
      ? await getCachedMovieWatchProviders(id, regionCode)
      : await getCachedTVWatchProviders(id, regionCode);

  const region = response.results?.[regionCode];

  return {
    streaming: region?.flatrate ?? [],
    rent: region?.rent ?? [],
    buy: region?.buy ?? [],
  };
}
