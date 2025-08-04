import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { TVShowsContent } from "@/components/TVShowsContent";

// Force dynamic rendering to avoid issues with cookies during build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TV Shows",
  description:
    "Explore the best TV shows and series. Discover popular, top-rated, and trending television content across all streaming platforms.",
  keywords: [
    "tv shows",
    "television series",
    "popular tv shows",
    "top rated series",
    "trending shows",
    "streaming series",
    "tv episodes",
    "binge watch",
    "drama series",
    "comedy shows",
  ],
  openGraph: {
    title: "TV Shows - WatchList",
    description:
      "Explore the best TV shows and series. Discover popular, top-rated, and trending television content across all streaming platforms.",
    type: "website",
    url: "https://www.watch-list.me/tv-shows",
    siteName: "WatchList",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "TV Shows - WatchList",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TV Shows - WatchList",
    description:
      "Explore the best TV shows and series. Discover popular, top-rated, and trending television content.",
  },
  alternates: {
    canonical: "https://www.watch-list.me/tv-shows",
  },
};

export default function TVShowsPage() {
  return (
    <div className="min-h-screen bg-black">
      <PageHero
        title="TV Shows"
        description="Discover the latest and greatest TV shows"
        mediaType="tv"
      />

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <TVShowsContent />
      </div>
    </div>
  );
}
