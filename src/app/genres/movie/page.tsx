import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { Suspense } from "react";
import { GenreListing } from "@/components/GenreListing";
import { LoadingSection } from "@/components/LoadingSpinner";

export const metadata: Metadata = pageMetadata({
  title: "Movies by Genre",
  description:
    "Films in one genre, narrowed to the streaming services you actually have. Action, Comedy, Horror, Sci-Fi and every genre TMDB tracks.",
  noindex: true,
});

/**
 * Films in one genre – `?genre=28-action`, optionally `&provider=netflix`.
 *
 * Both used to be path segments. A static export has no route per genre, and
 * the query string is where anything the catalogue names has to live.
 */
export default function GenreMoviesPage() {
  return (
    <Suspense fallback={<GenreListingFallback />}>
      <GenreListing mediaType="movie" />
    </Suspense>
  );
}

function GenreListingFallback() {
  return (
    <div className="min-h-screen bg-black pt-20">
      <div className="container mx-auto px-6 lg:px-8 py-8">
        <LoadingSection title="" rows={3} cols={6} />
      </div>
    </div>
  );
}
