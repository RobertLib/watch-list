import { HeroSection } from "@/components/HeroSection";
import { WelcomePanelContent } from "@/components/WelcomePanelContent";
import {
  TrendingCarousel,
  NowPlayingCarousel,
  PopularMoviesCarousel,
  PopularTVShowsCarousel,
  TopRatedMoviesCarousel,
} from "@/components/carousels";

export default function Home() {
  return (
    <>
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
