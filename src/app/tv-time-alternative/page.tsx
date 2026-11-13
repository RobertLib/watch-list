import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/page-metadata";
import { StructuredData } from "@/components/StructuredData";
import { SITE_URL, absoluteUrl } from "@/lib/routes";

export const metadata: Metadata = pageMetadata({
  title: "A TV Time Alternative With No Account",
  description:
    "TV Time closed in July 2026. WatchList tracks episodes, a watchlist and upcoming air dates in your browser, free, and can read a TV Time export you saved.",
  path: "/tv-time-alternative",
});

/**
 * For the people TV Time left behind when it closed.
 *
 * Written to be believed by someone comparing half a dozen replacements: it
 * says what this app does not do as plainly as what it does. A page that
 * claimed to replace everything would be found out at the first missing
 * feature, and the two things this app genuinely does differently – no
 * account, nothing that can be shut down with your history in it – are only
 * credible next to an honest list of what it lacks.
 */
export default function TVTimeAlternativePage() {
  return (
    <div className="container mx-auto px-6 lg:px-8 py-12 max-w-3xl">
      <StructuredData
        type="BreadcrumbList"
        data={{
          breadcrumbItems: [
            { name: "Home", url: SITE_URL },
            {
              name: "TV Time alternative",
              url: absoluteUrl("/tv-time-alternative"),
            },
          ],
        }}
      />

      <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight">
        A TV Time alternative with no account
      </h1>
      <p className="text-gray-400 text-lg mb-10 leading-relaxed">
        TV Time closed on 15 July 2026, and the watch histories people had
        kept in it for years went with it. WatchList tracks the same things –
        what you are watching, which episode you are up to, what airs next –
        without an account for anyone to close.
      </p>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">
          If you saved your TV Time data
        </h2>
        <p className="text-gray-400 leading-relaxed">
          Before it closed, TV Time let you download your data: a{" "}
          <code>gdpr-data.zip</code> from a data request, or in its last months
          a <code>tvtime-export-….zip</code> straight from the app. Either one
          can be read here. Your watched episodes are ticked against their
          series, the shows you had not started go on your watchlist, and your
          films come across as watched or to watch.
        </p>
        <Link
          href="/import"
          prefetch={false}
          className="inline-flex items-center mt-4 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 font-semibold text-white transition-colors"
        >
          Import a TV Time export
        </Link>
        <p className="text-gray-500 text-sm leading-relaxed mt-4">
          If you never saved one, the data cannot be requested any more. If you
          had moved it to Trakt in the meantime, a Trakt export imports here
          too; otherwise the shows you remember can be added back by search,
          and a whole season ticks in one click.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">
          What you get that TV Time had
        </h2>
        <ul className="list-disc pl-5 text-gray-400 leading-relaxed space-y-2">
          <li>
            <span className="text-gray-200">Episode tracking.</span> Tick
            episodes one at a time or a season at once; every series has a
            progress bar, and the home page opens with the next unwatched
            episode of each show you are in the middle of.
          </li>
          <li>
            <span className="text-gray-200">What airs next.</span> A{" "}
            <Link
              href="/calendar"
              prefetch={false}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              release calendar
            </Link>{" "}
            of upcoming episodes and film releases for everything you follow,
            which exports to your own calendar app.
          </li>
          <li>
            <span className="text-gray-200">A watchlist for films and series
            together</span>, sortable, and groupable by which of your streaming
            services each title is on right now.
          </li>
          <li>
            <span className="text-gray-200">Ratings and stats.</span> Score
            anything out of ten; see hours watched, top genres and a year in
            review.
          </li>
          <li>
            <span className="text-gray-200">Where to watch</span>, for more
            than two hundred countries.
          </li>
          <li>
            <span className="text-gray-200">Profiles</span>, so two people
            sharing a browser keep separate lists.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">
          What it does not do
        </h2>
        <ul className="list-disc pl-5 text-gray-400 leading-relaxed space-y-2">
          <li>
            <span className="text-gray-200">No community.</span> There are no
            comments under episodes, no reactions, no friends list. If that was
            the part of TV Time you opened it for, this is not a replacement
            for it.
          </li>
          <li>
            <span className="text-gray-200">No syncing between devices.</span>{" "}
            Your lists live in the browser you made them in. To move them, or
            to keep them safe, you download a backup file and restore it
            elsewhere. Services built around an account, such as Trakt or
            Simkl, sync on their own; this one deliberately has no account.
          </li>
          <li>
            <span className="text-gray-200">No automatic tracking.</span>{" "}
            Nothing watches what you play on Netflix. You tick what you
            watched.
          </li>
          <li>
            <span className="text-gray-200">No app-store app.</span> It is a
            website that installs to a phone&apos;s home screen and works
            offline, not a native app.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-bold text-white mb-3">
          Why no account is the point
        </h2>
        <p className="text-gray-400 leading-relaxed">
          TV Time&apos;s history was in TV Time&apos;s database, so when the
          company stopped, the history did. Here there is no database of
          yours to switch off: everything you track is stored by your own
          browser, the site is static files, and the{" "}
          <a
            href="https://github.com/RobertLib/watch-list"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            code is open
          </a>
          . The price is the one above – nothing syncs unless you carry a
          backup across – and the backup is a plain file you can open, so the
          next move, if there is one, starts from something you already hold.
        </p>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">Start without an export</h2>
          <p className="text-sm text-gray-400 mt-1">
            Find a series, tick where you are up to, and it is tracked.
          </p>
        </div>
        <Link
          href="/tv-shows"
          prefetch={false}
          className="inline-flex items-center px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold text-white transition-colors shrink-0"
        >
          Browse TV shows
        </Link>
      </section>
    </div>
  );
}
