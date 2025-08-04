import type { Metadata } from "next";
import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { StructuredData } from "@/components/StructuredData";
import { SITE_URL, absoluteUrl } from "@/lib/routes";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description:
    "What WatchList is, who made it, and why tracking what you mean to watch needs neither an account nor a subscription.",
  path: "/about",
});

export default function AboutPage() {
  return (
    // A <div>, not a <main>: the root layout already provides the one <main> the
    // document is allowed, and a nested one leaves assistive tech with two
    // candidates for "the main content".
    <div className="container mx-auto px-6 lg:px-8 py-16 max-w-3xl">
      <StructuredData
        type="BreadcrumbList"
        data={{
          breadcrumbItems: [
            { name: "Home", url: SITE_URL },
            { name: "About", url: absoluteUrl("/about") },
          ],
        }}
      />

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
          find something that fits your mood, without paying for anything extra.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">How it works</h2>
        <p className="text-gray-400 leading-relaxed">
          Movie and TV show data comes from{" "}
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            The Movie Database (TMDb)
          </a>
          . Streaming availability is provided by{" "}
          <a
            href="https://www.justwatch.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            JustWatch
          </a>
          {" "}through TMDb&apos;s API. WatchList uses this data to show you
          up-to-date information about
          what&apos;s trending, what&apos;s newly available, and what&apos;s
          rated highest, filtered to your region and your streaming providers.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">Privacy</h2>
        <p className="text-gray-400 leading-relaxed">
          WatchList does not require an account. Your watchlist, watched titles,
          episode progress, ratings, region and streaming platforms are saved in
          this browser&apos;s storage. There is no WatchList account or server
          copy of your personal record.
        </p>
        <p className="text-gray-400 leading-relaxed mt-4">
          Your browser contacts external services to load the information shown
          on the site:
        </p>
        <ul className="text-gray-400 leading-relaxed mt-3 space-y-2 list-disc pl-5">
          <li>
            <span className="text-gray-300">TMDb</span> — catalogues, posters,
            recommendations, title details and streaming availability. Requests
            include title or person IDs, search queries, and the region and
            provider IDs needed for filtering. Availability, recommendations,
            calendars and statistics also use IDs from your saved lists or
            viewing history to look up those titles.
          </li>
          <li>
            <span className="text-gray-300">Wikipedia</span> — the editorial
            background shown on some title pages, requested by name when you open
            one.
          </li>
          <li>
            <span className="text-gray-300">YouTube</span> — trailer thumbnails,
            and the player itself once you press play. Trailers are embedded
            through youtube-nocookie.com.
          </li>
          <li>
            <span className="text-gray-300">Google Analytics</span> — optional
            traffic measurement, enabled only when the site owner configures it.
            When enabled, it receives page visits and page addresses and may use
            cookies. WatchList works without it.
          </li>
        </ul>
        <p className="text-gray-400 leading-relaxed mt-4">
          External services receive your IP address and the inputs needed for
          each request. Your ratings and episode progress are processed locally.
          If you choose to share a list, its link contains the title IDs and any
          list name you include; anyone with that link can read it.
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
          prefetch={false}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          Browse Movies
        </Link>
        <Link
          href="/tv-shows"
          prefetch={false}
          className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          Browse TV Shows
        </Link>
      </div>
    </div>
  );
}
