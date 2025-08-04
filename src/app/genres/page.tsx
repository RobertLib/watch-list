import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { GenresContent } from "@/components/GenresContent";

// Force dynamic rendering to avoid issues with cookies during build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Genres - WatchList",
  description:
    "Browse movies and TV shows by genre. Find your favorite content by category.",
  openGraph: {
    title: "Genres - WatchList",
    description:
      "Browse movies and TV shows by genre. Find your favorite content by category.",
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
