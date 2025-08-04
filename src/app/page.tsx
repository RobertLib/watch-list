import { HeroSection } from "@/components/HeroSection";
import { WelcomePanelContent } from "@/components/WelcomePanelContent";
import { HomeWatchlistPanel } from "@/components/HomeWatchlistPanel";
import { GenreQuickNav } from "@/components/GenreQuickNav";
import { StructuredData } from "@/components/StructuredData";
import {
  TrendingCarousel,
  NowPlayingCarousel,
  PopularMoviesCarousel,
  PopularTVShowsCarousel,
  TopRatedMoviesCarousel,
  TopRatedTVShowsCarousel,
  AiringTodayCarousel,
  UpcomingMoviesCarousel,
} from "@/components/carousels";
import { tmdbServerApi } from "@/lib/tmdb-server";

// Revalidate page every 24 hours - trending content doesn't change fast enough to justify more frequent ISR writes
export const revalidate = 86400;

import type { TMDBResponse, MediaItem } from "@/types/tmdb";

const EMPTY_TRENDING: TMDBResponse<MediaItem> = {
  page: 1,
  results: [],
  total_pages: 0,
  total_results: 0,
};

export default async function Home() {
  // Fetch trending data once and share it between HeroSection and TrendingCarousel
  let trendingData;
  try {
    trendingData = await tmdbServerApi.getTrending("all", "week");
  } catch {
    trendingData = EMPTY_TRENDING;
  }

  return (
    <>
      <StructuredData type="Website" data={{}} />
      <StructuredData type="WebApplication" data={{}} />
      <StructuredData
        type="FAQPage"
        data={{
          faqItems: [
            {
              question: "What is WatchList?",
              answer:
                "WatchList is a free online tool that lets you track movies and TV shows you want to watch. You can build a personal watchlist, discover trending titles, and find out which streaming service they're available on, no account required.",
            },
            {
              question: "Is WatchList free to use?",
              answer:
                "Yes, WatchList is completely free. There are no subscriptions, no sign-ups, and no hidden fees. All features including watchlist management, streaming availability, and browsing are available at no cost.",
            },
            {
              question: "How do I add a movie or TV show to my watchlist?",
              answer:
                "Simply find the movie or TV show you want using search or browse, then click the 'Add to Watchlist' button on the title's detail page or on any media card. Your watchlist is saved locally in your browser, no account needed.",
            },
            {
              question: "Which streaming platforms does WatchList support?",
              answer:
                "WatchList shows real-time streaming availability for Netflix, Prime Video, Disney+, Apple TV+, Hulu, HBO Max, and many more platforms. Availability is shown per country so you always know where to watch in your region.",
            },
            {
              question: "Can I browse movies and TV shows by genre?",
              answer:
                "Yes. WatchList lets you browse movies and TV shows by genre, including Action, Comedy, Drama, Thriller, Sci-Fi, Horror, and more. You can also filter by streaming platform and sort by rating or release date.",
            },
          ],
        }}
      />

      {/* Semantic h1 for SEO – visually hidden, hero section shows featured title as h2 */}
      <h1 className="sr-only">
        WatchList – Your Free Movie &amp; TV Show Watchlist
      </h1>

      <HeroSection trendingData={trendingData} />

      <div className="container mx-auto px-6 lg:px-8 py-8 space-y-12">
        <WelcomePanelContent />

        <HomeWatchlistPanel />

        <TrendingCarousel trendingData={trendingData} />

        {/* Movies section */}
        <div className="border-t border-gray-800/60 pt-10 space-y-12">
          <h2 className="text-3xl font-bold text-white">Movies</h2>
          <NowPlayingCarousel />
          <PopularMoviesCarousel />
          <UpcomingMoviesCarousel />
          <TopRatedMoviesCarousel />
        </div>

        {/* TV Shows section */}
        <div className="border-t border-gray-800/60 pt-10 space-y-12">
          <h2 className="text-3xl font-bold text-white">TV Shows</h2>
          <AiringTodayCarousel />
          <PopularTVShowsCarousel />
          <TopRatedTVShowsCarousel />
        </div>

        {/* Genre quick browse */}
        <div className="border-t border-gray-800/60 pt-10">
          <GenreQuickNav />
        </div>

        {/* Static feature section – server-rendered, keyword-rich text for SEO */}
        <section
          aria-labelledby="features-heading"
          className="border-t border-gray-800 pt-12"
        >
          <h2
            id="features-heading"
            className="text-2xl font-bold mb-4 text-white"
          >
            Your Free Movie &amp; TV Show Watchlist
          </h2>
          <p className="text-gray-400 leading-relaxed mb-8 max-w-3xl">
            WatchList is the free, no-account-required way to track every movie
            and TV show you want to watch. Whether you&apos;re hunting for a new
            thriller on Netflix, catching up on a critically acclaimed drama on
            HBO Max, or planning your weekend movie marathon, WatchList brings
            everything together in one place.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-3">
              <h3 className="font-semibold text-white">Build your watchlist</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Add any movie or TV show to your personal watchlist with one
                click. Keep track of what you want to watch next, from new
                theatrical releases to classic films and beloved series you
                haven&apos;t started yet. No sign-up required.
              </p>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-3">
              <h3 className="font-semibold text-white">
                Discover what&apos;s trending
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Browse trending movies, now-playing films, popular TV series,
                and top-rated titles updated daily. From box-office hits to
                binge-worthy shows, stay on top of what everyone is watching
                across Netflix, Prime Video, Disney+, and more.
              </p>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-3">
              <h3 className="font-semibold text-white">Find where to watch</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Every movie and TV show page shows real-time streaming
                availability in your region, so you always know whether a title
                is on Netflix, Prime Video, Apple TV+, Disney+, or Hulu. No more
                switching between apps to find out.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 mt-6">
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-3">
              <h3 className="font-semibold text-white">
                Filter by genre &amp; platform
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Narrow down your search using powerful filters: pick a genre
                like Action, Comedy, Drama, or Sci-Fi; choose your streaming
                services; and sort by rating or release date. Finding
                tonight&apos;s watch has never been faster.
              </p>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 space-y-3">
              <h3 className="font-semibold text-white">
                Cast, crew &amp; reviews in one place
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Each title page includes full cast and crew details, audience
                reviews, trailers, trivia, and related titles, everything you
                need to decide what to watch next, without leaving the page.
              </p>
            </div>
          </div>
        </section>

        {/* About section */}
        <section
          aria-labelledby="about-heading"
          className="border-t border-gray-800 pt-12"
        >
          <h2 id="about-heading" className="text-2xl font-bold mb-4 text-white">
            How WatchList Works
          </h2>
          <div className="grid md:grid-cols-2 gap-10 text-gray-400 leading-relaxed">
            <div className="space-y-4">
              <p>
                WatchList pulls live data from The Movie Database (TMDb) to give
                you accurate, up-to-date information on thousands of movies and
                TV shows. Streaming availability is fetched per region, so what
                you see reflects what&apos;s actually on your local version of
                each platform.
              </p>
              <p>
                Your personal watchlist is stored directly in your browser, no
                account, no password, no email required. You can optionally sign
                in to sync your watchlist across devices, but the service is
                fully functional without it.
              </p>
            </div>
            <div className="space-y-4">
              <p>
                Every movie and TV show detail page combines official metadata,
                cast and crew credits, viewer reviews, trivia, and Wikipedia
                insights into a single, easy-to-read overview. Use it to
                research a title before committing to a two-hour film or a
                multi-season series.
              </p>
              <p>
                Genre pages let you browse the best Action movies, top-rated
                Drama series, must-see Documentaries, and more, all filterable
                by streaming platform and region. Start with what&apos;s
                trending or dig deep into a specific category.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
