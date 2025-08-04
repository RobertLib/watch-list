import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { MoviesContent } from "@/components/MoviesContent";

// Force dynamic rendering to avoid issues with cookies during build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Movies",
  description:
    "Discover the latest and greatest movies. Browse popular, top rated, and now playing movies across all streaming platforms. Find your next favorite film.",
  keywords: [
    "movies",
    "popular movies",
    "top rated movies",
    "now playing movies",
    "new movies",
    "movie database",
    "film reviews",
    "cinema",
    "streaming movies",
  ],
  openGraph: {
    title: "Movies - WatchList",
    description:
      "Discover the latest and greatest movies. Browse popular, top rated, and now playing movies across all streaming platforms.",
    type: "website",
    url: "https://www.watch-list.me/movies",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Movies - WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Movies - WatchList",
    description:
      "Discover the latest and greatest movies. Browse popular, top rated, and now playing movies.",
  },
  alternates: {
    canonical: "https://www.watch-list.me/movies",
  },
};

export default function MoviesPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="Movies"
        description="Discover the latest and greatest movies"
        mediaType="movie"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <MoviesContent />
      </div>
    </div>
  );
}
