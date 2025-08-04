import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * Declared here rather than inherited, for the robots directive.
 *
 * Next emits its own `noindex` for this page, while the root layout's metadata
 * contributes an `index, follow` that every route inherits – so the document
 * carried both, which is contradictory markup even though the restrictive one
 * wins. Setting it explicitly collapses the pair into the one tag that is meant,
 * and gives a 404 a title of its own instead of the home page's.
 */
export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist. Your watchlist is unaffected.",
  robots: { index: false, follow: true },
};

/**
 * Rendered for every `notFound()` in the app, and for URLs that match no route.
 *
 * The point of having one at all is the links: the default Next.js 404 is a bare
 * message on a white page with no way out, which for a crawler is a dead end and
 * for a visitor who mistyped a slug is worse than the page they wanted.
 */
export default function NotFound() {
  return (
    <div className="container mx-auto px-6 py-24 text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-800 flex items-center justify-center">
        <Compass className="w-10 h-10 text-gray-500" aria-hidden="true" />
      </div>
      <h1 className="text-3xl font-bold mb-3">This page does not exist</h1>
      <p className="text-gray-400 max-w-md mx-auto leading-relaxed">
        The link may be old, or the title may have been renamed on TMDb. Nothing
        in your watchlist is affected.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          prefetch={false}
          className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
        >
          Go to the home page
        </Link>
        <Link
          href="/movies"
          prefetch={false}
          className="inline-flex items-center px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
        >
          Browse movies
        </Link>
        <Link
          href="/tv-shows"
          prefetch={false}
          className="inline-flex items-center px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
        >
          Browse TV shows
        </Link>
      </div>

      <p className="mt-10 text-sm text-gray-500">
        Looking for something specific?{" "}
        <Link
          href="/search"
          prefetch={false}
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          Search WatchList
        </Link>
        {" or pick a "}
        <Link
          href="/genres"
          prefetch={false}
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          genre
        </Link>
        .
      </p>
    </div>
  );
}
