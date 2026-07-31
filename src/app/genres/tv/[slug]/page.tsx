import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { MediaSection } from "@/components/MediaSection";
import { WikipediaInsights } from "@/components/WikipediaInsights";
import { DiscoverFilterBar } from "@/components/DiscoverFilterBar";
import { extractIdFromSlug } from "@/lib/utils";
import { getGenreWikipediaContent } from "@/lib/wikipedia";
import { STREAMING_LANDING_PLATFORMS } from "@/lib/streaming-landing";
import { convertTVShowToMediaItem } from "@/lib/media-converters";
import {
  buildDiscoverFilterQuery,
  discoverFiltersToFilterOptions,
  hasActiveDiscoverFilters,
  parseDiscoverFilters,
  type DiscoverFilters,
  type DiscoverSearchParams,
} from "@/lib/discover-filters";

export const revalidate = 86400;

const MAX_PAGE = 20; // Limit crawlable depth

interface GenreTVShowsPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<DiscoverSearchParams>;
}

async function getTVGenres() {
  try {
    return (await tmdbApi.getTVGenres()).genres;
  } catch (error) {
    console.error("Error fetching TV genres:", error);
    return null;
  }
}

async function getGenreTVShowsData(
  genreId: number,
  page: number,
  filters: DiscoverFilters,
) {
  try {
    const [genres, tvShowsResponse] = await Promise.all([
      tmdbApi.getTVGenres().then((response) => response.genres),
      tmdbServerApi.discoverTVShowsByGenre(
        genreId,
        page,
        discoverFiltersToFilterOptions(filters, "tv"),
      ),
    ]);

    const genre = genres.find((g) => g.id === genreId);

    return {
      genre,
      // Offered as the "combine with" options in the filter bar
      otherGenres: genres.filter((g) => g.id !== genreId),
      tvShows: tvShowsResponse.results,
      totalPages: Math.min(tvShowsResponse.total_pages, MAX_PAGE),
      totalResults: tvShowsResponse.total_results,
    };
  } catch (error) {
    console.error("Error fetching genre TV shows:", error);
    return null;
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: GenreTVShowsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const id = extractIdFromSlug(slug);
  const page = Math.max(
    1,
    Math.min(parseInt(resolvedSearchParams.page ?? "1", 10) || 1, MAX_PAGE),
  );
  const filters = parseDiscoverFilters(
    resolvedSearchParams,
    "tv",
    "with_genre",
  );
  const isFiltered = hasActiveDiscoverFilters(filters);

  if (!id) {
    return {
      title: "Genre not found",
    };
  }

  const genres = await getTVGenres();
  const genre = genres?.find((g) => g.id === id);

  if (!genre) {
    return {
      title: "Genre not found",
    };
  }

  // Filtered views are user-facing refinements of the same listing – they point
  // back at the unfiltered page and stay out of the index as duplicates.
  const canonicalUrl =
    page === 1
      ? `https://www.watch-list.me/genres/tv/${slug}`
      : `https://www.watch-list.me/genres/tv/${slug}?page=${page}`;

  return {
    ...(isFiltered && { robots: { index: false, follow: true } }),
    title:
      page === 1
        ? `${genre.name} TV Shows`
        : `${genre.name} TV Shows – Page ${page}`,
    description: `Explore the best ${genre.name.toLowerCase()} TV shows on WatchList. Discover popular ${genre.name.toLowerCase()} series, new episodes, and trending shows. Create your personalized watchlist.`,
    keywords: [
      `${genre.name.toLowerCase()} tv shows`,
      `best ${genre.name.toLowerCase()} series`,
      `popular ${genre.name.toLowerCase()} shows`,
      `${genre.name.toLowerCase()} series`,
      `watch ${genre.name.toLowerCase()} shows`,
      "tv show discovery",
      "WatchList",
    ],
    openGraph: {
      title: `${genre.name} TV Shows - WatchList`,
      description: `Explore the best ${genre.name.toLowerCase()} TV shows on WatchList. Discover popular ${genre.name.toLowerCase()} series, new episodes, and trending shows. Create your personalized watchlist.`,
      type: "website",
      url: canonicalUrl,
      siteName: "WatchList",
      images: [
        {
          url: "/opengraph-image.png",
          width: 1200,
          height: 630,
          alt: `${genre.name} TV Shows - WatchList`,
        },
      ],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function GenreTVShowsPage({
  params,
  searchParams,
}: GenreTVShowsPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const id = extractIdFromSlug(slug);
  const page = Math.max(
    1,
    Math.min(parseInt(resolvedSearchParams.page ?? "1", 10) || 1, MAX_PAGE),
  );
  const filters = parseDiscoverFilters(
    resolvedSearchParams,
    "tv",
    "with_genre",
  );
  const isFiltered = hasActiveDiscoverFilters(filters);

  if (!id) {
    notFound();
  }

  const data = await getGenreTVShowsData(id, page, filters);

  if (!data || !data.genre) {
    notFound();
  }

  const { genre, otherGenres, tvShows, totalPages, totalResults } = data;
  const mediaItems = tvShows.map(convertTVShowToMediaItem);

  const wikiContent =
    page === 1 ? await getGenreWikipediaContent(genre.name, "tv") : null;

  return (
    <div className="min-h-screen bg-black pt-20">
      <div className="container mx-auto px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            {genre.name} TV Shows
          </h1>
          <p className="text-gray-400 text-lg">
            {isFiltered
              ? `Browse ${genre.name.toLowerCase()} TV shows matching your filters`
              : `Discover popular ${genre.name.toLowerCase()} TV shows`}
            {page > 1 && ` – page ${page}`}
          </p>
        </div>

        <DiscoverFilterBar
          type="tv"
          genres={otherGenres}
          genreParamKey="with_genre"
          genreLabel="Combine With"
          genreAllLabel="No Second Genre"
          totalResults={totalResults}
          emptyHint="Showing the most popular titles in this genre."
        />

        {/* TV Shows Grid */}
        <MediaSection
          title=""
          items={mediaItems}
          size="medium"
          showViewToggle
          emptyMessage={
            isFiltered
              ? `No ${genre.name.toLowerCase()} TV shows match these filters. Try loosening them.`
              : `No ${genre.name.toLowerCase()} TV shows found.`
          }
          className="mb-0"
        />

        {/* URL-based pagination for crawler discoverability */}
        {totalPages > 1 && (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-center gap-4 mt-12"
          >
            {page > 1 && (
              <Link
                href={`/genres/tv/${slug}${buildDiscoverFilterQuery(
                  filters,
                  page - 1,
                  "with_genre",
                )}`}
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
                href={`/genres/tv/${slug}${buildDiscoverFilterQuery(
                  filters,
                  page + 1,
                  "with_genre",
                )}`}
                className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
              >
                Next →
              </Link>
            )}
          </nav>
        )}

        {/* Entry points into the curated genre x platform landings. Without these
            the landings would only be reachable from the sitemap. */}
        <section className="mt-16">
          <h2 className="text-lg font-semibold text-white mb-3">
            Where to stream {genre.name.toLowerCase()} series
          </h2>
          <div className="flex flex-wrap gap-2">
            {STREAMING_LANDING_PLATFORMS.map((platform) => (
              <Link
                key={platform.slug}
                href={`/genres/tv/${slug}/${platform.slug}`}
                className="px-3 py-1.5 rounded-full bg-gray-800 text-gray-300 text-sm hover:bg-gray-700 hover:text-white transition-colors"
              >
                {genre.name} on {platform.name}
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
