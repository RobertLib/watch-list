import { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { tmdbApi } from "@/lib/tmdb";
import { GenreTags } from "@/components/GenreTags";
import { TVCast } from "@/components/tv/TVCast";
import { SimilarTVShows } from "@/components/tv/SimilarTVShows";
import { TVWatchProviders } from "@/components/tv/TVWatchProviders";
import { TVDetails } from "@/components/tv/TVDetails";
import { TVTrailerButton } from "@/components/tv/TVTrailerButton";
import { DetailPageWatchlistButton } from "@/components/DetailPageWatchlistButton";
import { LanguageSupport } from "@/components/LanguageSupport";
import { extractIdFromSlug } from "@/lib/utils";

interface TVPageProps {
  params: Promise<{
    slug: string;
  }>;
}

async function getTVBasicData(id: number) {
  try {
    const [details, credits, videos] = await Promise.all([
      tmdbApi.getTVShowDetails(id, "watch/providers"),
      tmdbApi.getTVShowCredits(id),
      tmdbApi.getTVShowVideos(id),
    ]);

    return { details, credits, videos };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: TVPageProps): Promise<Metadata> {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) {
    return {
      title: "TV Show not found",
    };
  }

  const data = await getTVBasicData(id);

  if (!data) {
    return {
      title: "TV Show not found",
    };
  }

  const { details } = data;

  return {
    title: `${details.name} (${
      new Date(details.first_air_date).getFullYear() || "N/A"
    }) - WatchList`,
    description: details.overview || `Details about ${details.name}`,
    openGraph: {
      title: details.name,
      description: details.overview,
      images: details.backdrop_path
        ? [tmdbApi.getImageUrl(details.backdrop_path, "w1280")]
        : [],
    },
  };
}

export default async function TVPage({ params }: TVPageProps) {
  const { slug } = await params;
  const id = extractIdFromSlug(slug);

  if (!id) {
    notFound();
  }

  const data = await getTVBasicData(id);

  if (!data) {
    notFound();
  }

  const { details, credits, videos } = data;

  const trailer = videos.results.find(
    (video: { type: string; site: string }) =>
      video.type === "Trailer" && video.site === "YouTube"
  );

  const creators = credits.crew.filter(
    (member: { job: string }) => member.job === "Creator"
  );

  function formatRuntime(minutes: number[]): string {
    if (!minutes || minutes.length === 0) return "Unknown runtime";
    const avgMinutes =
      minutes.reduce((sum, time) => sum + time, 0) / minutes.length;
    const hours = Math.floor(avgMinutes / 60);
    const mins = Math.round(avgMinutes % 60);
    return hours > 0 ? `~${hours}h ${mins}m` : `~${mins}m`;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Hero Section with Backdrop */}
      <div className="relative">
        {details.backdrop_path && (
          <>
            <div className="absolute inset-0 z-0">
              <Image
                src={tmdbApi.getImageUrl(details.backdrop_path, "w1280")}
                alt={details.name}
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
                      alt={details.name}
                      fill
                      className="object-cover rounded-lg shadow-2xl"
                      priority
                    />
                  </div>
                </div>

                {/* TV Show Info */}
                <div className="md:col-span-2 text-white">
                  <h1 className="text-4xl md:text-5xl font-bold mb-2">
                    {details.name}
                  </h1>
                  {details.tagline && (
                    <p className="text-xl text-gray-300 italic mb-4">
                      {details.tagline}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 mb-6">
                    <span className="text-lg">
                      {new Date(details.first_air_date).getFullYear() || "N/A"}
                      {details.last_air_date &&
                        details.last_air_date !== details.first_air_date && (
                          <>
                            {" "}
                            -{" "}
                            {new Date(details.last_air_date).getFullYear() ||
                              "N/A"}
                          </>
                        )}
                    </span>
                    <span>•</span>
                    <span>
                      {details.number_of_seasons}{" "}
                      {details.number_of_seasons === 1 ? "season" : "seasons"}
                    </span>
                    <span>•</span>
                    <span>{details.number_of_episodes} episodes</span>
                    <span>•</span>
                    <span>{formatRuntime(details.episode_run_time)}</span>
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
                  {creators.length > 0 && (
                    <div className="mt-6">
                      <h3 className="font-semibold">Creators</h3>
                      <p className="text-gray-300">
                        {creators
                          .map((c: { name: string }) => c.name)
                          .join(", ")}
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-5 mt-6">
                    <TVTrailerButton tvId={id} trailer={trailer} />
                    <DetailPageWatchlistButton
                      id={id}
                      title={details.name}
                      posterPath={details.poster_path}
                      releaseDate={details.first_air_date}
                      voteAverage={details.vote_average}
                      mediaType="tv"
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
            <TVCast tvId={id} />
            <SimilarTVShows tvId={id} />
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <TVWatchProviders
              tvId={id}
              watchProviders={details["watch/providers"]}
            />
            <LanguageSupport mediaId={id} mediaType="tv" />
            <TVDetails tvId={id} />
          </div>
        </div>
      </div>
    </div>
  );
}
