import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import { Suspense } from "react";
import { PageHero } from "@/components/PageHero";
import {
  TVShowsContent,
  TVShowsLoadingFallback,
} from "@/components/TVShowsContent";

export const metadata: Metadata = pageMetadata({
  title: "TV Shows",
  description:
    "Browse popular, airing and top-rated TV series. Filter by genre, rating and the streaming services you already subscribe to.",
  path: "/tv-shows",
});

export default function TVShowsPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="TV Shows"
        description="Discover the latest and greatest TV shows"
        mediaType="tv"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        {/* The listing reads its filters from the query string, which does not
            exist during the prerender – so the built HTML holds the skeleton. */}
        <Suspense fallback={<TVShowsLoadingFallback />}>
          <TVShowsContent />
        </Suspense>

        {/* Editorial section – part of the prerendered shell */}
        <section
          aria-labelledby="tv-guide-heading"
          className="border-t border-gray-800 mt-16 pt-12 space-y-10"
        >
          <div>
            <h2
              id="tv-guide-heading"
              className="text-2xl font-bold text-white mb-4"
            >
              Find Your Next Binge-Worthy TV Show
            </h2>
            <p className="text-gray-400 leading-relaxed max-w-3xl">
              From prestige drama series to addictive reality competition shows,
              WatchList makes it easy to find what to watch next on television.
              Our TV show database covers thousands of series across every genre
              and platform, updated daily with the latest premieres, season
              renewals, and trending picks so you never run out of things to
              watch.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Browse TV Shows by Streaming Service
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Filter TV shows available on Netflix, HBO Max, Disney+, Amazon
                Prime Video, Apple TV+, Peacock, Paramount+, and many more. Find
                full series included in your existing subscriptions so you can
                start watching immediately, no extra spending required.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Filter by Genre &amp; Rating
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Narrow down thousands of shows by genre, Drama, Comedy, Crime,
                Sci-Fi, Fantasy, Documentary, Reality, and more. Combine genre
                filters with audience ratings to surface only highly-regarded
                series worth your time.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Currently Airing &amp; Top Rated Series
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Discover shows currently airing new episodes, track returning
                series with upcoming season premieres, or dive into the all-time
                top-rated TV shows loved by audiences worldwide. Stay current
                with what&apos;s on tonight without scrolling through endless
                streaming menus.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Full Series Details &amp; Episode Guides
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Each TV show page includes cast and crew credits, episode
                counts, season information, viewer reviews, trailers, and
                streaming availability, everything you need to decide whether to
                commit to a new series before you start watching. Add any show
                to your watchlist with a single click.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
