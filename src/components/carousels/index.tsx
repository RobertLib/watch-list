"use client";

import { MediaCarousel } from "../MediaCarousel";
import { CarouselSkeleton } from "@/components/skeletons";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import { useLocalDay } from "@/hooks/useLocalDay";
import { tmdbDiscoverApi } from "@/lib/tmdb-discover";
import {
  convertMovieToMediaItem,
  convertTrendingToMediaItem,
  convertTVShowToMediaItem,
} from "@/lib/media-converters";
import type { MediaItem, Movie, TVShow } from "@/types/tmdb";

/**
 * The rows on the home page.
 *
 * They were eight files of Server Component plus Suspense boundary, each one
 * awaiting a different listing. They are one file of the same shape now: the
 * await became an effect, and the boundary became a loading branch. What made
 * them collapse into one is the settings key – every row reloads on a region or
 * platform change, which is a dependency they all share.
 */
/**
 * Where a row sits in its page's outline. The home page groups most rows under
 * "Movies" and "TV Shows" headings, which makes those rows subsections.
 */
interface CarouselPlacement {
  headingLevel?: 2 | 3;
}

function DiscoverCarousel<T>({
  title,
  titleWidth,
  load,
  convert,
  reloadKey,
  headingLevel,
}: CarouselPlacement & {
  title: string;
  titleWidth: string;
  load: () => Promise<{ results: T[] }>;
  convert: (item: T) => MediaItem;
  reloadKey?: string;
}) {
  const settingsKey = useSettingsKey();
  const { data, isLoading } = useAsyncData(load, [settingsKey, reloadKey]);

  if (isLoading) return <CarouselSkeleton titleWidth={titleWidth} />;
  // A row that failed is left out rather than shown as an error: it is one of
  // eight, and the page is still worth reading without it.
  if (!data) return null;

  return (
    <MediaCarousel
      title={title}
      items={data.results.map(convert)}
      headingLevel={headingLevel}
    />
  );
}

function MovieCarousel(props: CarouselPlacement & {
  title: string;
  titleWidth: string;
  load: () => Promise<{ results: Movie[] }>;
}) {
  return <DiscoverCarousel {...props} convert={convertMovieToMediaItem} />;
}

function TVCarousel(props: CarouselPlacement & {
  title: string;
  titleWidth: string;
  load: () => Promise<{ results: TVShow[] }>;
  reloadKey?: string;
}) {
  return <DiscoverCarousel {...props} convert={convertTVShowToMediaItem} />;
}

export function TrendingCarousel() {
  return (
    <DiscoverCarousel
      title="Trending This Week"
      titleWidth="w-52"
      load={() => tmdbDiscoverApi.getTrending("all", "week")}
      convert={convertTrendingToMediaItem}
    />
  );
}

export function NowPlayingCarousel({ headingLevel }: CarouselPlacement = {}) {
  return (
    <MovieCarousel
      title="Now Playing in Theaters"
      titleWidth="w-64"
      headingLevel={headingLevel}
      load={() => tmdbDiscoverApi.getNowPlayingMovies()}
    />
  );
}

export function PopularMoviesCarousel({ headingLevel }: CarouselPlacement = {}) {
  return (
    <MovieCarousel
      title="Popular Movies"
      titleWidth="w-48"
      headingLevel={headingLevel}
      load={() => tmdbDiscoverApi.getPopularMovies()}
    />
  );
}

export function UpcomingMoviesCarousel({ headingLevel }: CarouselPlacement = {}) {
  return (
    <MovieCarousel
      title="Coming Soon to Theaters"
      titleWidth="w-60"
      headingLevel={headingLevel}
      load={() => tmdbDiscoverApi.getUpcomingMovies()}
    />
  );
}

export function TopRatedMoviesCarousel({ headingLevel }: CarouselPlacement = {}) {
  return (
    <MovieCarousel
      title="Top Rated Movies"
      titleWidth="w-56"
      headingLevel={headingLevel}
      load={() => tmdbDiscoverApi.getTopRatedMovies()}
    />
  );
}

export function AiringTodayCarousel({ headingLevel }: CarouselPlacement = {}) {
  const day = useLocalDay();
  return (
    <TVCarousel
      title="Airing Today"
      titleWidth="w-36"
      headingLevel={headingLevel}
      load={() => tmdbDiscoverApi.getAiringTodayTVShows()}
      reloadKey={day}
    />
  );
}

export function PopularTVShowsCarousel({ headingLevel }: CarouselPlacement = {}) {
  return (
    <TVCarousel
      title="Popular TV Shows"
      titleWidth="w-52"
      headingLevel={headingLevel}
      load={() => tmdbDiscoverApi.getPopularTVShows()}
    />
  );
}

export function TopRatedTVShowsCarousel({ headingLevel }: CarouselPlacement = {}) {
  return (
    <TVCarousel
      title="Top Rated TV Shows"
      titleWidth="w-56"
      headingLevel={headingLevel}
      load={() => tmdbDiscoverApi.getTopRatedTVShows()}
    />
  );
}
