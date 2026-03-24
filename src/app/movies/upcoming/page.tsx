import { Suspense } from "react";
import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { PaginatedMovieSection } from "@/components/PaginatedMovieSection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { getUpcomingMovies } from "@/app/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Upcoming Movies 2026",
  description:
    "Browse upcoming movies coming soon to theaters and streaming platforms. Discover new film releases and add them to your watchlist before they premiere.",
  keywords: [
    "upcoming movies",
    "new movies 2026",
    "movies coming soon",
    "future movie releases",
    "new film releases",
    "movies to watch",
    "anticipated movies",
    "upcoming films 2026",
  ],
  openGraph: {
    title: "Upcoming Movies - WatchList",
    description:
      "Browse upcoming movies coming soon to theaters and streaming platforms. Discover new film releases.",
    type: "website",
    url: "https://www.watch-list.me/movies/upcoming",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Upcoming Movies - WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Upcoming Movies - WatchList",
    description:
      "Browse upcoming movies coming soon to theaters and streaming platforms.",
  },
  alternates: {
    canonical: "https://www.watch-list.me/movies/upcoming",
  },
};

async function UpcomingMoviesData() {
  const data = await tmdbServerApi.getUpcomingMovies(1);

  return (
    <PaginatedMovieSection
      title="Upcoming Movies"
      fetchFunction={getUpcomingMovies}
      initialMovies={data.results}
      initialTotalPages={data.total_pages}
    />
  );
}

export default function UpcomingMoviesPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="Upcoming Movies"
        description="Movies coming soon to theaters and streaming"
        mediaType="movie"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <Suspense
          fallback={
            <LoadingSection title="Upcoming Movies" rows={2} cols={6} />
          }
        >
          <UpcomingMoviesData />
        </Suspense>
      </div>
    </div>
  );
}
