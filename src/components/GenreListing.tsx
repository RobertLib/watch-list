"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MediaSection } from "@/components/MediaSection";
import { WikipediaInsights } from "@/components/WikipediaInsights";
import { DiscoverFilterBar } from "@/components/DiscoverFilterBar";
import { LoadingSection } from "@/components/LoadingSpinner";
import { LoadFailureNotice } from "@/components/LoadFailureNotice";
import { NotFoundNotice, isNotFoundError } from "@/components/NotFoundNotice";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useSettingsKey } from "@/hooks/useSettings";
import { tmdbApi } from "@/lib/tmdb";
import { tmdbDiscoverApi } from "@/lib/tmdb-discover";
import { extractIdFromSlug } from "@/lib/utils";
import { genreHref } from "@/lib/routes";
import { getGenreWikipediaContent } from "@/lib/wikipedia";
import {
  STREAMING_LANDING_PLATFORMS,
  findStreamingPlatform,
  streamingPlatformProviderFilter,
} from "@/lib/streaming-landing";
import {
  convertMovieToMediaItem,
  convertTVShowToMediaItem,
} from "@/lib/media-converters";
import {
  buildDiscoverFilterQuery,
  discoverFiltersToFilterOptions,
  hasActiveDiscoverFilters,
  parseDiscoverFilters,
} from "@/lib/discover-filters";
import type { MediaType } from "@/types/tmdb";

/** How deep the pager goes. TMDB caps at 500; nothing useful lives that far in. */
const MAX_PAGE = 20;

/** The same, for a genre narrowed to one platform – a much smaller catalogue. */
const MAX_PLATFORM_PAGE = 10;

/**
 * A genre listing, optionally narrowed to one streaming platform.
 *
 * One component where there were four pages: films and series had near-identical
 * copies, and each had a second copy again for the "genre on Netflix" landing.
 * The genre and the platform are query parameters now rather than path segments,
 * which is what let those four collapse – the platform variant is this page with
 * `?provider=` set.
 */
export function GenreListing({ mediaType }: { mediaType: MediaType }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const settingsKey = useSettingsKey();

  const genreSlug = searchParams.get("genre") ?? "";
  const genreId = extractIdFromSlug(genreSlug);
  const platform = findStreamingPlatform(searchParams.get("provider") ?? "");

  const maxPage = platform ? MAX_PLATFORM_PAGE : MAX_PAGE;
  const page = Math.max(
    1,
    Math.min(parseInt(searchParams.get("page") ?? "1", 10) || 1, maxPage),
  );

  const filters = parseDiscoverFilters(searchParams, mediaType, "with_genre");
  const isFiltered = hasActiveDiscoverFilters(filters);
  const filtersKey = JSON.stringify(filters);

  // Two loads rather than one, because they change at different rates. The
  // genre – its name, and the others offered to combine with – is the page
  // itself; the listing is what the filter bar acts on. As one load, every
  // filter change reset the whole page to its skeleton, and the filter bar went
  // with it: the select or chip being used was unmounted mid-interaction and
  // focus fell to <body>. Arrow keys on a closed <select> fire `change` per
  // step in Chrome on Windows and Linux and in Firefox, so a keyboard user
  // could not even walk through the options. Now only the results reload.
  const genresLoad = useAsyncData(async () => {
    if (!genreId) return null;

    const response =
      mediaType === "movie"
        ? await tmdbApi.getMovieGenres()
        : await tmdbApi.getTVGenres();
    return response.genres;
  }, [mediaType, genreId, settingsKey]);

  const listingLoad = useAsyncData(async () => {
    if (!genreId) return null;

    // A platform landing is the plain listing with one filter pinned, so the
    // filter bar's own choices are deliberately not merged in: the page is
    // about that platform.
    const listing = platform
      ? await discoverByGenre(mediaType, genreId, page, {
          watchProviders: streamingPlatformProviderFilter(platform),
          sortBy: "popularity.desc",
        })
      : await discoverByGenre(
          mediaType,
          genreId,
          page,
          discoverFiltersToFilterOptions(filters, mediaType),
        );

    return {
      items: listing.results.map((item) =>
        mediaType === "movie"
          ? convertMovieToMediaItem(item as never)
          : convertTVShowToMediaItem(item as never),
      ),
      totalPages: Math.min(listing.total_pages, maxPage),
      totalResults: listing.total_results,
    };
  }, [mediaType, genreId, page, platform?.slug, filtersKey, settingsKey]);

  const genres = genresLoad.data;
  const genre = genres?.find((g) => g.id === genreId) ?? null;
  const listing = listingLoad.data;

  const noun = mediaType === "movie" ? "Movies" : "TV Shows";

  useDocumentTitle(
    genre
      ? platform
        ? `${genre.name} ${noun} on ${platform.name}`
        : `${genre.name} ${noun}`
      : null,
  );

  // Only on the first page, and only for the plain listing: the encyclopaedia
  // entry for a genre says nothing about page four or about one platform.
  const { data: wikiContent } = useAsyncData(
    async () =>
      genre && page === 1 && !platform
        ? getGenreWikipediaContent(genre.name, mediaType)
        : null,
    [genre?.id, page, platform?.slug, mediaType],
  );

  const pageHref = (target: number) =>
    platform
      ? genreHref(mediaType, genreSlug, {
          provider: platform.slug,
          filterQuery: target > 1 ? `?page=${target}` : "",
        })
      : genreHref(mediaType, genreSlug, {
          filterQuery: buildDiscoverFilterQuery(filters, target, "with_genre"),
        });

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

  // Until the genre is known there is no page to show: not even its title.
  if (genresLoad.isLoading) {
    return (
      <div className="min-h-screen bg-black pt-20">
        <div className="container mx-auto px-6 lg:px-8 py-8">
          <LoadingSection count={18} />
        </div>
      </div>
    );
  }

  // A miss and a failure are different pages. TMDB answering 404 means the
  // title is not there; TMDB not answering – a rate limit, a timeout, an
  // outage – means it may well be, and deserves a "try again" rather than a
  // "does not exist".
  if (genresLoad.error && !isNotFoundError(genresLoad.error)) {
    return (
      <LoadFailureNotice
        title="Could not load this genre"
        description="TMDB did not answer. It may be a connection problem, or the service may be busy."
        onRetry={() => {
          genresLoad.reload();
          // An outage usually took both; retry the listing only if it did.
          if (listingLoad.error) listingLoad.reload();
        }}
      />
    );
  }

  if (!genre) {
    return (
      <NotFoundNotice
        title="Genre not found"
        description="That genre does not exist, or the link is incomplete."
        backHref="/genres"
        backLabel="Browse genres"
      />
    );
  }

  const genreLower = genre.name.toLowerCase();
  const mediaNoun = mediaType === "movie" ? "movies" : "TV shows";
  // Offered as the "combine with" options in the filter bar
  const otherGenres = (genres ?? []).filter((g) => g.id !== genreId);

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
    const { items, totalPages } = listing;
    results = (
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

  const totalResults = listing?.totalResults;

  return (
    <div className="min-h-screen bg-black pt-20">
      <div className="container mx-auto px-6 lg:px-8 py-8">
        {platform && (
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
            <Link
              href={genreHref(mediaType, genreSlug)}
              prefetch={false}
              className="hover:text-white transition-colors"
            >
              {genre.name} {noun}
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-gray-300 font-medium" aria-current="page">
              {platform.name}
            </span>
          </nav>
        )}

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
                  ? `${totalResults.toLocaleString()} ${genreLower} ${
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

        {!platform && (
          <DiscoverFilterBar
            type={mediaType}
            genres={otherGenres}
            genreParamKey="with_genre"
            genreLabel="Combine With"
            genreAllLabel="No Second Genre"
            totalResults={totalResults}
            resultsPending={resultsPending}
            emptyHint="Showing the most popular titles in this genre."
            keepParams={{ genre: genreSlug }}
          />
        )}

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
                href={genreHref(mediaType, genreSlug, { provider: p.slug })}
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

function discoverByGenre(
  mediaType: MediaType,
  genreId: number,
  page: number,
  options: Parameters<typeof tmdbDiscoverApi.discoverMoviesByGenre>[2],
) {
  return mediaType === "movie"
    ? tmdbDiscoverApi.discoverMoviesByGenre(genreId, page, options)
    : tmdbDiscoverApi.discoverTVShowsByGenre(genreId, page, options);
}
