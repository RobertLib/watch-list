import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import { cache } from "react";
import { tmdbApi } from "@/lib/tmdb";
import { GenreTags } from "@/components/GenreTags";
import { MovieCast } from "@/components/movie/MovieCast";
import { SimilarMovies } from "@/components/movie/SimilarMovies";
import { MovieWatchProviders } from "@/components/movie/MovieWatchProviders";
import { MovieDetails } from "@/components/movie/MovieDetails";
import { MovieTrailerButton } from "@/components/movie/MovieTrailerButton";
import { DetailPageWatchlistButton } from "@/components/DetailPageWatchlistButton";
import { LanguageSupport } from "@/components/LanguageSupport";
import { StructuredData } from "@/components/StructuredData";
import { MoviePageTracker } from "@/components/MoviePageTracker";
import { MediaDetailTracker } from "@/components/MediaDetailTracker";
import { MediaBreadcrumbs } from "@/components/Breadcrumbs";
import { MediaKeywords } from "@/components/MediaKeywords";
import { MediaFullCrew } from "@/components/MediaFullCrew";
import { MediaReviews } from "@/components/MediaReviews";
import { extractIdFromSlug, createSlug } from "@/lib/utils";

// Using Node.js runtime due to Edge Function size limitations
// export const runtime = "edge";

// ISR – revalidate every 24 hours so Googlebot gets pre-rendered HTML
export const revalidate = 86400;

function formatRuntime(minutes: number | null): string {
  if (!minutes) return "Unknown runtime";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function formatDescription(
  overview: string | null,
  title: string,
  details: {
    genres?: { name: string }[];
    release_date?: string;
  },
  credits?: {
    crew?: { job: string; name: string }[];
    cast?: { name: string }[];
  },
): string {
  const parts: string[] = [];

  if (overview) {
    parts.push(overview);
  } else {
    parts.push(`Watch ${title} and discover more movies on WatchList.`);
  }

  const director = credits?.crew?.find((m) => m.job === "Director");
  if (director) parts.push(`Directed by ${director.name}.`);

  const topCast = credits?.cast
    ?.slice(0, 3)
    .map((m) => m.name)
    .join(", ");
  if (topCast) parts.push(`Starring ${topCast}.`);

  if (details.genres && details.genres.length > 0) {
    parts.push(`Genre: ${details.genres.map((g) => g.name).join(", ")}.`);
  }

  return parts.join(" ");
}

interface MoviePageProps {
  params: Promise<{
    slug: string;
  }>;
}

// Cache the data fetching function to prevent duplicate API calls
// between generateMetadata and the page component
const getMovieBasicData = cache(async (id: number) => {
  try {
    // Use append_to_response to get all data in a single API call
    const details = await tmdbApi.getMovieDetails(
      id,
      "watch/providers,credits,videos,similar,translations,keywords,reviews",
    );

    return {
      details,
      credits: details.credits || { cast: [], crew: [] },
      videos: details.videos || { results: [] },
      similar: details.similar || {
        page: 1,
        results: [],
        total_pages: 0,
        total_results: 0,
      },
      translations: details.translations || {
        id: details.id,
        translations: [],
      },
    };
  } catch {
    return null;
  }
});

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

  const formattedDescription = formatDescription(
    details.overview,
    details.title,
    details,
    data.credits,
  );

  return {
    title: `${details.title} (${
      new Date(details.release_date).getFullYear() || "N/A"
    })`,
    description: formattedDescription,
    openGraph: {
      title: `${details.title} (${
        new Date(details.release_date).getFullYear() || "N/A"
      })`,
      description: formattedDescription,
      type: "video.movie",
      url: `https://www.watch-list.me/movie/${createSlug(details.title, details.id)}`,
      siteName: "WatchList",
      images: [
        {
          url: `https://www.watch-list.me/movie/${createSlug(details.title, details.id)}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `${details.title} - Movie Details`,
          type: "image/png",
        },
      ],
    },
    alternates: {
      canonical: `https://www.watch-list.me/movie/${createSlug(details.title, details.id)}`,
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

  // Redirect to canonical slug if URL doesn't match
  const canonicalSlug = createSlug(data.details.title, id);
  if (slug !== canonicalSlug) {
    permanentRedirect(`/movie/${canonicalSlug}`);
  }

  const { details, credits, videos, similar, translations } = data;

  const trailer = videos.results.find(
    (video: { type: string; site: string }) =>
      video.type === "Trailer" && video.site === "YouTube",
  );

  const director = credits.crew.find(
    (member: { job: string }) => member.job === "Director",
  );
  const writers = credits.crew.filter(
    (member: { job: string }) =>
      member.job === "Writer" ||
      member.job === "Screenplay" ||
      member.job === "Story",
  );

  // Build breadcrumb items
  const breadcrumbItems = [
    { name: "Home", url: "https://www.watch-list.me" },
    { name: "Movies", url: "https://www.watch-list.me/movies" },
  ];

  if (details.genres && details.genres.length > 0) {
    const primaryGenre = details.genres[0];
    breadcrumbItems.push({
      name: primaryGenre.name,
      url: `https://www.watch-list.me/genres/movie/${createSlug(
        primaryGenre.name,
        primaryGenre.id,
      )}`,
    });
  }

  breadcrumbItems.push({
    name: details.title,
    url: `https://www.watch-list.me/movie/${slug}`,
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <StructuredData
        type="Movie"
        data={{
          url: `https://www.watch-list.me/movie/${slug}`,
          title: details.title,
          overview: details.overview,
          poster_path: details.poster_path || undefined,
          release_date: details.release_date,
          genres: details.genres,
          runtime: details.runtime || undefined,
          vote_average: details.vote_average,
          vote_count: details.vote_count,
          credits,
          production_companies: details.production_companies,
          production_countries: details.production_countries,
          keywords: details.keywords?.keywords?.map((k) => k.name),
        }}
      />
      <StructuredData type="BreadcrumbList" data={{ breadcrumbItems }} />

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
                loading="eager"
                fetchPriority="high"
              />
              <div className="absolute inset-0 bg-black/60" />
            </div>
            <div className="relative z-10 container mx-auto px-4 py-8">
              {/* Breadcrumbs */}
              <MediaBreadcrumbs
                mediaType="movie"
                title={details.title}
                genres={details.genres}
              />
              <div className="grid md:grid-cols-3 gap-8 max-w-6xl mt-6">
                {/* Poster */}
                <div className="md:col-span-1">
                  <div className="relative aspect-2/3 w-full max-w-sm mx-auto">
                    <Image
                      src={tmdbApi.getImageUrl(details.poster_path, "w500")}
                      alt={details.title}
                      fill
                      className="object-cover rounded-lg shadow-2xl"
                      loading="eager"
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
                      <span>{details.vote_average?.toFixed(1)}</span>
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
                    <MovieTrailerButton
                      movieId={id}
                      trailer={trailer}
                      title={details.title}
                    />
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
            <MovieCast credits={credits} />
            <MediaFullCrew credits={credits} />
            <MediaKeywords keywords={details.keywords?.keywords ?? []} />
            <MediaReviews reviews={details.reviews} />
            <SimilarMovies similar={similar} />
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <MovieWatchProviders movieId={id} title={details.title} />
            <LanguageSupport translations={translations} />
            <MovieDetails details={details} />
          </div>
        </div>
      </div>

      <MoviePageTracker movieId={id} slug={slug} />
      <MediaDetailTracker
        mediaId={id}
        mediaType="movie"
        title={details.title}
      />
    </div>
  );
}
