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

// Revalidate page every hour
export const revalidate = 3600;

export default function Home() {
  return (
    <>
      <StructuredData type="Website" data={{}} />
      <StructuredData type="WebApplication" data={{}} />

      <HeroSection />

      <div className="container mx-auto px-6 lg:px-8 py-8 space-y-12">
        <WelcomePanelContent />

        <TrendingCarousel />

        <NowPlayingCarousel />

        <PopularMoviesCarousel />

        <PopularTVShowsCarousel />

        <TopRatedMoviesCarousel />
      </div>
    </>
  );
}
