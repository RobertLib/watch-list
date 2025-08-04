import { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { TVShowsContent } from "@/components/TVShowsContent";

// Force dynamic rendering to avoid issues with cookies during build
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TV Shows - WatchList",
  description:
    "Discover the latest and greatest TV shows. Browse popular, top rated, and airing today TV shows.",
  openGraph: {
    title: "TV Shows - WatchList",
    description:
      "Discover the latest and greatest TV shows. Browse popular, top rated, and airing today TV shows.",
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
