import { Metadata } from "next";
import { notFound } from "next/navigation";
import { tmdbApi } from "@/lib/tmdb";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { PaginatedGenreTVSection } from "@/components/PaginatedGenreTVSection";
import { discoverTVShowsByGenre } from "../../../actions";
import { extractIdFromSlug } from "@/lib/utils";

interface GenreTVShowsPageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function getGenreTVShowsData(genreId: number) {
  try {
    const [genresResponse, tvShowsResponse] = await Promise.all([
      tmdbApi.getTVGenres(),
      tmdbServerApi.discoverTVShowsByGenre(genreId, 1),
    ]);

    const genre = genresResponse.genres.find((g) => g.id === genreId);

    return {
      genre,
      tvShows: tvShowsResponse.results,
      totalPages: tvShowsResponse.total_pages,
    };
  } catch (error) {
    console.error("Error fetching genre TV shows:", error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: GenreTVShowsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) {
    return {
      title: "Genre not found",
    };
  }

  const data = await getGenreTVShowsData(id);

  if (!data || !data.genre) {
    return {
      title: "Genre not found",
    };
  }

  const { genre } = data;

  return {
    title: `${genre.name} TV Shows`,
    description: `Explore the best ${genre.name.toLowerCase()} TV shows on WatchList. Discover popular ${genre.name.toLowerCase()} series, new episodes, and trending shows. Create your personalized watchlist.`,
    openGraph: {
      title: `${genre.name} TV Shows - WatchList`,
      description: `Explore the best ${genre.name.toLowerCase()} TV shows on WatchList. Discover popular ${genre.name.toLowerCase()} series, new episodes, and trending shows. Create your personalized watchlist.`,
      type: "website",
      url: `https://www.watch-list.me/genres/tv/${slug}`,
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
      canonical: `https://www.watch-list.me/genres/tv/${slug}`,
    },
  };
}

export default async function GenreTVShowsPage({
  params,
}: GenreTVShowsPageProps) {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) {
    notFound();
  }

  const data = await getGenreTVShowsData(id);

  if (!data || !data.genre) {
    notFound();
  }

  const { genre, tvShows, totalPages } = data;

  return (
    <div className="min-h-screen bg-black pt-20">
      <div className="container mx-auto px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            {genre.name} TV Shows
          </h1>
          <p className="text-gray-400 text-lg">
            Discover popular {genre.name.toLowerCase()} TV shows
          </p>
        </div>

        {/* TV Shows Grid */}
        <PaginatedGenreTVSection
          genreId={id}
          genreName={genre.name}
          fetchFunction={discoverTVShowsByGenre}
          initialTVShows={tvShows}
          initialTotalPages={totalPages}
        />
      </div>
    </div>
  );
}
