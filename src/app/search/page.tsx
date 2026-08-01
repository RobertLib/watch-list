import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { MediaGrid } from "@/components/MediaGrid";
import { PersonGrid } from "@/components/PersonGrid";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { sanitizePage } from "@/lib/discover-filters";
import type { MediaItem, Person, TMDBResponse } from "@/types/tmdb";

// Search reads the region cookie, so this cannot be prerendered.
export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 200;

interface SearchPageProps {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}

/** A repeated parameter carries no extra meaning here; the first one wins. */
function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function readQuery(value: string | string[] | undefined): string {
  return firstParam(value).slice(0, MAX_QUERY_LENGTH).trim();
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const query = readQuery((await searchParams).q);

  return {
    title: query ? `Search: ${query}` : "Search",
    description: query
      ? `Movies, TV shows and people matching “${query}” on WatchList, with streaming availability for your region.`
      : "Search thousands of movies, TV shows and people. See where each title is streaming in your region and save it to your watchlist.",
    // Internal search results are the classic crawl trap: an unbounded set of
    // URLs whose content is assembled from pages that are already indexed on
    // their own. `follow` still lets the crawler reach those pages from here.
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = readQuery(params.q);
  const page = sanitizePage(Number(firstParam(params.page)) || 1);

  if (!query) return <EmptyQuery />;

  let media: TMDBResponse<MediaItem> | null = null;
  let people: TMDBResponse<Person> | null = null;

  // Settled separately: people are a sideshow here, and losing them should not
  // cost the titles.
  const [mediaResult, peopleResult] = await Promise.allSettled([
    tmdbServerApi.searchMulti(query, page),
    // People are only worth showing on the first page – by page three nobody is
    // looking for an actor any more.
    page === 1
      ? tmdbServerApi.searchPerson(query, 1)
      : Promise.resolve(null),
  ]);

  if (mediaResult.status === "fulfilled") media = mediaResult.value;
  if (peopleResult.status === "fulfilled") people = peopleResult.value;

  const items = media?.results ?? [];
  const persons = people?.results ?? [];
  const totalPages = Math.min(media?.total_pages ?? 1, 500);
  const totalResults = media?.total_results ?? 0;

  const failed = mediaResult.status === "rejected";
  const hasAnything = items.length > 0 || persons.length > 0;

  // `sanitizePage` only knows TMDB's hard ceiling of 500, not how many pages this
  // particular query has – so a hand-typed `?page=9999` used to render
  // "page 500 of 64" above an empty grid.
  const isBeyondLastPage = !failed && page > totalPages && totalResults > 0;

  if (isBeyondLastPage) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold mb-3 wrap-break-word">{query}</h1>
        <p className="text-gray-400 max-w-md mx-auto">
          There {totalPages === 1 ? "is" : "are"} only {totalPages} page
          {totalPages === 1 ? "" : "s"} of results for this search.
        </p>
        <Link
          href={searchHref(query, 1)}
          prefetch={false}
          className="mt-6 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
        >
          Back to the first page
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm text-gray-500 mb-1">Search results</p>
        <h1 className="text-3xl font-bold mb-2 wrap-break-word">{query}</h1>
        {failed ? (
          <p className="text-gray-400">
            Search is temporarily unavailable. Try again in a moment.
          </p>
        ) : (
          <p className="text-gray-400">
            {totalResults > 0
              ? `${totalResults.toLocaleString("en-US")} title${
                  totalResults === 1 ? "" : "s"
                }${totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}`
              : "No titles matched."}
          </p>
        )}
      </div>

      {!failed && !hasAnything && <NoResults query={query} />}

      {items.length > 0 && (
        <section aria-labelledby="titles-heading">
          <h2 id="titles-heading" className="sr-only">
            Movies and TV shows
          </h2>
          <MediaGrid items={items} />
        </section>
      )}

      {totalPages > 1 && (
        <Pagination query={query} page={page} totalPages={totalPages} />
      )}

      {persons.length > 0 && (
        <section aria-labelledby="people-heading" className="mt-14">
          <h2
            id="people-heading"
            className="text-xl font-semibold text-white mb-4"
          >
            People
          </h2>
          <PersonGrid people={persons.slice(0, 16)} />
        </section>
      )}
    </div>
  );
}

function searchHref(query: string, page: number): string {
  const params = new URLSearchParams({ q: query });
  if (page > 1) params.set("page", String(page));

  return `/search?${params.toString()}`;
}

/**
 * Plain links rather than a "load more" button.
 *
 * Each page is then its own URL: the Back button returns to where the visitor
 * was, and a page of results can be sent to someone.
 */
function Pagination({
  query,
  page,
  totalPages,
}: {
  query: string;
  page: number;
  totalPages: number;
}) {
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      aria-label="Search result pages"
      className="flex items-center justify-center gap-3 mt-10"
    >
      {hasPrevious ? (
        <Link
          href={searchHref(query, page - 1)}
          prefetch={false}
          rel="prev"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          Previous
        </Link>
      ) : (
        <span className="px-4 py-2 text-sm text-gray-600">Previous</span>
      )}

      <span className="text-sm text-gray-400" aria-current="page">
        {page} / {totalPages}
      </span>

      {hasNext ? (
        <Link
          href={searchHref(query, page + 1)}
          prefetch={false}
          rel="next"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors"
        >
          Next
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className="px-4 py-2 text-sm text-gray-600">Next</span>
      )}
    </nav>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <SearchX className="w-10 h-10 text-gray-600" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold mb-3">Nothing found for “{query}”</h2>
      <p className="text-gray-400 max-w-md mx-auto">
        Check the spelling, try fewer words, or use the original title – TMDb
        indexes films under the language they were released in.
      </p>
      <BrowseLinks />
    </div>
  );
}

function EmptyQuery() {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold mb-3">Search</h1>
      <p className="text-gray-400 max-w-md mx-auto">
        Look up any film, series or person. Use the search box in the header, or
        press <kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-sm">/</kbd>{" "}
        from anywhere on the site.
      </p>
      <BrowseLinks />
    </div>
  );
}

function BrowseLinks() {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
      {[
        { href: "/movies", label: "Browse movies" },
        { href: "/tv-shows", label: "Browse TV shows" },
        { href: "/genres", label: "Browse genres" },
      ].map((link) => (
        <Link
          key={link.href}
          href={link.href}
          prefetch={false}
          className="px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold text-white transition-colors"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
