import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { GenresContent } from "@/components/GenresContent";

// Force dynamic rendering to avoid issues with cookies during build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Genres",
  description:
    "Browse movies and TV shows by genre. Explore action, comedy, drama, horror, sci-fi, romance, and many more genres to find your perfect entertainment.",
  keywords: [
    "movie genres",
    "tv show genres",
    "action movies",
    "comedy films",
    "drama series",
    "horror movies",
    "sci-fi shows",
    "romance films",
    "thriller movies",
    "documentary series",
    "animation",
    "adventure movies",
  ],
  openGraph: {
    title: "Genres - WatchList",
    description:
      "Browse movies and TV shows by genre. Explore action, comedy, drama, horror, sci-fi, romance, and many more genres.",
    type: "website",
    url: "https://www.watch-list.me/genres",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Genres - WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Genres - WatchList",
    description:
      "Browse movies and TV shows by genre. Find your perfect entertainment by category.",
  },
  alternates: {
    canonical: "https://www.watch-list.me/genres",
  },
};

export default function GenresPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="Genres"
        description="Browse movies and TV shows by genre"
        mediaType="all"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <GenresContent />

        {/* SEO editorial section */}
        <section
          aria-labelledby="genres-guide-heading"
          className="border-t border-gray-800 mt-16 pt-12 space-y-10"
        >
          <div>
            <h2
              id="genres-guide-heading"
              className="text-2xl font-bold text-white mb-4"
            >
              Explore Movies &amp; TV Shows by Genre
            </h2>
            <p className="text-gray-400 leading-relaxed max-w-3xl">
              Genre browsing is one of the fastest ways to find your next watch.
              Whether you&apos;re craving the adrenaline of an Action thriller,
              the laughs of a stand-up Comedy special, the tension of a Crime
              drama, or the wonder of a Sci-Fi epic, WatchList lets you dive
              straight into the category that fits your mood, without wading
              through unrelated titles.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h3 className="font-semibold text-white">
                Action &amp; Adventure
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                High-speed chases, epic battles, and globe-trotting heroes.
                Explore the best Action and Adventure movies and series, from
                blockbuster franchises to indie thrillers you may have missed.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-white">Drama &amp; Crime</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Complex characters, moral dilemmas, and gripping storylines.
                Browse top-rated Drama films and binge-worthy Crime series that
                keep you glued to the screen from the first scene to the last.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-white">Comedy &amp; Romance</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Sometimes you just need a good laugh or a heartwarming love
                story. Find the highest-rated Comedies and Romantic films for
                date nights, solo evenings, or movie nights with friends.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-white">Sci-Fi &amp; Fantasy</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Alternate universes, futuristic technology, mythical worlds.
                Discover the most imaginative Sci-Fi movies and Fantasy TV
                series, from space operas to epic fantasy sagas.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-white">
                Horror &amp; Thriller
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Jump scares, psychological terror, and edge-of-your-seat
                suspense. Browse the scariest Horror movies and most gripping
                Thriller series available on your streaming services right now.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-white">
                Documentary &amp; Reality
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                True stories that are stranger than fiction. Explore acclaimed
                Documentary films and compelling Reality TV shows covering
                everything from nature and history to true crime and culture.
              </p>
            </div>
          </div>

          <p className="text-gray-400 leading-relaxed text-sm max-w-3xl">
            Each genre page on WatchList can be filtered by streaming platform
            and region, so you only see titles you can actually watch right now.
            Add anything that catches your eye to your personal watchlist, no
            account needed.
          </p>
        </section>
      </div>
    </div>
  );
}
