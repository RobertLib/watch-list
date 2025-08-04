import {
  getCachedMovieWatchProviders,
  getCachedTVWatchProviders,
} from "./tmdb-cache";
import { getRegion, getSelectedProviderIds } from "./settings";
import { getRegionCode } from "./region";
import { mediaItemKey } from "./utils";
import type { MediaType, WatchProvider } from "@/types/tmdb";
import type { ProviderBadge, TitleAvailability } from "./watchlist-view";

/**
 * Where every title on a watchlist can be watched, in one pass.
 *
 * TMDB has no bulk endpoint for this, so it is genuinely one read per title –
 * capped below, cached for two hours, and rate-limited by the transport so a
 * long watchlist arrives steadily instead of all at once. What it saves over the
 * per-card lookup is the repetition: the grouping asks once for the whole list
 * rather than once per poster the cursor happens to pass over.
 */

export interface AvailabilityRef {
  id: number;
  mediaType: MediaType;
}

export interface WatchlistAvailability {
  /** Region code the answers apply to, for the group headings. */
  region: string;
  /** Whether the profile names any platforms – decides if "mine" can apply. */
  hasSelectedProviders: boolean;
  /** Keyed `${mediaType}-${id}`; a missing key was not looked up. */
  byKey: Record<string, TitleAvailability>;
  /** How many were looked up, so the page can say when it stopped short. */
  checked: number;
}

// Each title is one cached TMDB read. A cap keeps a 400-title watchlist from
// turning one page view into 400 upstream calls the first time it is opened.
const MAX_TITLES_CHECKED = 120;

export function sanitizeAvailabilityRefs(input: unknown): AvailabilityRef[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const refs: AvailabilityRef[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;

    const { id, mediaType } = entry as Record<string, unknown>;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) continue;
    if (mediaType !== "movie" && mediaType !== "tv") continue;

    const key = mediaItemKey(id, mediaType);
    if (seen.has(key)) continue;

    seen.add(key);
    refs.push({ id, mediaType });

    if (refs.length >= MAX_TITLES_CHECKED) break;
  }

  return refs;
}

function toBadges(providers: WatchProvider[]): ProviderBadge[] {
  return providers.map((provider) => ({
    id: provider.provider_id,
    name: provider.provider_name,
    logoPath: provider.logo_path ?? null,
  }));
}

export async function getWatchlistAvailability(
  refs: AvailabilityRef[],
): Promise<WatchlistAvailability> {
  const regionCode = getRegionCode(getRegion());
  const selected = new Set(getSelectedProviderIds());

  const empty: WatchlistAvailability = {
    region: regionCode,
    hasSelectedProviders: selected.size > 0,
    byKey: {},
    checked: 0,
  };

  if (refs.length === 0) return empty;

  const results = await Promise.allSettled(
    refs.map((ref) =>
      ref.mediaType === "movie"
        ? getCachedMovieWatchProviders(ref.id, regionCode)
        : getCachedTVWatchProviders(ref.id, regionCode),
    ),
  );

  const byKey: Record<string, TitleAvailability> = {};
  let checked = 0;

  results.forEach((result, index) => {
    // A failed lookup stays absent from the map, which the page reads as
    // "unknown" – better than claiming a title is unavailable.
    if (result.status !== "fulfilled") return;

    const ref = refs[index];
    const inRegion = result.value.results?.[regionCode];
    const flatrate = inRegion?.flatrate ?? [];
    const rentOrBuy = [...(inRegion?.rent ?? []), ...(inRegion?.buy ?? [])];

    const onMine = flatrate.some((provider) =>
      selected.has(provider.provider_id),
    );

    byKey[mediaItemKey(ref.id, ref.mediaType)] = {
      status: onMine
        ? "mine"
        : flatrate.length > 0
          ? "streaming"
          : rentOrBuy.length > 0
            ? "rent"
            : "none",
      // The subscription platforms only: a row of rental logos says "you can pay
      // for this", which is not what the badges are there to answer.
      providers: toBadges(flatrate),
    };
    checked += 1;
  });

  return { ...empty, byKey, checked };
}
