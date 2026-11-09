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
 * Any film, by query string – `?id=fight-club-550`.
 *
 * A static export can only serve paths that existed at build time, and TMDB's
 * catalogue is not a build-time list. The best-known films do get a path of
 * their own (`movie/[slug]`), and links go there for those; this page is for
 * the rest, and for old links. `useSearchParams` reads the id, which is why the
 * body sits behind a Suspense boundary – during the prerender there is no query
 * string to read, so the skeleton is what gets built into the HTML. One file
 * for every film, so `noindex`; its canonical, set in the browser, names the
 * path where there is one.
 */
export default function Page() {
  return <MovieContent />;
}
