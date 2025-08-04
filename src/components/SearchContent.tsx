"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { MediaGrid } from "@/components/MediaGrid";
import { PersonGrid } from "@/components/PersonGrid";
import { LoadingSection } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useSettingsKey } from "@/hooks/useSettings";
import { tmdbApi } from "@/lib/tmdb";
import { sanitizePage } from "@/lib/discover-filters";

const MAX_QUERY_LENGTH = 200;

function readQuery(value: string | null): string {
  return (value ?? "").slice(0, MAX_QUERY_LENGTH).trim();
}

export function SearchContent() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchResults />
    </Suspense>
  );
}

function SearchSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 space-y-2">
        <div className="h-4 w-28 bg-gray-800 rounded animate-pulse" />
        <div className="h-9 w-64 bg-gray-700 rounded animate-pulse" />
      </div>
      <LoadingSection count={18} />
    </div>
  );
}

function SearchResults() {
  const searchParams = useSearchParams();
  const query = readQuery(searchParams.get("q"));
  const page = sanitizePage(Number(searchParams.get("page")) || 1);
  const settingsKey = useSettingsKey();

  useDocumentTitle(query ? `${query} – search` : "Search");

  const { data, isLoading, error, reload } = useAsyncData(
    async () => query ? tmdbApi.searchMultiWithPeople(query, page) : null,
    [query, page, settingsKey],
  );

  if (!query) return <EmptyQuery />;
  if (isLoading) return <SearchSkeleton />;

  const failed = Boolean(error);
  const items = data?.results ?? [];
  const persons = data?.people ?? [];
  const totalPages = Math.min(data?.total_pages ?? 1, 500);
  const totalResults = data?.total_results ?? 0;

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
        {!failed && (
          <p className="text-gray-400">
            {totalResults > 0
              ? `${totalResults.toLocaleString("en-US")} result${
                  totalResults === 1 ? "" : "s"
                }${totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}`
              : "No results matched."}
          </p>
        )}
      </div>

      {failed && (
        <LoadFailureNotice
          title="Could not load search results"
          description="TMDB did not answer. Check your connection and try again."
          onRetry={reload}
          compact
        />
      )}

      {!failed && !hasAnything && (
        totalResults > 0
          ? <NoResultsOnPage query={query} page={page} />
          : <NoResults query={query} />
      )}

      {items.length > 0 && (
        <section aria-labelledby="titles-heading">
          <h2 id="titles-heading" className="text-xl font-semibold text-white mb-4">
            Movies and TV shows
          </h2>
          <MediaGrid items={items} />
        </section>
      )}

      {persons.length > 0 && (
        <section aria-labelledby="people-heading" className={items.length > 0 ? "mt-14" : undefined}>
          <h2
            id="people-heading"
            className="text-xl font-semibold text-white mb-4"
          >
            People
          </h2>
          <PersonGrid people={persons} />
        </section>
      )}

      {totalPages > 1 && (
        <Pagination query={query} page={page} totalPages={totalPages} />
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

function NoResultsOnPage({ query, page }: { query: string; page: number }) {
  return (
    <div className="text-center py-16">
      <h2 className="text-2xl font-bold mb-3">No results on this page</h2>
      <p className="text-gray-400 max-w-md mx-auto">
        Try another results page or return to the first page.
      </p>
      {page > 1 && (
        <Link
          href={searchHref(query, 1)}
          prefetch={false}
          className="mt-6 inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
        >
          Back to the first page
        </Link>
      )}
    </div>
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
