import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import { cache } from "react";
import { tmdbApi } from "@/lib/tmdb";
import { GenreTags } from "@/components/GenreTags";
import { TVCast } from "@/components/tv/TVCast";
import { SimilarTVShows } from "@/components/tv/SimilarTVShows";
import { TVWatchProviders } from "@/components/tv/TVWatchProviders";
import { TVDetails } from "@/components/tv/TVDetails";
import { TVTrailerButton } from "@/components/tv/TVTrailerButton";
import { TVSeasons } from "@/components/tv/TVSeasons";
import { DetailPageWatchlistButton } from "@/components/DetailPageWatchlistButton";
import { LanguageSupport } from "@/components/LanguageSupport";
import { StructuredData } from "@/components/StructuredData";
import { TVPageTracker } from "@/components/TVPageTracker";
import { MediaDetailTracker } from "@/components/MediaDetailTracker";
import { MediaBreadcrumbs } from "@/components/Breadcrumbs";
import { MediaKeywords } from "@/components/MediaKeywords";
import { MediaFullCrew } from "@/components/MediaFullCrew";
import { MediaReviews } from "@/components/MediaReviews";
import { MediaDidYouKnow } from "@/components/MediaDidYouKnowServer";
import { buildTVFacts } from "@/lib/did-you-know";
import { MediaRatingPanel } from "@/components/MediaRatingPanel";
import { MediaGallery } from "@/components/MediaGallery";
import { MediaVideos } from "@/components/MediaVideos";
import { extractIdFromSlug, createSlug } from "@/lib/utils";
import { ShareButton } from "@/components/ShareButton";

// Using Node.js runtime due to Edge Function size limitations
// export const runtime = "edge";

// ISR – revalidate every month so Googlebot gets pre-rendered HTML
export const revalidate = 2592000;

function formatDescription(
  overview: string | null,
  title: string,
  details: {
    genres?: { name: string }[];
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
    parts.push(`Watch ${title} and discover more TV shows on WatchList.`);
  }

  const creators = credits?.crew?.filter((m) => m.job === "Creator");
  if (creators && creators.length > 0) {
    parts.push(`Created by ${creators.map((c) => c.name).join(", ")}.`);
  }

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

interface TVPageProps {
  params: Promise<{
    slug: string;
  }>;
}

// Cache the data fetching function to prevent duplicate API calls
// between generateMetadata and the page component
const getTVBasicData = cache(async (id: number) => {
  try {
    // Use append_to_response to get all data in a single API call
    const details = await tmdbApi.getTVShowDetails(
      id,
      "watch/providers,credits,videos,similar,translations,keywords,reviews,content_ratings,external_ids,images",
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

  const formattedDescription = formatDescription(
    details.overview,
    details.name,
    details,
    data.credits,
  );

  const ogImagePath = details.backdrop_path ?? details.poster_path;
  const ogImageUrl = ogImagePath
    ? `https://image.tmdb.org/t/p/${details.backdrop_path ? "w1280" : "w780"}${ogImagePath}`
    : null;

  return {
    title: `${details.name} (${
      new Date(details.first_air_date).getFullYear() || "N/A"
    })`,
    description: formattedDescription,
    openGraph: {
      title: `${details.name} (${
        new Date(details.first_air_date).getFullYear() || "N/A"
      })`,
      description: formattedDescription,
      type: "video.tv_show",
      url: `https://www.watch-list.me/tv/${createSlug(details.name, details.id)}`,
      siteName: "WatchList",
      images: ogImageUrl
        ? [
            {
              url: ogImageUrl,
              width: details.backdrop_path ? 1280 : 780,
              height: details.backdrop_path ? 720 : 1170,
              alt: `${details.name} - TV Show Details`,
              type: "image/jpeg",
            },
          ]
        : [],
    },
    alternates: {
      canonical: `https://www.watch-list.me/tv/${createSlug(details.name, details.id)}`,
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

  // Redirect to canonical slug if URL doesn't match
  const canonicalSlug = createSlug(data.details.name, id);
  if (slug !== canonicalSlug) {
    permanentRedirect(`/tv/${canonicalSlug}`);
  }

  const { details, credits, videos, similar, translations } = data;

  const trailer = videos.results.find(
    (video: { type: string; site: string }) =>
      video.type === "Trailer" && video.site === "YouTube",
  );

  const creators = details.created_by ?? [];

  // Extract US content rating, fall back to first available
  const certificationUS = details.content_ratings?.results?.find(
    (r) => r.iso_3166_1 === "US",
  )?.rating;
  const certificationFallback = details.content_ratings?.results?.[0]?.rating;
  const certification = certificationUS || certificationFallback;

  function formatRuntime(minutes: number[]): string {
    if (!minutes || minutes.length === 0) return "Unknown runtime";
    const avgMinutes =
      minutes.reduce((sum, time) => sum + time, 0) / minutes.length;
    const hours = Math.floor(avgMinutes / 60);
    const mins = Math.round(avgMinutes % 60);
    return hours > 0 ? `~${hours}h ${mins}m` : `~${mins}m`;
  }

  // Build breadcrumb items
  const breadcrumbItems = [
    { name: "Home", url: "https://www.watch-list.me" },
    { name: "TV Shows", url: "https://www.watch-list.me/tv-shows" },
  ];

  if (details.genres && details.genres.length > 0) {
    const primaryGenre = details.genres[0];
    breadcrumbItems.push({
      name: primaryGenre.name,
      url: `https://www.watch-list.me/genres/tv/${createSlug(
        primaryGenre.name,
        primaryGenre.id,
      )}`,
    });
  }

  breadcrumbItems.push({
    name: details.name,
    url: `https://www.watch-list.me/tv/${slug}`,
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <StructuredData
        type="TVSeries"
        data={{
          url: `https://www.watch-list.me/tv/${slug}`,
          name: details.name,
          overview: details.overview,
          poster_path: details.poster_path || undefined,
          first_air_date: details.first_air_date,
          genres: details.genres,
          number_of_seasons: details.number_of_seasons,
          number_of_episodes: details.number_of_episodes,
          vote_average: details.vote_average,
          vote_count: details.vote_count,
          credits,
          production_companies: details.production_companies,
          production_countries: details.production_countries,
          keywords: details.keywords?.results?.map((k) => k.name),
        }}
      />
      <StructuredData type="BreadcrumbList" data={{ breadcrumbItems }} />

      {/* Hero Section with Backdrop */}
      <div className="relative">
        {details.backdrop_path && (
          <div className="absolute inset-0 z-0">
            <Image
              src={tmdbApi.getImageUrl(details.backdrop_path, "w1280")}
              alt={details.name}
              fill
              className="object-cover object-top"
              loading="eager"
              fetchPriority="high"
            />
            <div className="absolute inset-0 bg-black/60" />
          </div>
        )}
        <div className="relative z-10 container mx-auto px-4 py-8">
          {/* Breadcrumbs */}
          <MediaBreadcrumbs
            mediaType="tv"
            title={details.name}
            genres={details.genres}
          />
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mt-6">
            {/* Poster */}
            <div className="md:col-span-1">
              <div className="relative aspect-2/3 w-full max-w-sm mx-auto">
                <Image
                  src={tmdbApi.getImageUrl(details.poster_path, "w500")}
                  alt={details.name}
                  fill
                  className="object-cover rounded-lg shadow-2xl"
                  loading="eager"
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
                        {new Date(details.last_air_date).getFullYear() || "N/A"}
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
              {creators.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-semibold">Creators</h3>
                  <p className="text-gray-300">
                    {creators.map(
                      (c: { id: number; name: string }, i: number) => (
                        <span key={c.id}>
                          {i > 0 && ", "}
                          <a
                            href={`/person/${createSlug(c.name, c.id)}`}
                            className="hover:text-white transition-colors"
                          >
                            {c.name}
                          </a>
                        </span>
                      ),
                    )}
                  </p>
                </div>
              )}

              {/* Next episode to air */}
              {details.next_episode_to_air && (
                <div className="mt-4 bg-white/10 rounded-lg px-4 py-3 inline-block">
                  <p className="text-gray-300 text-sm font-semibold uppercase tracking-wider mb-1">
                    Next Episode
                  </p>
                  <p className="text-white font-medium">
                    S
                    {details.next_episode_to_air.season_number
                      .toString()
                      .padStart(2, "0")}
                    E
                    {details.next_episode_to_air.episode_number
                      .toString()
                      .padStart(2, "0")}
                    {details.next_episode_to_air.name
                      ? ` — ${details.next_episode_to_air.name}`
                      : ""}
                  </p>
                  <p className="text-gray-300 text-sm">
                    {new Date(
                      details.next_episode_to_air.air_date,
                    ).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3.5 mt-6">
                <TVTrailerButton
                  tvId={id}
                  trailer={trailer}
                  title={details.name}
                />
                <DetailPageWatchlistButton
                  id={id}
                  title={details.name}
                  posterPath={details.poster_path}
                  releaseDate={details.first_air_date}
                  voteAverage={details.vote_average}
                  mediaType="tv"
                />
                <ShareButton
                  title={details.name}
                  url={`https://www.watch-list.me/tv/${slug}`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <TVCast credits={credits} />
            <MediaFullCrew credits={credits} />
            <MediaKeywords keywords={details.keywords?.results ?? []} />
            <MediaVideos videos={videos.results} />
            <MediaReviews reviews={details.reviews} />
            <MediaDidYouKnow facts={buildTVFacts(details, credits)} />
            <MediaGallery
              backdrops={details.images?.backdrops ?? []}
              posters={details.images?.posters ?? []}
              title={details.name}
            />
            {details.seasons && details.seasons.length > 0 && (
              <TVSeasons seasons={details.seasons} tvId={id} />
            )}
            <SimilarTVShows similar={similar} />
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <MediaRatingPanel
              voteAverage={details.vote_average}
              voteCount={details.vote_count}
              reviews={details.reviews}
            />
            <TVWatchProviders tvId={id} title={details.name} />
            <LanguageSupport translations={translations} />
            <TVDetails details={details} certification={certification} />
          </div>
        </div>
      </div>

      <TVPageTracker tvId={id} slug={slug} />
      <MediaDetailTracker mediaId={id} mediaType="tv" title={details.name} />
    </div>
  );
}
