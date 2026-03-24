import { Suspense } from "react";
import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { PaginatedTVSection } from "@/components/PaginatedTVSection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { getTopRatedTVShows } from "@/app/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top Rated TV Shows",
  description:
    "Discover the highest rated TV shows and series of all time. Browse the best critically acclaimed television with top audience scores across all genres.",
  keywords: [
    "top rated tv shows",
    "best tv series of all time",
    "highest rated series",
    "best television shows",
    "critically acclaimed series",
    "must watch tv shows",
    "award winning series",
    "greatest tv shows ever",
  ],
  openGraph: {
    title: "Top Rated TV Shows - WatchList",
    description:
      "Discover the highest rated TV shows and series of all time. Browse the best critically acclaimed television.",
    type: "website",
    url: "https://www.watch-list.me/tv-shows/top-rated",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Top Rated TV Shows - WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Top Rated TV Shows - WatchList",
    description: "Discover the highest rated TV shows and series of all time.",
  },
  alternates: {
    canonical: "https://www.watch-list.me/tv-shows/top-rated",
  },
};

async function TopRatedTVData() {
  const data = await tmdbServerApi.getTopRatedTVShows(1);

  return (
    <PaginatedTVSection
      title="Top Rated TV Shows"
      fetchFunction={getTopRatedTVShows}
      initialTVShows={data.results}
      initialTotalPages={data.total_pages}
    />
  );
}

export default function TopRatedTVShowsPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="Top Rated TV Shows"
        description="The highest rated series of all time"
        mediaType="tv"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <Suspense
          fallback={
            <LoadingSection title="Top Rated TV Shows" rows={2} cols={6} />
          }
        >
          <TopRatedTVData />
        </Suspense>
      </div>
    </div>
  );
}
