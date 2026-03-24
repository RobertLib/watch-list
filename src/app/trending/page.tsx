import { Suspense } from "react";
import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { PaginatedMovieSection } from "@/components/PaginatedMovieSection";
import { PaginatedTVSection } from "@/components/PaginatedTVSection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { getPopularMovies, getPopularTVShows } from "@/app/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trending Movies & TV Shows",
  description:
    "Discover what's trending in movies and TV shows right now. Browse the most popular films and series everyone is watching this week.",
  keywords: [
    "trending movies",
    "trending tv shows",
    "what's popular now",
    "most watched movies",
    "popular series this week",
    "trending films",
    "what to watch",
    "top movies this week",
    "popular tv shows now",
  ],
  openGraph: {
    title: "Trending Now - WatchList",
    description:
      "Discover what's trending in movies and TV shows right now. Browse the most popular films and series everyone is watching.",
    type: "website",
    url: "https://www.watch-list.me/trending",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Trending Now - WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Trending Now - WatchList",
    description: "Discover what's trending in movies and TV shows right now.",
  },
  alternates: {
    canonical: "https://www.watch-list.me/trending",
  },
};

async function TrendingMoviesData() {
  const data = await tmdbServerApi.getPopularMovies(1);

  return (
    <PaginatedMovieSection
      title="Trending Movies"
      fetchFunction={getPopularMovies}
      initialMovies={data.results}
      initialTotalPages={data.total_pages}
    />
  );
}

async function TrendingTVData() {
  const data = await tmdbServerApi.getPopularTVShows(1);

  return (
    <PaginatedTVSection
      title="Trending TV Shows"
      fetchFunction={getPopularTVShows}
      initialTVShows={data.results}
      initialTotalPages={data.total_pages}
    />
  );
}

export default function TrendingPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="Trending Now"
        description="The most popular movies and TV shows this week"
        mediaType="movie"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <Suspense
          fallback={
            <LoadingSection title="Trending Movies" rows={2} cols={6} />
          }
        >
          <TrendingMoviesData />
        </Suspense>

        <Suspense
          fallback={
            <LoadingSection title="Trending TV Shows" rows={2} cols={6} />
          }
        >
          <TrendingTVData />
        </Suspense>
      </div>
    </div>
  );
}
