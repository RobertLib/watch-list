import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { MediaSection } from "@/components/MediaSection";
import { extractIdFromSlug } from "@/lib/utils";
import { convertMovieToMediaItem } from "@/lib/media-converters";
import {
  MIN_RESULTS_TO_INDEX,
  STREAMING_LANDING_PLATFORMS,
  findStreamingPlatform,
  type StreamingPlatform,
} from "@/lib/streaming-landing";

export const revalidate = 86400;

const MAX_PAGE = 10; // Crawlable depth; deeper pages add nothing a searcher wants

interface GenreOnPlatformPageProps {
  params: Promise<{ slug: string; provider: string }>;
  searchParams: Promise<{ page?: string }>;
}

async function getMovieGenre(genreId: number) {
  try {
    const { genres } = await tmdbApi.getMovieGenres();
    return genres.find((g) => g.id === genreId) ?? null;
  } catch (error) {
    console.error("Error fetching movie genres:", error);
    return null;
  }
}

async function getListing(
  genreId: number,
  platform: StreamingPlatform,
  page: number,
) {
  try {
    return await tmdbServerApi.discoverMoviesByGenre(genreId, page, {
      watchProviders: String(platform.id),
      sortBy: "popularity.desc",
    });
  } catch (error) {
    console.error("Error fetching genre-on-platform movies:", error);
    return null;
  }
}

function parsePage(raw: string | undefined) {
  return Math.max(1, Math.min(parseInt(raw ?? "1", 10) || 1, MAX_PAGE));
}

export async function generateMetadata({
  params,
  searchParams,
}: GenreOnPlatformPageProps): Promise<Metadata> {
  const { slug, provider } = await params;
  const page = parsePage((await searchParams).page);
  const genreId = extractIdFromSlug(slug);
  const platform = findStreamingPlatform(provider);

  if (!genreId || !platform) {
    return { title: "Not found" };
  }

  const genre = await getMovieGenre(genreId);
  if (!genre) {
    return { title: "Not found" };
  }

  const listing = await getListing(genreId, platform, page);
  const totalResults = listing?.total_results ?? 0;
  const genreLower = genre.name.toLowerCase();

  const canonicalUrl =
    page === 1
      ? `https://www.watch-list.me/genres/movie/${slug}/${platform.slug}`
      : `https://www.watch-list.me/genres/movie/${slug}/${platform.slug}?page=${page}`;

  const title =
    page === 1
      ? `${genre.name} Movies on ${platform.name}`
      : `${genre.name} Movies on ${platform.name} – Page ${page}`;

  return {
    // A near-empty listing repeated across every genre is the doorway pattern, so
    // thin combinations stay out of the index while still working for visitors.
    ...(totalResults < MIN_RESULTS_TO_INDEX && {
      robots: { index: false, follow: true },
    }),
    title,
    description: `Every ${genreLower} movie streaming on ${platform.name} right now, ranked by popularity. Check what is available and add it to your watchlist.`,
    openGraph: {
      title: `${title} - WatchList`,
      description: `Every ${genreLower} movie streaming on ${platform.name} right now, ranked by popularity.`,
      type: "website",
      url: canonicalUrl,
      siteName: "WatchList",
      images: [
        {
          url: "/opengraph-image.png",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    alternates: { canonical: canonicalUrl },
  };
}

export default async function GenreOnPlatformPage({
  params,
  searchParams,
}: GenreOnPlatformPageProps) {
  const { slug, provider } = await params;
  const page = parsePage((await searchParams).page);
  const genreId = extractIdFromSlug(slug);
  const platform = findStreamingPlatform(provider);

  // Only the curated grid is a real landing page. notFound() keeps anything else
  // out of the index via the noindex tag it injects — it cannot set a 404 status,
  // because a parent loading.tsx has already committed the response to 200.
  if (!genreId || !platform) {
    notFound();
  }

  const genre = await getMovieGenre(genreId);
  if (!genre) {
    notFound();
  }

  const listing = await getListing(genreId, platform, page);
  if (!listing) {
    notFound();
  }

  const mediaItems = listing.results.map(convertMovieToMediaItem);
  const totalPages = Math.min(listing.total_pages, MAX_PAGE);
  const genreLower = genre.name.toLowerCase();
  const basePath = `/genres/movie/${slug}/${platform.slug}`;
  const otherPlatforms = STREAMING_LANDING_PLATFORMS.filter(
    (p) => p.slug !== platform.slug,
  );

  return (
    <div className="min-h-screen bg-black pt-20">
      <div className="container mx-auto px-6 lg:px-8 py-8">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-sm text-gray-400 mb-6"
        >
          <Link href="/genres" className="hover:text-white transition-colors">
            Genres
          </Link>
          <span className="text-gray-600">/</span>
          <Link
            href={`/genres/movie/${slug}`}
            className="hover:text-white transition-colors"
          >
            {genre.name} Movies
          </Link>
          <span className="text-gray-600">/</span>
          <span className="text-gray-300 font-medium" aria-current="page">
            {platform.name}
          </span>
        </nav>

        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            {genre.name} Movies on {platform.name}
          </h1>
          <p className="text-gray-400 text-lg">
            {listing.total_results > 0
              ? `${listing.total_results.toLocaleString()} ${genreLower} ${
                  listing.total_results === 1 ? "movie" : "movies"
                } streaming on ${platform.name}, most popular first`
              : `Nothing in ${genreLower} is streaming on ${platform.name} in your region right now`}
            {page > 1 && ` – page ${page}`}
          </p>
        </div>

        <MediaSection
          title=""
          items={mediaItems}
          size="medium"
          showViewToggle
          emptyMessage={`No ${genreLower} movies are streaming on ${platform.name} in your region right now.`}
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
                href={page - 1 === 1 ? basePath : `${basePath}?page=${page - 1}`}
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
                href={`${basePath}?page=${page + 1}`}
                className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
              >
                Next →
              </Link>
            )}
          </nav>
        )}

        {/* Sideways links keep every landing reachable from its siblings */}
        <section className="mt-16">
          <h2 className="text-lg font-semibold text-white mb-3">
            {genre.name} movies on other platforms
          </h2>
          <div className="flex flex-wrap gap-2">
            {otherPlatforms.map((p) => (
              <Link
                key={p.slug}
                href={`/genres/movie/${slug}/${p.slug}`}
                className="px-3 py-1.5 rounded-full bg-gray-800 text-gray-300 text-sm hover:bg-gray-700 hover:text-white transition-colors"
              >
                {p.name}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
