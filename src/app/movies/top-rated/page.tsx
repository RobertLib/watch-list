import { Suspense } from "react";
import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { PaginatedMovieSection } from "@/components/PaginatedMovieSection";
import { LoadingSection } from "@/components/LoadingSpinner";
import { tmdbServerApi } from "@/lib/tmdb-server";
import { getTopRatedMovies } from "@/app/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top Rated Movies",
  description:
    "Discover the highest rated movies of all time. Browse critically acclaimed films with the best audience scores across all genres and eras.",
  keywords: [
    "top rated movies",
    "best movies of all time",
    "highest rated films",
    "critically acclaimed movies",
    "best films ever made",
    "movie ratings",
    "award winning movies",
    "classic films",
  ],
  openGraph: {
    title: "Top Rated Movies - WatchList",
    description:
      "Discover the highest rated movies of all time. Browse critically acclaimed films with the best audience scores.",
    type: "website",
    url: "https://www.watch-list.me/movies/top-rated",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Top Rated Movies - WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Top Rated Movies - WatchList",
    description:
      "Discover the highest rated movies of all time. Browse critically acclaimed films.",
  },
  alternates: {
    canonical: "https://www.watch-list.me/movies/top-rated",
  },
};

async function TopRatedMoviesData() {
  const data = await tmdbServerApi.getTopRatedMovies(1);

  return (
    <PaginatedMovieSection
      title="Top Rated Movies"
      fetchFunction={getTopRatedMovies}
      initialMovies={data.results}
      initialTotalPages={data.total_pages}
    />
  );
}

export default function TopRatedMoviesPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="Top Rated Movies"
        description="The highest rated films of all time"
        mediaType="movie"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <Suspense
          fallback={
            <LoadingSection title="Top Rated Movies" rows={2} cols={6} />
          }
        >
          <TopRatedMoviesData />
        </Suspense>
      </div>
    </div>
  );
}
