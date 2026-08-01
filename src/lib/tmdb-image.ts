/**
 * Poster and backdrop URLs.
 *
 * Kept apart from `tmdb.ts` deliberately: this is pure string building that both
 * sides of the app need, while `tmdb.ts` reaches for cookies through
 * `next/headers` and so can only ever run on the server. Client components
 * import from here, which keeps that server-only module out of the browser
 * bundle entirely.
 */

// `w185` is TMDB's thumbnail size. It matters because `next.config.ts` sets
// `unoptimized`, so whatever size is named here is what the browser downloads –
// a 40px-wide thumbnail pointing at `w500` fetches the full poster.
export type ImageSize = "w185" | "w500" | "w780" | "w1280" | "original";

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg width='300' height='450' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='100%25' height='100%25' fill='%231f2937'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial,sans-serif' font-size='24' fill='%236b7280' text-anchor='middle' dominant-baseline='middle'%3ENo Image%3C/text%3E%3C/svg%3E";

export function getImageUrl(
  path: string | null,
  size: ImageSize = "w500",
): string {
  if (!path) return PLACEHOLDER;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
