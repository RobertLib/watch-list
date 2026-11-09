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
  /** Primary TMDB watch provider ID. */
  id: number;
  /** The same platform's provider IDs used in other regions. */
  alternateIds?: readonly number[];
  /** URL segment. */
  slug: string;
  /** Display name, as users know the brand. */
  name: string;
}

// IDs and names checked against TMDB /watch/providers on 2026-11-09. TMDB reuses
// retired provider IDs for unrelated services, so re-verify before editing.
//
// Paramount+ is split by tier in some regions, and the US no longer lists the
// plain 531 at all – only Premium (2303) and Essential (2616) – so with 531
// alone every Paramount+ landing came back empty for the region the build
// counts in. Apple TV+ has been "Apple TV" since Apple's October 2025 rename;
// the slug stays, because it is a URL.
export const STREAMING_LANDING_PLATFORMS: StreamingPlatform[] = [
  { id: 8, slug: "netflix", name: "Netflix" },
  { id: 337, slug: "disney-plus", name: "Disney+" },
  { id: 9, alternateIds: [119], slug: "prime-video", name: "Amazon Prime Video" },
  { id: 1899, slug: "hbo-max", name: "HBO Max" },
  { id: 350, slug: "apple-tv-plus", name: "Apple TV" },
  { id: 15, slug: "hulu", name: "Hulu" },
  {
    id: 531,
    alternateIds: [2303, 2616, 2304],
    slug: "paramount-plus",
    name: "Paramount+",
  },
];

/**
 * The fewest titles a landing must list to be offered to search engines.
 *
 * Every genre gets a landing per platform – the links between them have to
 * resolve – but "Western TV shows on Apple TV" is a page with two titles on
 * it, and a few dozen of those is what reads as doorway pages. Below this, the
 * page is `noindex` and stays out of the sitemap; it is still there for the
 * visitor who follows the link. Counted at build time, for the default region.
 */
export const MIN_INDEXABLE_LANDING_RESULTS = 10;

/**
 * Whether a landing with this many titles should be indexed. Unknown – a build
 * without TMDB access – is no, since nothing then shows it is not thin.
 */
export function isIndexableLanding(totalResults: number | undefined): boolean {
  return (
    totalResults !== undefined && totalResults >= MIN_INDEXABLE_LANDING_RESULTS
  );
}

/** TMDB treats a pipe-separated list as OR, covering every regional brand ID. */
export function streamingPlatformProviderFilter(platform: StreamingPlatform): string {
  return [platform.id, ...(platform.alternateIds ?? [])].join("|");
}

export function findStreamingPlatform(
  slug: string,
): StreamingPlatform | undefined {
  return STREAMING_LANDING_PLATFORMS.find((p) => p.slug === slug);
}
