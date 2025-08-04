import { MediaCarousel } from "../MediaCarousel";
import { convertTrendingToMediaItem } from "@/lib/media-converters";
import type { TMDBResponse, MediaItem } from "@/types/tmdb";

interface TrendingCarouselProps {
  trendingData: TMDBResponse<MediaItem>;
}

export function TrendingCarousel({ trendingData }: TrendingCarouselProps) {
  const items = trendingData.results.map(convertTrendingToMediaItem);

  return <MediaCarousel title="Trending This Week" items={items} />;
}
