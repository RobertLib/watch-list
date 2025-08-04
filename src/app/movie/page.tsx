import type { Metadata } from "next";
import { MovieContent } from "@/components/MovieContent";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Movie Details",
  description:
    "Cast, crew, trailers, reviews and where to stream a film, with one click to add it to your watchlist.",
  noindex: true,
});

/**
 * A film.
 *
 * The title is named by `?id=550-fight-club` rather than by the path: a static
 * export can only serve paths that existed at build time, and TMDB's catalogue
 * is not a build-time list. `useSearchParams` is what reads it, which is why the
 * body sits behind a Suspense boundary – during the prerender there is no query
 * string to read, so the skeleton is what gets built into the HTML.
 */
export default function Page() {
  return <MovieContent />;
}
