"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MediaSection } from "@/components/MediaSection";
import { WikipediaInsights } from "@/components/WikipediaInsights";
import {
  DiscoverFilterBar,
  DiscoverFilterBarSkeleton,
} from "@/components/DiscoverFilterBar";
import { LoadingSection } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { SnapshotRefreshNotice } from "@/components/SnapshotRefreshNotice";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import { genreHref } from "@/lib/routes";
import { genreSlug, genresFor } from "@/lib/genre-catalog";
import { getGenreWikipediaContent } from "@/lib/wikipedia";
import {
  STREAMING_LANDING_PLATFORMS,
  type StreamingPlatform,
} from "@/lib/streaming-landing";
import {
  MAX_GENRE_PAGE,
  MAX_PLATFORM_PAGE,
  loadGenreListing,
  type GenreListingPage,
} from "@/lib/genre-listing-data";
import {
  buildDiscoverFilterQuery,
  hasActiveDiscoverFilters,
  parseDiscoverFilters,
  type DiscoverFilters,
} from "@/lib/discover-filters";
import type { Genre, MediaType } from "@/types/tmdb";

interface GenreListingProps {
  mediaType: MediaType;
  /** Resolved by the page from `genre-catalog.ts`; the path names it. */
  genre: Genre;
  /** Set on a platform landing – `/genres/movie/action-28/netflix`. */
  platform?: StreamingPlatform;
  /**
   * Page one of the unfiltered listing, loaded at build time – or `null` for a
   * build without TMDB access, where the page falls back to a skeleton.
   */
  snapshot: GenreListingPage | null;
}

const EMPTY_HINT = "Showing the most popular titles in this genre.";

/**
 * A genre listing, optionally narrowed to one streaming platform.
 *
 * One component where there were four pages: films and series had near-identical
 * copies, and each had a second copy again for the "genre on Netflix" landing.
 *
 * Two renders of the same frame. The page, the filters and the region are read
 * from the browser, and `useSearchParams` makes the prerender hand everything
 * under the nearest Suspense boundary to the client – so the boundary's fallback
 * is the prerendered page: the heading, the build's snapshot of page one, the
 * links between platforms. The live half takes over in the browser, starting
 * from that same snapshot so nothing on screen changes until the visitor's own
 * listing arrives.
 */
export function GenreListing(props: GenreListingProps) {
  return (
    <Suspense fallback={<PrerenderedGenreListing {...props} />}>
      <LiveGenreListing {...props} />
    </Suspense>
  );
}

function PrerenderedGenreListing({
  mediaType,
  genre,
  platform,
  snapshot,
}: GenreListingProps) {
  const filters = parseDiscoverFilters(
    new URLSearchParams(),
    mediaType,
    "with_genre",
  );

  return (
    <GenreListingFrame
      mediaType={mediaType}
      genre={genre}
      platform={platform}
      page={1}
      isFiltered={false}
      totalResults={snapshot?.totalResults}
      filterBar={
        platform ? null : <DiscoverFilterBarSkeleton emptyHint={EMPTY_HINT} />
      }
      results={
        snapshot ? (
          <GenreResults
            mediaType={mediaType}
            genre={genre}
            platform={platform}
            isFiltered={false}
            page={1}
            listing={snapshot}
            pageHref={(target) =>
              genrePageHref(mediaType, genre, platform, filters, target)
            }
          />
        ) : (
          <LoadingSection count={18} />
        )
      }
    />
  );
}

function LiveGenreListing({
  mediaType,
  genre,
  platform,
  snapshot,
}: GenreListingProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const settingsKey = useSettingsKey();

  const maxPage = platform ? MAX_PLATFORM_PAGE : MAX_GENRE_PAGE;
  const page = Math.max(
    1,
    Math.min(parseInt(searchParams.get("page") ?? "1", 10) || 1, maxPage),
  );

  const filters = parseDiscoverFilters(searchParams, mediaType, "with_genre");
  const isFiltered = hasActiveDiscoverFilters(filters);
  const filtersKey = JSON.stringify(filters);

  // The build's snapshot is page one of the unfiltered listing, so it can only
  // stand in for that view – and a platform landing ignores the filters.
  const showsSnapshotView = page === 1 && (platform !== undefined || !isFiltered);

  // Only the results reload when a filter changes. The heading, the filter bar
  // and the links around them stay exactly where they are: as one load, every
  // filter change reset the whole page to its skeleton, and the filter bar went
  // with it – the select being used was unmounted mid-interaction and focus fell
  // to <body>. Arrow keys on a closed <select> fire `change` per step in Chrome
  // on Windows and Linux and in Firefox, so a keyboard user could not even walk
  // through the options.
  const listingLoad = useAsyncData(
    () =>
      loadGenreListing({ mediaType, genreId: genre.id, page, platform, filters }),
    [mediaType, genre.id, page, platform?.slug, filtersKey, settingsKey],
    showsSnapshotView ? snapshot : null,
  );
  const listing = listingLoad.data;

  // Only on the first page, and only for the plain listing: the encyclopaedia
  // entry for a genre says nothing about page four or about one platform.
  const { data: wikiContent } = useAsyncData(
    async () =>
      page === 1 && !platform
        ? getGenreWikipediaContent(genre.name, mediaType)
        : null,
    [genre.id, page, platform?.slug, mediaType],
  );

  const pageHref = (target: number) =>
    genrePageHref(mediaType, genre, platform, filters, target);

  // A region/platform change can shrink the catalogue below the page in the
  // URL. Keep loading until the replacement URL loads an available page: an
  // out-of-range response says nothing about whether the catalogue is empty.
  const lastPage = listing ? Math.max(1, listing.totalPages) : page;
  const correctionHref =
    listing && page > lastPage ? pageHref(lastPage) : null;
  useEffect(() => {
    if (correctionHref) router.replace(correctionHref, { scroll: false });
  }, [correctionHref, router]);

  // Only the results wait on these. The heading, the filter bar and the links
  // around them stay exactly where they are.
  const resultsPending = listingLoad.isLoading || correctionHref !== null;
  const mediaNoun = mediaType === "movie" ? "movies" : "TV shows";

  let results: ReactNode;
  if (resultsPending) {
    results = <LoadingSection count={18} />;
  } else if (listingLoad.error || !listing) {
    // Compact, and in place of the results only: the filters above are still
    // there to change, and changing them is itself a retry.
    results = (
      <LoadFailureNotice
        title={`Could not load these ${mediaNoun}`}
        description="TMDB did not answer. It may be a connection problem, or the service may be busy."
        onRetry={listingLoad.reload}
        compact
      />
    );
  } else {
    results = (
      <>
        {listingLoad.refreshError != null && (
          // The build's page one stays up; the visitor's own listing – their
          // region and services – is what did not arrive.
          <SnapshotRefreshNotice
            className="mb-6"
            message={`Showing saved ${mediaNoun} – the listing for your region and services could not be loaded.`}
            onRetry={listingLoad.reload}
            isRetrying={listingLoad.isRetrying}
          />
        )}
        <GenreResults
          mediaType={mediaType}
          genre={genre}
          platform={platform}
          isFiltered={isFiltered}
          page={page}
          listing={listing}
          pageHref={pageHref}
        />
      </>
    );
  }

  return (
    <GenreListingFrame
      mediaType={mediaType}
      genre={genre}
      platform={platform}
      page={page}
      isFiltered={isFiltered}
      totalResults={listing?.totalResults}
      filterBar={
        platform ? null : (
          <DiscoverFilterBar
            type={mediaType}
            // Offered as the "combine with" options.
            genres={genresFor(mediaType).filter((g) => g.id !== genre.id)}
            genreParamKey="with_genre"
            genreLabel="Combine With"
            genreAllLabel="No Second Genre"
            totalResults={listing?.totalResults}
            resultsPending={resultsPending}
            emptyHint={EMPTY_HINT}
          />
        )
      }
      results={results}
      wikiContent={wikiContent}
    />
  );
}

/** A page of this listing, keeping the filters – or only the page, on a landing. */
function genrePageHref(
  mediaType: MediaType,
  genre: Genre,
  platform: StreamingPlatform | undefined,
  filters: DiscoverFilters,
  target: number,
): string {
  return platform
    ? genreHref(mediaType, genreSlug(genre), {
        provider: platform.slug,
        filterQuery: target > 1 ? `?page=${target}` : "",
      })
    : genreHref(mediaType, genreSlug(genre), {
        filterQuery: buildDiscoverFilterQuery(filters, target, "with_genre"),
      });
}

function GenreResults({
  mediaType,
  genre,
  platform,
  isFiltered,
  page,
  listing,
  pageHref,
}: {
  mediaType: MediaType;
  genre: Genre;
  platform?: StreamingPlatform;
  isFiltered: boolean;
  page: number;
  listing: GenreListingPage;
  pageHref: (target: number) => string;
}) {
  const genreLower = genre.name.toLowerCase();
  const mediaNoun = mediaType === "movie" ? "movies" : "TV shows";
  const { items, totalPages } = listing;

  return (
    <>
      <MediaSection
        title=""
        items={items}
        size="medium"
        showViewToggle
        emptyMessage={
          platform
            ? `No ${genreLower} ${mediaNoun} are streaming on ${platform.name} in your region right now.`
            : isFiltered
              ? `No ${genreLower} ${mediaNoun} match these filters. Try loosening them.`
              : `No ${genreLower} ${mediaNoun} found.`
        }
        className="mb-0"
      />

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-center gap-4 mt-12"
        >
          {page > 1 && (
            <Link
              href={pageHref(page - 1)}
              prefetch={false}
              className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
            >
              ← Previous
            </Link>
          )}
          <span className="text-gray-400 text-sm">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageHref(page + 1)}
              prefetch={false}
              className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
            >
              Next →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

function GenreListingFrame({
  mediaType,
  genre,
  platform,
  page,
  isFiltered,
  totalResults,
  filterBar,
  results,
  wikiContent,
}: {
  mediaType: MediaType;
  genre: Genre;
  platform?: StreamingPlatform;
  page: number;
  isFiltered: boolean;
  totalResults: number | undefined;
  filterBar: ReactNode;
  results: ReactNode;
  wikiContent?: Awaited<ReturnType<typeof getGenreWikipediaContent>> | null;
}) {
  const slug = genreSlug(genre);
  const noun = mediaType === "movie" ? "Movies" : "TV Shows";
  const genreLower = genre.name.toLowerCase();
  const mediaNoun = mediaType === "movie" ? "movies" : "TV shows";

  return (
    <div className="min-h-screen bg-black pt-20">
      <div className="container mx-auto px-6 lg:px-8 py-8">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-sm text-gray-400 mb-6"
        >
          <Link
            href="/genres"
            prefetch={false}
            className="hover:text-white transition-colors"
          >
            Genres
          </Link>
          <span className="text-gray-600">/</span>
          {platform ? (
            <>
              <Link
                href={genreHref(mediaType, slug)}
                prefetch={false}
                className="hover:text-white transition-colors"
              >
                {genre.name} {noun}
              </Link>
              <span className="text-gray-600">/</span>
              <span className="text-gray-300 font-medium" aria-current="page">
                {platform.name}
              </span>
            </>
          ) : (
            <span className="text-gray-300 font-medium" aria-current="page">
              {genre.name} {noun}
            </span>
          )}
        </nav>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            {genre.name} {noun}
            {platform && ` on ${platform.name}`}
          </h1>
          <p className="text-gray-400 text-lg">
            {platform
              ? totalResults === undefined
                ? `${genre.name} ${mediaNoun} streaming on ${platform.name}`
                : totalResults > 0
                  ? `${totalResults.toLocaleString("en-US")} ${genreLower} ${
                      totalResults === 1
                        ? mediaNoun.replace(/s$/, "")
                        : mediaNoun
                    } streaming on ${platform.name}, most popular first`
                  : `Nothing in ${genreLower} is streaming on ${platform.name} in your region right now`
              : isFiltered
                ? `Browse ${genreLower} ${mediaNoun} matching your filters`
                : `Discover popular ${genreLower} ${mediaNoun}`}
            {page > 1 && ` – page ${page}`}
          </p>
        </div>

        {filterBar}

        {results}

        {/* Sideways links between the genre and its per-platform views. */}
        <section className="mt-16">
          <h2 className="text-lg font-semibold text-white mb-3">
            {platform
              ? `${genre.name} ${mediaNoun} on other platforms`
              : `Where to stream ${genreLower} ${mediaNoun}`}
          </h2>
          <div className="flex flex-wrap gap-2">
            {STREAMING_LANDING_PLATFORMS.filter(
              (p) => p.slug !== platform?.slug,
            ).map((p) => (
              <Link
                key={p.slug}
                href={genreHref(mediaType, slug, { provider: p.slug })}
                prefetch={false}
                className="px-3 py-1.5 rounded-full bg-gray-800 text-gray-300 text-sm hover:bg-gray-700 hover:text-white transition-colors"
              >
                {platform ? p.name : `${genre.name} on ${p.name}`}
              </Link>
            ))}
          </div>
        </section>

        {wikiContent && (
          <div className="mt-20 max-w-3xl">
            <WikipediaInsights content={wikiContent} />
          </div>
        )}
      </div>
    </div>
  );
}
