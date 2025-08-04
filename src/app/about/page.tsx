import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About WatchList",
  description:
    "WatchList helps you discover movies and TV shows available on your streaming services. Filter by platform, genre, and rating to find your next watch.",
  openGraph: {
    title: "About WatchList",
    description:
      "WatchList helps you discover movies and TV shows available on your streaming services. Filter by platform, genre, and rating to find your next watch.",
    url: "https://www.watch-list.me/about",
    siteName: "WatchList",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
  },
  alternates: {
    canonical: "https://www.watch-list.me/about",
  },
};

export default function AboutPage() {
  return (
    <main className="container mx-auto px-6 lg:px-8 py-16 max-w-3xl">
      <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight">
        About WatchList
      </h1>
      <p className="text-gray-400 text-lg mb-10 leading-relaxed">
        WatchList is a free tool that helps you find movies and TV shows
        available on the streaming services you already subscribe to.
      </p>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">What it does</h2>
        <p className="text-gray-400 leading-relaxed">
          Instead of jumping between Netflix, Disney+, HBO Max, and other
          platforms to see what&apos;s available, WatchList lets you pick your
          services and instantly browse what you can watch right now. You can
          filter by genre, language, and rating to narrow down the options and
          find something that fits your mood — without paying for anything
          extra.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">How it works</h2>
        <p className="text-gray-400 leading-relaxed">
          Movie and TV show data, including streaming availability, comes from{" "}
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            The Movie Database (TMDb)
          </a>
          . WatchList uses their API to show you up-to-date information about
          what&apos;s trending, what&apos;s newly available, and what&apos;s
          rated highest — filtered to your region and your streaming providers.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">Privacy</h2>
        <p className="text-gray-400 leading-relaxed">
          WatchList does not require an account. Your watchlist is saved locally
          in your browser and never sent to a server. Your streaming provider
          preferences and region are stored in a cookie on your device only.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold text-white mb-3">Open source</h2>
        <p className="text-gray-400 leading-relaxed">
          WatchList is open source. You can browse the code, report issues, or
          contribute on{" "}
          <a
            href="https://github.com/RobertLib/watch-list"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            GitHub
          </a>
          .
        </p>
      </section>

      <div className="flex gap-4">
        <Link
          href="/movies"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          Browse Movies
        </Link>
        <Link
          href="/tv-shows"
          className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          Browse TV Shows
        </Link>
      </div>
    </main>
  );
}
