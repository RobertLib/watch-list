import { HeroSection } from "@/components/HeroSection";
import { WelcomePanelContent } from "@/components/WelcomePanelContent";
import { StructuredData } from "@/components/StructuredData";
import {
  TrendingCarousel,
  NowPlayingCarousel,
  PopularMoviesCarousel,
  PopularTVShowsCarousel,
  TopRatedMoviesCarousel,
} from "@/components/carousels";
import { tmdbServerApi } from "@/lib/tmdb-server";

// Revalidate page every 24 hours - trending content doesn't change fast enough to justify more frequent ISR writes
export const revalidate = 86400;

export default async function Home() {
  // Fetch trending data once and share it between HeroSection and TrendingCarousel
  const trendingData = await tmdbServerApi.getTrending("all", "week");

  return (
    <>
      <StructuredData type="Website" data={{}} />
      <StructuredData type="WebApplication" data={{}} />

      <HeroSection trendingData={trendingData} />

      <div className="container mx-auto px-6 lg:px-8 py-8 space-y-12">
        <WelcomePanelContent />

        <TrendingCarousel trendingData={trendingData} />

        <NowPlayingCarousel />

        <PopularMoviesCarousel />

        <PopularTVShowsCarousel />

        <TopRatedMoviesCarousel />
      </div>
    </>
  );
}
