import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { tmdbApi } from "@/lib/tmdb";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { MediaSection } from "@/components/MediaSection";
import { WikipediaInsights } from "@/components/WikipediaInsights";
import { extractIdFromSlug } from "@/lib/utils";
import { getGenreWikipediaContent } from "@/lib/wikipedia";
import { convertMovieToMediaItem } from "@/lib/media-converters";

export const revalidate = 86400;

const MAX_PAGE = 20; // TMDB caps at 500 pages; limit crawlable depth

interface GenreMoviesPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    page?: string;
  }>;
}

async function getGenreMoviesData(genreId: number, page: number) {
  try {
    const [genresResponse, moviesResponse] = await Promise.all([
      tmdbApi.getMovieGenres(),
      tmdbServerApi.discoverMoviesByGenre(genreId, page),
    ]);

    const genre = genresResponse.genres.find((g) => g.id === genreId);

    return {
      genre,
      movies: moviesResponse.results,
      totalPages: Math.min(moviesResponse.total_pages, MAX_PAGE),
    };
  } catch (error) {
    console.error("Error fetching genre movies:", error);
    return null;
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: GenreMoviesPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const id = extractIdFromSlug(slug);
  const page = Math.max(
    1,
    Math.min(parseInt(pageParam ?? "1", 10) || 1, MAX_PAGE),
  );

  if (!id) {
    return {
      title: "Genre not found",
    };
  }

  const data = await getGenreMoviesData(id, page);

  if (!data || !data.genre) {
    return {
      title: "Genre not found",
    };
  }

  const { genre } = data;
  const canonicalUrl =
    page === 1
      ? `https://www.watch-list.me/genres/movie/${slug}`
      : `https://www.watch-list.me/genres/movie/${slug}?page=${page}`;

  return {
    title:
      page === 1
        ? `${genre.name} Movies`
        : `${genre.name} Movies – Page ${page}`,
    description: `Explore the best ${genre.name.toLowerCase()} movies on WatchList. Discover popular ${genre.name.toLowerCase()} films, new releases, and trending titles. Create your personalized watchlist.`,
    keywords: [
      `${genre.name.toLowerCase()} movies`,
      `best ${genre.name.toLowerCase()} films`,
      `popular ${genre.name.toLowerCase()} movies`,
      `${genre.name.toLowerCase()} films`,
      `watch ${genre.name.toLowerCase()} movies`,
      "movie discovery",
      "WatchList",
    ],
    openGraph: {
      title: `${genre.name} Movies - WatchList`,
      description: `Explore the best ${genre.name.toLowerCase()} movies on WatchList. Discover popular ${genre.name.toLowerCase()} films, new releases, and trending titles. Create your personalized watchlist.`,
      type: "website",
      url: canonicalUrl,
      siteName: "WatchList",
      images: [
        {
          url: "/opengraph-image.png",
          width: 1200,
          height: 630,
          alt: `${genre.name} Movies - WatchList`,
        },
      ],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function GenreMoviesPage({
  params,
  searchParams,
}: GenreMoviesPageProps) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const id = extractIdFromSlug(slug);
  const page = Math.max(
    1,
    Math.min(parseInt(pageParam ?? "1", 10) || 1, MAX_PAGE),
  );

  if (!id) {
    notFound();
  }

  const data = await getGenreMoviesData(id, page);

  if (!data || !data.genre) {
    notFound();
  }

  const { genre, movies, totalPages } = data;
  const mediaItems = movies.map(convertMovieToMediaItem);

  const wikiContent =
    page === 1 ? await getGenreWikipediaContent(genre.name, "movie") : null;

  return (
    <div className="min-h-screen bg-black pt-20">
      <div className="container mx-auto px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            {genre.name} Movies
          </h1>
          <p className="text-gray-400 text-lg">
            Discover popular {genre.name.toLowerCase()} movies
            {page > 1 && ` – page ${page}`}
          </p>
        </div>

        {/* Movies Grid */}
        <MediaSection
          title=""
          items={mediaItems}
          size="medium"
          emptyMessage={`No ${genre.name.toLowerCase()} movies found.`}
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
                href={
                  page === 2
                    ? `/genres/movie/${slug}`
                    : `/genres/movie/${slug}?page=${page - 1}`
                }
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
                href={`/genres/movie/${slug}?page=${page + 1}`}
                className="px-5 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
              >
                Next →
              </Link>
            )}
          </nav>
        )}

        {wikiContent && (
          <div className="mt-20 max-w-3xl">
            <WikipediaInsights content={wikiContent} />
          </div>
        )}
      </div>
    </div>
  );
}
