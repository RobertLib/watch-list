import { Metadata } from "next";
import { notFound } from "next/navigation";
import { tmdbApi } from "@/lib/tmdb";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { PaginatedGenreMovieSection } from "@/components/PaginatedGenreMovieSection";
import { discoverMoviesByGenre } from "../../../actions";
import { extractIdFromSlug } from "@/lib/utils";

interface GenreMoviesPageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function getGenreMoviesData(genreId: number) {
  try {
    const [genresResponse, moviesResponse] = await Promise.all([
      tmdbApi.getMovieGenres(),
      tmdbServerApi.discoverMoviesByGenre(genreId, 1),
    ]);

    const genre = genresResponse.genres.find((g) => g.id === genreId);

    return {
      genre,
      movies: moviesResponse.results,
      totalPages: moviesResponse.total_pages,
    };
  } catch (error) {
    console.error("Error fetching genre movies:", error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: GenreMoviesPageProps): Promise<Metadata> {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) {
    return {
      title: "Genre not found",
    };
  }

  const data = await getGenreMoviesData(id);

  if (!data || !data.genre) {
    return {
      title: "Genre not found",
    };
  }

  const { genre } = data;

  return {
    title: `${genre.name} Movies`,
    description: `Explore the best ${genre.name.toLowerCase()} movies on WatchList. Discover popular ${genre.name.toLowerCase()} films, new releases, and trending titles. Create your personalized watchlist.`,
    openGraph: {
      title: `${genre.name} Movies - WatchList`,
      description: `Explore the best ${genre.name.toLowerCase()} movies on WatchList. Discover popular ${genre.name.toLowerCase()} films, new releases, and trending titles. Create your personalized watchlist.`,
      type: "website",
      url: `https://www.watch-list.me/genres/movie/${slug}`,
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
      canonical: `https://www.watch-list.me/genres/movie/${slug}`,
    },
  };
}

export default async function GenreMoviesPage({
  params,
}: GenreMoviesPageProps) {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) {
    notFound();
  }

  const data = await getGenreMoviesData(id);

  if (!data || !data.genre) {
    notFound();
  }

  const { genre, movies, totalPages } = data;

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
          </p>
        </div>

        {/* Movies Grid */}
        <PaginatedGenreMovieSection
          genreId={id}
          genreName={genre.name}
          fetchFunction={discoverMoviesByGenre}
          initialMovies={movies}
          initialTotalPages={totalPages}
        />
      </div>
    </div>
  );
}
