"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import Link from "@/i18n/Link";
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
import {
  genrePhrase,
  genreSlug,
  genreTitle,
  genresFor,
} from "@/lib/genre-catalog";
import { getGenreWikipediaContent } from "@/lib/wikipedia";
import {
  STREAMING_LANDING_PLATFORMS,
  onPlatform,
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
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { formatCount, formatNumber } from "@/i18n/format";

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

function useEmptyHint(): string {
  const t = useT();
  return t(
    "Showing the most popular titles in this genre.",
    "Zobrazujeme nejpopulárnější tituly tohoto žánru.",
  );
}

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
  const emptyHint = useEmptyHint();

  return (
    <GenreListingFrame
      mediaType={mediaType}
      genre={genre}
      platform={platform}
      page={1}
      isFiltered={false}
      totalResults={snapshot?.totalResults}
      filterBar={
        platform ? null : <DiscoverFilterBarSkeleton emptyHint={emptyHint} />
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
  const t = useT();
  const emptyHint = useEmptyHint();

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
  const mediaNounCs = mediaType === "movie" ? "filmy" : "seriály";

  let results: ReactNode;
  if (resultsPending) {
    results = <LoadingSection count={18} />;
  } else if (listingLoad.error || !listing) {
    // Compact, and in place of the results only: the filters above are still
    // there to change, and changing them is itself a retry.
    results = (
      <LoadFailureNotice
        title={t(
          `Could not load these ${mediaNoun}`,
          `Tyto ${mediaNounCs} se nepodařilo načíst`,
        )}
        description={t(
          "TMDB did not answer. It may be a connection problem, or the service may be busy.",
          "TMDB neodpovídá. Může jít o potíže s připojením, nebo je služba právě přetížená.",
        )}
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
            message={t(
              `Showing saved ${mediaNoun} – the listing for your region and services could not be loaded.`,
              `Zobrazujeme uložené ${mediaNounCs} – výběr pro váš region a služby se nepodařilo načíst.`,
            )}
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
            genreLabel={t("Combine With", "Zkombinovat s")}
            genreAllLabel={t("No Second Genre", "Bez druhého žánru")}
            totalResults={listing?.totalResults}
            resultsPending={resultsPending}
            emptyHint={emptyHint}
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
  const t = useT();
  const locale = useLocale();
  const genreLower = genre.name.toLowerCase();
  const mediaNoun = mediaType === "movie" ? "movies" : "TV shows";
  const title = genreTitle(genre, mediaType, locale);
  const { items, totalPages } = listing;

  return (
    <>
      <MediaSection
        title=""
        items={items}
        size="medium"
        showViewToggle
        // Czech sentences are built around the genre's title ("Akční filmy")
        // or none at all, because a count or a "no" before the phrase would
        // have to decline it – "žádné filmy" but "žádná filmová dramata".
        emptyMessage={
          platform
            ? t(
                `No ${genreLower} ${mediaNoun} are streaming on ${platform.name} in your region right now.`,
                `${title} teď ve vašem regionu ${onPlatform(platform, locale)} nenajdete.`,
              )
            : isFiltered
              ? t(
                  `No ${genreLower} ${mediaNoun} match these filters. Try loosening them.`,
                  "Těmto filtrům neodpovídá žádný titul. Zkuste je uvolnit.",
                )
              : t(
                  `No ${genreLower} ${mediaNoun} found.`,
                  "V tomto žánru jsme nic nenašli.",
                )
        }
        className="mb-0"
      />

      {totalPages > 1 && (
        <nav
          aria-label={t("Pagination", "Stránkování")}
          className="flex items-center justify-center gap-4 mt-12"
        >
          {page > 1 && (
            <Link
              href={pageHref(page - 1)}
              prefetch={false}
              className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
            >
              {t("← Previous", "← Předchozí")}
            </Link>
          )}
          <span className="text-gray-400 text-sm">
            {locale === "cs" ? (
              <>
                Stránka {page} z {totalPages}
              </>
            ) : (
              <>
                Page {page} of {totalPages}
              </>
            )}
          </span>
          {page < totalPages && (
            <Link
              href={pageHref(page + 1)}
              prefetch={false}
              className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
            >
              {t("Next →", "Další →")}
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
  const t = useT();
  const locale = useLocale();
  const slug = genreSlug(genre);
  // "Action Movies", "Akční filmy" – Czech agrees the adjective with the noun,
  // so the pair is one phrase from the catalogue rather than two words joined.
  const title = genreTitle(genre, mediaType, locale);
  const phrase = genrePhrase(genre, mediaType, locale);
  const genreLower = genre.name.toLowerCase();
  const mediaNoun = mediaType === "movie" ? "movies" : "TV shows";

  return (
    <div className="min-h-screen bg-black pt-20">
      <div className="container mx-auto px-6 lg:px-8 py-8">
        <nav
          aria-label={t("Breadcrumb", "Drobečková navigace")}
          className="flex flex-wrap items-center gap-2 text-sm text-gray-400 mb-6"
        >
          <Link
            href="/genres"
            prefetch={false}
            className="hover:text-white transition-colors"
          >
            {t("Genres", "Žánry")}
          </Link>
          <span className="text-gray-600">/</span>
          {platform ? (
            <>
              <Link
                href={genreHref(mediaType, slug)}
                prefetch={false}
                className="hover:text-white transition-colors"
              >
                {title}
              </Link>
              <span className="text-gray-600">/</span>
              <span className="text-gray-300 font-medium" aria-current="page">
                {platform.name}
              </span>
            </>
          ) : (
            <span className="text-gray-300 font-medium" aria-current="page">
              {title}
            </span>
          )}
        </nav>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            {title}
            {platform && ` ${onPlatform(platform, locale)}`}
          </h1>
          <p className="text-gray-400 text-lg">
            {platform
              ? totalResults === undefined
                ? t(
                    `${genre.name} ${mediaNoun} streaming on ${platform.name}`,
                    `${title} ke streamování ${onPlatform(platform, locale)}`,
                  )
                : totalResults > 0
                  ? t(
                      `${formatNumber(totalResults, locale)} ${genreLower} ${
                        totalResults === 1
                          ? mediaNoun.replace(/s$/, "")
                          : mediaNoun
                      } streaming on ${platform.name}, most popular first`,
                      `${title} ${onPlatform(platform, locale)}: ${formatCount(
                        totalResults,
                        locale,
                        {
                          en: ["title", "titles"],
                          cs: ["titul", "tituly", "titulů"],
                        },
                      )}, od nejpopulárnějších`,
                    )
                  : t(
                      `Nothing in ${genreLower} is streaming on ${platform.name} in your region right now`,
                      `${title} teď ve vašem regionu ${onPlatform(platform, locale)} nenajdete`,
                    )
              : isFiltered
                ? t(
                    `Browse ${genreLower} ${mediaNoun} matching your filters`,
                    `${title} odpovídající vašim filtrům`,
                  )
                : t(
                    `Discover popular ${genreLower} ${mediaNoun}`,
                    `Objevte populární ${phrase}`,
                  )}
            {page > 1 && t(` – page ${page}`, ` – stránka ${page}`)}
          </p>
        </div>

        {filterBar}

        {results}

        {/* Sideways links between the genre and its per-platform views. */}
        <section className="mt-16">
          <h2 className="text-lg font-semibold text-white mb-3">
            {platform
              ? t(
                  `${genre.name} ${mediaNoun} on other platforms`,
                  `${title} v dalších službách`,
                )
              : t(
                  `Where to stream ${genreLower} ${mediaNoun}`,
                  `Kde streamovat ${phrase}`,
                )}
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
                {platform
                  ? p.name
                  : t(
                      `${genre.name} on ${p.name}`,
                      `${title} ${onPlatform(p, locale)}`,
                    )}
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
