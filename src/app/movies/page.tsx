import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { MoviesContent } from "@/components/MoviesContent";

// Force dynamic rendering to avoid issues with cookies during build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Movies",
  description:
    "Discover the latest and greatest movies. Browse popular, top rated, and now playing movies across all streaming platforms. Find your next favorite film.",
  keywords: [
    "movies",
    "popular movies",
    "top rated movies",
    "now playing movies",
    "new movies",
    "movie database",
    "film reviews",
    "cinema",
    "streaming movies",
  ],
  openGraph: {
    title: "Movies - WatchList",
    description:
      "Discover the latest and greatest movies. Browse popular, top rated, and now playing movies across all streaming platforms.",
    type: "website",
    url: "https://www.watch-list.me/movies",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Movies - WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Movies - WatchList",
    description:
      "Discover the latest and greatest movies. Browse popular, top rated, and now playing movies.",
  },
  alternates: {
    canonical: "https://www.watch-list.me/movies",
  },
};

export default function MoviesPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="Movies"
        description="Discover the latest and greatest movies"
        mediaType="movie"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <MoviesContent />

        {/* SEO editorial section */}
        <section
          aria-labelledby="movies-guide-heading"
          className="border-t border-gray-800 mt-16 pt-12 space-y-10"
        >
          <div>
            <h2
              id="movies-guide-heading"
              className="text-2xl font-bold text-white mb-4"
            >
              Discover Your Next Favorite Movie
            </h2>
            <p className="text-gray-400 leading-relaxed max-w-3xl">
              From Oscar-winning dramas to summer blockbusters, WatchList helps
              you navigate the vast world of cinema. Our movie database is
              updated daily with the latest releases, box-office hits, and
              hidden gems across every genre, so there&apos;s always something
              new to discover, whether you&apos;re a casual viewer or a
              dedicated cinephile.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Browse Movies by Streaming Platform
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Filter movies available on Netflix, Amazon Prime Video, Disney+,
                HBO Max, Apple TV+, Hulu, Paramount+, and dozens of other
                streaming services. See exactly what&apos;s included in your
                current subscriptions, no extra cost, no guesswork, no app
                hopping.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Filter by Genre, Rating &amp; Year
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Whether you want a high-octane Action thriller, a feel-good
                Romantic Comedy, a thought-provoking Documentary, or a
                spine-tingling Horror film, our genre filters narrow the list
                instantly. Combine with rating and release year to find exactly
                what fits tonight&apos;s mood.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Now Playing, Upcoming &amp; Top Rated
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Keep up with movies currently in theaters, preview upcoming
                releases before they arrive, or explore the all-time top-rated
                films according to audience scores. WatchList pulls real-time
                data so the listings always reflect what&apos;s actually playing
                and what&apos;s genuinely highly regarded.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Save Movies to Your Personal Watchlist
              </h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                Spotted a recommendation in a review, a trailer, or from a
                friend? Add it to your watchlist in one click. No account
                required, your list is stored securely and privately, ready
                whenever you are. Optionally sign in to sync your watchlist
                across all your devices.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
