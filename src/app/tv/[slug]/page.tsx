import { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { cache } from "react";
import { tmdbApi } from "@/lib/tmdb";
import { GenreTags } from "@/components/GenreTags";
import { TVCast } from "@/components/tv/TVCast";
import { SimilarTVShows } from "@/components/tv/SimilarTVShows";
import { TVWatchProviders } from "@/components/tv/TVWatchProviders";
import { TVDetails } from "@/components/tv/TVDetails";
import { TVTrailerButton } from "@/components/tv/TVTrailerButton";
import { DetailPageWatchlistButton } from "@/components/DetailPageWatchlistButton";
import { LanguageSupport } from "@/components/LanguageSupport";
import { StructuredData } from "@/components/StructuredData";
import { TVPageTracker } from "@/components/TVPageTracker";
import { MediaDetailTracker } from "@/components/MediaDetailTracker";
import { MediaBreadcrumbs } from "@/components/Breadcrumbs";
import { extractIdFromSlug, createSlug } from "@/lib/utils";

// Using Node.js runtime due to Edge Function size limitations
// export const runtime = "edge";

// Enable static rendering with ISR
export const dynamic = "force-static";
// dynamicParams = true → unknown slugs are generated on-demand via ISR
export const dynamicParams = true;

// Enable ISR with revalidation every 30 days
export const revalidate = 2592000;

// Generate static params for all TV shows visible in the app (homepage + /tv-shows).
// dynamicParams=false means any slug NOT listed here returns 404 immediately –
// no ISR write is triggered, eliminating wasted Vercel cache writes from bot crawls.
export async function generateStaticParams() {
  try {
    // Fetch the same categories as the sitemap: trending, popular, top_rated, airing_today
    const [trending, popular, topRated, airingToday] = await Promise.all([
      fetch("https://api.themoviedb.org/3/trending/tv/week", {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` },
      }).then((res) => res.json()),
      fetch("https://api.themoviedb.org/3/tv/popular", {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` },
      }).then((res) => res.json()),
      fetch("https://api.themoviedb.org/3/tv/top_rated", {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` },
      }).then((res) => res.json()),
      fetch("https://api.themoviedb.org/3/tv/airing_today", {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_TOKEN}` },
      }).then((res) => res.json()),
    ]);

    const allShows = [
      ...(trending.results || []),
      ...(popular.results || []),
      ...(topRated.results || []),
      ...(airingToday.results || []),
    ];

    // Deduplicate by ID
    const unique = Array.from(
      new Map(
        allShows.map((s: { id: number; name: string }) => [s.id, s]),
      ).values(),
    ) as { id: number; name: string }[];

    return unique.map((show) => ({
      slug: createSlug(show.name, show.id),
    }));
  } catch (error) {
    console.error("Error generating static params:", error);
    return [];
  }
}

function formatDescription(overview: string | null, title: string): string {
  if (!overview)
    return `Watch ${title} and discover more TV shows on WatchList.`;

  // Return full overview - Google will truncate for display but indexes the full text
  return overview;
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
      "watch/providers,credits,videos,similar,translations",
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
  );

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
      url: `https://www.watch-list.me/tv/${slug}`,
      siteName: "WatchList",
      images: [
        {
          url: `https://www.watch-list.me/tv/${slug}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `${details.name} - TV Show Details`,
          type: "image/png",
        },
      ],
    },
    alternates: {
      canonical: `https://www.watch-list.me/tv/${slug}`,
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

  const { details, credits, videos, similar, translations } = data;

  const trailer = videos.results.find(
    (video: { type: string; site: string }) =>
      video.type === "Trailer" && video.site === "YouTube",
  );

  const creators = credits.crew.filter(
    (member: { job: string }) => member.job === "Creator",
  );

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
                alt={details.name}
                fill
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-black/60" />
            </div>
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
                        {creators
                          .map((c: { name: string }) => c.name)
                          .join(", ")}
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-5 mt-6">
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
            <TVCast credits={credits} />
            <SimilarTVShows similar={similar} />
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <TVWatchProviders tvId={id} title={details.name} />
            <LanguageSupport translations={translations} />
            <TVDetails details={details} />
          </div>
        </div>
      </div>

      <TVPageTracker tvId={id} slug={slug} />
      <MediaDetailTracker mediaId={id} mediaType="tv" title={details.name} />
    </div>
  );
}
