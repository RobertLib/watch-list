"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MediaSection } from "@/components/MediaSection";
import { WikipediaInsights } from "@/components/WikipediaInsights";
import { DiscoverFilterBar } from "@/components/DiscoverFilterBar";
import { LoadingSection } from "@/components/LoadingSpinner";
import { NotFoundNotice } from "@/components/NotFoundNotice";
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

  const { data, isLoading } = useAsyncData(async () => {
    if (!genreId) return null;

    const [genres, listing] = await Promise.all([
      mediaType === "movie"
        ? tmdbApi.getMovieGenres().then((response) => response.genres)
        : tmdbApi.getTVGenres().then((response) => response.genres),
      // A platform landing is the plain listing with one filter pinned, so the
      // filter bar's own choices are deliberately not merged in: the page is
      // about that platform.
      platform
        ? discoverByGenre(mediaType, genreId, page, {
            watchProviders: String(platform.id),
            sortBy: "popularity.desc",
          })
        : discoverByGenre(
            mediaType,
            genreId,
            page,
            discoverFiltersToFilterOptions(filters, mediaType),
          ),
    ]);

    const genre = genres.find((g) => g.id === genreId);
    if (!genre) return null;

    return {
      genre,
      // Offered as the "combine with" options in the filter bar
      otherGenres: genres.filter((g) => g.id !== genreId),
      items: listing.results.map((item) =>
        mediaType === "movie"
          ? convertMovieToMediaItem(item as never)
          : convertTVShowToMediaItem(item as never),
      ),
      totalPages: Math.min(listing.total_pages, maxPage),
      totalResults: listing.total_results,
    };
  }, [mediaType, genreId, page, platform?.slug, filtersKey, settingsKey]);

  const noun = mediaType === "movie" ? "Movies" : "TV Shows";

  useDocumentTitle(
    data
      ? platform
        ? `${data.genre.name} ${noun} on ${platform.name}`
        : `${data.genre.name} ${noun}`
      : null,
  );

  // Only on the first page, and only for the plain listing: the encyclopaedia
  // entry for a genre says nothing about page four or about one platform.
  const { data: wikiContent } = useAsyncData(
    async () =>
      data && page === 1 && !platform
        ? getGenreWikipediaContent(data.genre.name, mediaType)
        : null,
    [data?.genre.id, page, platform?.slug, mediaType],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black pt-20">
        <div className="container mx-auto px-6 lg:px-8 py-8">
          <LoadingSection title="" rows={3} cols={6} />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <NotFoundNotice
        title="Genre not found"
        description="That genre does not exist, or the link is incomplete."
        backHref="/genres"
        backLabel="Browse genres"
      />
    );
  }

  const { genre, otherGenres, items, totalPages, totalResults } = data;
  const genreLower = genre.name.toLowerCase();
  const mediaNoun = mediaType === "movie" ? "movies" : "TV shows";

  const pageHref = (target: number) =>
    platform
      ? genreHref(mediaType, genreSlug, {
          provider: platform.slug,
          filterQuery: target > 1 ? `?page=${target}` : "",
        })
      : genreHref(mediaType, genreSlug, {
          filterQuery: buildDiscoverFilterQuery(filters, target, "with_genre"),
        });

  return (
    <div className="min-h-screen bg-black pt-20">
      <div className="container mx-auto px-6 lg:px-8 py-8">
        {platform && (
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-sm text-gray-400 mb-6"
          >
            <Link href="/genres" className="hover:text-white transition-colors">
              Genres
            </Link>
            <span className="text-gray-600">/</span>
            <Link
              href={genreHref(mediaType, genreSlug)}
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
              ? totalResults > 0
                ? `${totalResults.toLocaleString()} ${genreLower} ${
                    totalResults === 1 ? mediaNoun.replace(/s$/, "") : mediaNoun
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
            emptyHint="Showing the most popular titles in this genre."
            keepParams={{ genre: genreSlug }}
          />
        )}

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
                className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
              >
                Next →
              </Link>
            )}
          </nav>
        )}

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
