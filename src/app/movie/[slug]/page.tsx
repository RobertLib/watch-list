import { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { tmdbApi } from "@/lib/tmdb";
import { GenreTags } from "@/components/GenreTags";
import { MovieCast } from "@/components/movie/MovieCast";
import { SimilarMovies } from "@/components/movie/SimilarMovies";
import { MovieWatchProviders } from "@/components/movie/MovieWatchProviders";
import { MovieDetails } from "@/components/movie/MovieDetails";
import { MovieTrailerButton } from "@/components/movie/MovieTrailerButton";
import { DetailPageWatchlistButton } from "@/components/DetailPageWatchlistButton";
import { LanguageSupport } from "@/components/LanguageSupport";
import { extractIdFromSlug } from "@/lib/utils";

function formatRuntime(minutes: number | null): string {
  if (!minutes) return "Unknown runtime";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

interface MoviePageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function getMovieBasicData(id: number) {
  try {
    const [details, credits, videos] = await Promise.all([
      tmdbApi.getMovieDetails(id, "watch/providers"),
      tmdbApi.getMovieCredits(id),
      tmdbApi.getMovieVideos(id),
    ]);

    return { details, credits, videos };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: MoviePageProps): Promise<Metadata> {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) {
    return {
      title: "Movie not found",
    };
  }

  const data = await getMovieBasicData(id);

  if (!data) {
    return {
      title: "Movie not found",
    };
  }

  const { details } = data;

  return {
    title: `${details.title} (${
      new Date(details.release_date).getFullYear() || "N/A"
    }) - WatchList`,
    description: details.overview || `Details about ${details.title}`,
    openGraph: {
      title: details.title,
      description: details.overview,
      images: details.backdrop_path
        ? [tmdbApi.getImageUrl(details.backdrop_path, "w1280")]
        : [],
    },
  };
}

export default async function MoviePage({ params }: MoviePageProps) {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) {
    notFound();
  }

  const data = await getMovieBasicData(id);

  if (!data) {
    notFound();
  }

  const { details, credits, videos } = data;

  const trailer = videos.results.find(
    (video: { type: string; site: string }) =>
      video.type === "Trailer" && video.site === "YouTube"
  );

  const director = credits.crew.find(
    (member: { job: string }) => member.job === "Director"
  );
  const writers = credits.crew.filter(
    (member: { job: string }) =>
      member.job === "Writer" ||
      member.job === "Screenplay" ||
      member.job === "Story"
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Hero Section with Backdrop */}
      <div className="relative">
        {details.backdrop_path && (
          <>
            <div className="absolute inset-0 z-0">
              <Image
                src={tmdbApi.getImageUrl(details.backdrop_path, "w1280")}
                alt={details.title}
                fill
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-black/60" />
            </div>
            <div className="relative z-10 container mx-auto px-4 py-8">
              <div className="grid md:grid-cols-3 gap-8 max-w-6xl">
                {/* Poster */}
                <div className="md:col-span-1">
                  <div className="relative aspect-[2/3] w-full max-w-sm mx-auto">
                    <Image
                      src={tmdbApi.getImageUrl(details.poster_path, "w500")}
                      alt={details.title}
                      fill
                      className="object-cover rounded-lg shadow-2xl"
                      priority
                    />
                  </div>
                </div>

                {/* Movie Info */}
                <div className="md:col-span-2 text-white">
                  <h1 className="text-4xl md:text-5xl font-bold mb-2">
                    {details.title}
                  </h1>
                  {details.tagline && (
                    <p className="text-xl text-gray-300 italic mb-4">
                      {details.tagline}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 mb-6">
                    <span className="text-lg">
                      {new Date(details.release_date).getFullYear() || "N/A"}
                    </span>
                    <span>•</span>
                    <span>{formatRuntime(details.runtime)}</span>
                    <span>•</span>
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-400">★</span>
                      <span>{details.vote_average.toFixed(1)}</span>
                      <span className="text-gray-300">
                        ({details.vote_count.toLocaleString()} ratings)
                      </span>
                    </div>
                  </div>

                  <GenreTags genres={details.genres} />

                  {details.overview && (
                    <div className="mt-6">
                      <h2 className="text-xl font-semibold mb-3">Overview</h2>
                      <p className="text-gray-200 leading-relaxed">
                        {details.overview}
                      </p>
                    </div>
                  )}

                  {/* Key Crew */}
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {director && (
                      <div>
                        <h3 className="font-semibold">Director</h3>
                        <p className="text-gray-300">{director.name}</p>
                      </div>
                    )}
                    {writers.length > 0 && (
                      <div>
                        <h3 className="font-semibold">Writers</h3>
                        <p className="text-gray-300">
                          {writers
                            .map((w: { name: string }) => w.name)
                            .join(", ")}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-5 mt-6">
                    <MovieTrailerButton movieId={id} trailer={trailer} />
                    <DetailPageWatchlistButton
                      id={id}
                      title={details.title}
                      posterPath={details.poster_path}
                      releaseDate={details.release_date}
                      voteAverage={details.vote_average}
                      mediaType="movie"
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <MovieCast movieId={id} />
            <SimilarMovies movieId={id} />
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <MovieWatchProviders
              movieId={id}
              watchProviders={details["watch/providers"]}
            />
            <LanguageSupport mediaId={id} mediaType="movie" />
            <MovieDetails movieId={id} />
          </div>
        </div>
      </div>
    </div>
  );
}
