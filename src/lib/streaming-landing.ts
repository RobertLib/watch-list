/**
 * Curated "genre on platform" landing pages.
 *
 * These exist because the filter-bar equivalents (`?watch_providers=8`) are
 * deliberately noindex — arbitrary filter combinations are endless and duplicate
 * each other. A small fixed set of genre x platform paths is different: each one
 * answers a query people actually search ("action movies on Netflix"), the result
 * set genuinely differs per platform, and TMDB has no such page to duplicate.
 *
 * Keeping the set small and requiring a minimum number of results is what stops
 * these from reading as doorway pages. Do not expand this list to every provider
 * TMDB returns.
 */

export interface StreamingPlatform {
  /** TMDB watch provider ID. */
  id: number;
  /** URL segment. */
  slug: string;
  /** Display name, as users know the brand. */
  name: string;
}

// IDs and names checked against TMDB /watch/providers on 2026-08-01. TMDB reuses
// retired provider IDs for unrelated services, so re-verify before editing.
export const STREAMING_LANDING_PLATFORMS: StreamingPlatform[] = [
  { id: 8, slug: "netflix", name: "Netflix" },
  { id: 337, slug: "disney-plus", name: "Disney+" },
  { id: 9, slug: "prime-video", name: "Amazon Prime Video" },
  { id: 1899, slug: "hbo-max", name: "HBO Max" },
  { id: 350, slug: "apple-tv-plus", name: "Apple TV+" },
  { id: 15, slug: "hulu", name: "Hulu" },
  { id: 531, slug: "paramount-plus", name: "Paramount+" },
];

/**
 * A listing this short is not worth putting in front of a searcher, and a set of
 * near-empty pages across every genre is exactly the doorway pattern Google
 * penalises. Below this, the page still renders for users but is noindex.
 */
export const MIN_RESULTS_TO_INDEX = 8;

export function findStreamingPlatform(
  slug: string,
): StreamingPlatform | undefined {
  return STREAMING_LANDING_PLATFORMS.find((p) => p.slug === slug);
}
