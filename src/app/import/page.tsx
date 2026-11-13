import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/page-metadata";
import { StructuredData } from "@/components/StructuredData";
import { ImportData } from "@/components/ImportData";
import { SITE_URL, absoluteUrl } from "@/lib/routes";

export const metadata: Metadata = pageMetadata({
  title: "Import from Letterboxd, IMDb, Trakt or TV Time",
  description:
    "Bring your watchlist, watched history, ratings and episode progress from Letterboxd, IMDb, Trakt or TV Time. Read in your browser – no account, no upload.",
  path: "/import",
});

/** What each service's export brings across, and how to get it. */
const SOURCES = [
  {
    name: "Letterboxd",
    how: (
      <>
        On Letterboxd, open <strong>Settings → Data → Export Your Data</strong>.
        It downloads a ZIP; choose that file here as it is.
      </>
    ),
    brings:
      "Your watchlist, your watched films, your diary dates and your ratings – stars out of five become a score out of ten.",
    note: "Letterboxd identifies a film by name and year, so each one is matched by searching TMDB. A film whose name and year do not agree with anything there is listed at the end rather than guessed at.",
  },
  {
    name: "IMDb",
    how: (
      <>
        On IMDb, open <strong>Your Watchlist</strong>, <strong>Your Ratings</strong>{" "}
        or any list and choose <strong>Export</strong>. IMDb prepares a CSV file
        to download; choose it here. Several files at once is fine.
      </>
    ),
    brings:
      "Ratings arrive as scores and as watched titles. A watchlist or any other list arrives as titles to watch.",
    note: "IMDb's watchlist and its custom lists export in the same shape, so a list you kept for another reason will also land on your watchlist. Single rated episodes are left out: there is nowhere to put them here.",
  },
  {
    name: "Trakt",
    how: (
      <>
        In Trakt&apos;s web app, open <strong>Settings → Data → Export</strong>.
        It downloads a ZIP named <code>trakt-export-…</code>; choose that file.
      </>
    ),
    brings:
      "Your watchlist, your watched films, your ratings, and every episode in your history – ticked against its series, so each one picks up where you left off.",
    note: "Trakt carries TMDB's own ids, so nothing has to be guessed. Collections, custom lists, comments and likes are not read.",
  },
  {
    name: "TV Time",
    how: (
      <>
        TV Time closed on 15 July 2026 and a new export can no longer be
        requested. If you saved one before then – <code>gdpr-data.zip</code>{" "}
        from a data request, or the <code>tvtime-export-….zip</code> the app
        offered in its last months – choose it here.
      </>
    ),
    brings:
      "Every watched episode, ticked against its series; the shows you followed and had not started, as titles to watch; and your films, watched and to watch.",
    note: "Series are matched by the TheTVDB id TV Time kept for them. In the older export, films have no id at all – only a name, sometimes a translated one, and a release date – so some will not be found.",
  },
] as const;

/**
 * Import: the way in for someone who already has a list somewhere else.
 *
 * An indexable page with the tool on it, rather than a button in settings –
 * people look for "import Letterboxd watchlist" and "TV Time export" by name,
 * and the answer to both is this page.
 */
export default function ImportPage() {
  return (
    <div className="container mx-auto px-6 lg:px-8 py-12 max-w-3xl">
      <StructuredData
        type="BreadcrumbList"
        data={{
          breadcrumbItems: [
            { name: "Home", url: SITE_URL },
            { name: "Import", url: absoluteUrl("/import") },
          ],
        }}
      />

      <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight">
        Import your watchlist and history
      </h1>
      <p className="text-gray-400 text-lg mb-8 leading-relaxed">
        Bring what you have already tracked on Letterboxd, IMDb, Trakt or TV
        Time: what you mean to watch, what you have watched, the scores you
        gave and the episodes you are up to. There is no account to create –
        the export is read in your browser and your lists stay in it.
      </p>

      <ImportData />

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white mb-6">
          Where to get your export
        </h2>
        <div className="space-y-8">
          {SOURCES.map((source) => (
            <div key={source.name}>
              <h3 className="text-lg font-semibold text-white mb-2">
                {source.name}
              </h3>
              <p className="text-gray-300 leading-relaxed">{source.how}</p>
              <p className="text-gray-400 leading-relaxed mt-2">
                <span className="text-gray-300">What comes across:</span>{" "}
                {source.brings}
              </p>
              <p className="text-gray-500 text-sm leading-relaxed mt-2">
                {source.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white mb-3">
          What an import does, and does not
        </h2>
        <ul className="list-disc pl-5 text-gray-400 leading-relaxed space-y-2">
          <li>
            It only adds. Nothing already on your lists is removed or changed,
            and a score you gave here is never replaced by an imported one.
          </li>
          <li>
            A title the export says you have watched leaves your watchlist, the
            same as when you mark one watched yourself.
          </li>
          <li>
            Nothing is saved until every title has been matched, so you can
            cancel part-way. And because it only adds, importing the same file
            twice does no harm.
          </li>
          <li>
            Reviews, comments, likes, followers and custom lists are not
            imported. Neither is anything about your account.
          </li>
          <li>
            Each list holds 2,000 titles. A longer history keeps its most
            recent 2,000.
          </li>
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-white mb-3">
          Where your data goes
        </h2>
        <p className="text-gray-400 leading-relaxed">
          Nowhere. The file is opened by this page, in your browser, and is not
          uploaded. To find each title, its name or id is looked up at TMDB –
          the public film database every page here already uses. What is
          imported is kept in this browser&apos;s storage, where the rest of
          your lists are; there is no account behind it, so{" "}
          <Link
            href="/profile"
            prefetch={false}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            download a backup
          </Link>{" "}
          once you are set up.
        </p>
      </section>

      <section className="mt-14 rounded-xl border border-gray-800 bg-gray-900/60 p-6">
        <h2 className="font-semibold text-white">Coming from TV Time?</h2>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">
          What this app does that TV Time did, what it does not, and what to do
          if you never saved an export.
        </p>
        <Link
          href="/tv-time-alternative"
          prefetch={false}
          className="inline-block mt-3 text-blue-400 hover:text-blue-300 transition-colors"
        >
          WatchList as a TV Time alternative →
        </Link>
      </section>
    </div>
  );
}
