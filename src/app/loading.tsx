/**
 * The loading state for every route that does not bring its own.
 *
 * That is thirteen of them – `/about`, `/moods`, `/search`, `/stats`, the
 * daily games and the rest – and none of them looks like the home page. This
 * file used to be a copy of the home page's shape regardless: a full-height
 * hero, a welcome panel and five carousels, flashed in front of a page that
 * was about to render a heading and some prose. So it is neutral now: a title,
 * a line or two of text, and a grid of tiles, which is roughly what every route
 * here resolves into and precisely what none of them contradicts.
 *
 * The home page keeps its own loading experience without a file of its own,
 * because it never depended on this one. Its shell is static and fetches
 * nothing before it is served; `HeroSection` and each carousel render their own
 * `HeroSkeleton` and `CarouselSkeleton` from the moment they mount until their
 * data arrives. This fallback shows for the home page only during the brief
 * client-side navigation to `/` while the route's payload is fetched – usually
 * already prefetched – and a generic skeleton for that instant is a fair trade
 * against a home-shaped one for thirteen pages that are not the home page.
 * Wrapping the home page in its own `Suspense` would change nothing: nothing in
 * it suspends, so the fallback would never be shown.
 */

import { LoadingSection } from "@/components/LoadingSpinner";

export default function Loading() {
  return (
    <div className="container mx-auto px-6 lg:px-8 py-8">
      {/* Where the page's heading and lead paragraph will be. */}
      <div className="max-w-2xl space-y-3 mb-10 animate-pulse" aria-hidden="true">
        <div className="h-9 sm:h-10 bg-gray-700 rounded w-2/3" />
        <div className="h-4 bg-gray-700 rounded w-full" />
        <div className="h-4 bg-gray-700 rounded w-3/4" />
      </div>

      {/* Where the page's content will be. The live-region announcement comes
          from the section, once – the tiles are decoration. */}
      <LoadingSection count={12} />
    </div>
  );
}
