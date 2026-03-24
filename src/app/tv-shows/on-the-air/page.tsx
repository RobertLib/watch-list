import { Suspense } from "react";
import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { PaginatedTVSection } from "@/components/PaginatedTVSection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { getOnTheAirTVShows } from "@/app/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TV Shows Currently on the Air",
  description:
    "Browse TV series currently airing new episodes. Find out which shows are on the air right now and add them to your watchlist to keep up with the latest episodes.",
  keywords: [
    "tv shows on the air",
    "currently airing series",
    "new episodes this week",
    "tv shows airing now",
    "ongoing tv series",
    "tv shows with new episodes",
    "what series to watch now",
    "current season tv shows",
  ],
  openGraph: {
    title: "TV Shows on the Air - WatchList",
    description:
      "Browse TV series currently airing new episodes. Find out which shows are on the air right now.",
    type: "website",
    url: "https://www.watch-list.me/tv-shows/on-the-air",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "TV Shows on the Air - WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TV Shows on the Air - WatchList",
    description:
      "Browse TV series currently airing new episodes. Find out which shows are on the air right now.",
  },
  alternates: {
    canonical: "https://www.watch-list.me/tv-shows/on-the-air",
  },
};

async function OnTheAirTVData() {
  const data = await tmdbServerApi.getOnTheAirTVShows(1);

  return (
    <PaginatedTVSection
      title="TV Shows on the Air"
      fetchFunction={getOnTheAirTVShows}
      initialTVShows={data.results}
      initialTotalPages={data.total_pages}
    />
  );
}

export default function OnTheAirTVShowsPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="On the Air"
        description="TV series currently airing new episodes"
        mediaType="tv"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <Suspense
          fallback={
            <LoadingSection title="TV Shows on the Air" rows={2} cols={6} />
          }
        >
          <OnTheAirTVData />
        </Suspense>
      </div>
    </div>
  );
}
