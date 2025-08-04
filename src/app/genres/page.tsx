import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { GenresContent } from "@/components/GenresContent";

// Force dynamic rendering to avoid issues with cookies during build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Genres",
  description:
    "Browse movies and TV shows by genre. Explore action, comedy, drama, horror, sci-fi, romance, and many more genres to find your perfect entertainment.",
  keywords: [
    "movie genres",
    "tv show genres",
    "action movies",
    "comedy films",
    "drama series",
    "horror movies",
    "sci-fi shows",
    "romance films",
    "thriller movies",
    "documentary series",
    "animation",
    "adventure movies",
  ],
  openGraph: {
    title: "Genres - WatchList",
    description:
      "Browse movies and TV shows by genre. Explore action, comedy, drama, horror, sci-fi, romance, and many more genres.",
    type: "website",
    url: "https://www.watch-list.me/genres",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Genres - WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Genres - WatchList",
    description:
      "Browse movies and TV shows by genre. Find your perfect entertainment by category.",
  },
  alternates: {
    canonical: "https://www.watch-list.me/genres",
  },
};

export default function GenresPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="Genres"
        description="Browse movies and TV shows by genre"
        mediaType="all"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <GenresContent />
      </div>
    </div>
  );
}
