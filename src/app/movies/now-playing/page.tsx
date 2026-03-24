import { Suspense } from "react";
import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { PaginatedMovieSection } from "@/components/PaginatedMovieSection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { getNowPlayingMovies } from "@/app/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Movies Now Playing in Cinemas",
  description:
    "See what movies are currently playing in cinemas. Find the latest theatrical releases and discover what's on at your local theater right now.",
  keywords: [
    "movies now playing",
    "movies in cinemas",
    "current movies in theaters",
    "theatrical releases",
    "new movies in cinema",
    "what's on at the cinema",
    "latest movie releases",
    "films in theaters now",
  ],
  openGraph: {
    title: "Movies Now Playing - WatchList",
    description:
      "See what movies are currently playing in cinemas. Find the latest theatrical releases.",
    type: "website",
    url: "https://www.watch-list.me/movies/now-playing",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Movies Now Playing - WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Movies Now Playing - WatchList",
    description:
      "See what movies are currently playing in cinemas. Find the latest theatrical releases.",
  },
  alternates: {
    canonical: "https://www.watch-list.me/movies/now-playing",
  },
};

async function NowPlayingMoviesData() {
  const data = await tmdbServerApi.getNowPlayingMovies(1);

  return (
    <PaginatedMovieSection
      title="Now Playing in Cinemas"
      fetchFunction={getNowPlayingMovies}
      initialMovies={data.results}
      initialTotalPages={data.total_pages}
    />
  );
}

export default function NowPlayingMoviesPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="Now Playing"
        description="Movies currently showing in cinemas"
        mediaType="movie"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <Suspense
          fallback={
            <LoadingSection title="Now Playing in Cinemas" rows={2} cols={6} />
          }
        >
          <NowPlayingMoviesData />
        </Suspense>
      </div>
    </div>
  );
}
