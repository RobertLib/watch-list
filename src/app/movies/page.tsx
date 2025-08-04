import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { MoviesContent } from "@/components/MoviesContent";

// Force dynamic rendering to avoid issues with cookies during build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Movies - WatchList",
  description:
    "Discover the latest and greatest movies. Browse popular, top rated, and now playing movies.",
  openGraph: {
    title: "Movies - WatchList",
    description:
      "Discover the latest and greatest movies. Browse popular, top rated, and now playing movies.",
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
