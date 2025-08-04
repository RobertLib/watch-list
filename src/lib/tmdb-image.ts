/**
 * Poster and backdrop URLs.
 *
 * Kept apart from `tmdb.ts` because it is pure string building with no transport
 * behind it: a component that only needs a poster URL should not pull in the
 * TMDB client, its cache and its token to get one.
 */

// The sizes TMDB's CDN serves, which it accepts for posters, backdrops and
// stills alike. It matters which one is named because `next.config.ts` sets
// `unoptimized`, so whatever is asked for here is what the browser downloads –
// a 40px-wide thumbnail pointing at `w500` fetches the full poster.
//
// The narrow ones are not decoration: the daily puzzle steps up through them to
// sharpen its image, and a downscaled image has genuinely lost the detail rather
// than merely having CSS blur laid over it.
export type ImageSize =
  | "w92"
  | "w154"
  | "w185"
  | "w300"
  | "w500"
  | "w780"
  | "w1280"
  | "original";

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg width='300' height='450' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='100%25' height='100%25' fill='%231f2937'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial,sans-serif' font-size='24' fill='%236b7280' text-anchor='middle' dominant-baseline='middle'%3ENo Image%3C/text%3E%3C/svg%3E";

export function getImageUrl(
  path: string | null,
  size: ImageSize = "w500",
): string {
  return getImageUrlOrNull(path, size) ?? PLACEHOLDER;
}

/**
 * The same URL, but null when TMDB has no image.
 *
 * For the callers that have to *omit* the image rather than stand a placeholder
 * in for it – structured data, where a `data:` URI in an `image` field is worse
 * than no field at all, and the daily puzzle, whose board has its own empty
 * state.
 */
export function getImageUrlOrNull(
  path: string | null | undefined,
  size: ImageSize = "w500",
): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
