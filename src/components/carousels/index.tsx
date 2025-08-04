"use client";

import { MediaCarousel } from "../MediaCarousel";
import { CarouselSkeleton } from "@/components/skeletons";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
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
function DiscoverCarousel<T>({
  title,
  titleWidth,
  load,
  convert,
}: {
  title: string;
  titleWidth: string;
  load: () => Promise<{ results: T[] }>;
  convert: (item: T) => MediaItem;
}) {
  const settingsKey = useSettingsKey();
  const { data, isLoading } = useAsyncData(load, [settingsKey]);

  if (isLoading) return <CarouselSkeleton titleWidth={titleWidth} />;
  // A row that failed is left out rather than shown as an error: it is one of
  // eight, and the page is still worth reading without it.
  if (!data) return null;

  return <MediaCarousel title={title} items={data.results.map(convert)} />;
}

function MovieCarousel(props: {
  title: string;
  titleWidth: string;
  load: () => Promise<{ results: Movie[] }>;
}) {
  return <DiscoverCarousel {...props} convert={convertMovieToMediaItem} />;
}

function TVCarousel(props: {
  title: string;
  titleWidth: string;
  load: () => Promise<{ results: TVShow[] }>;
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

export function NowPlayingCarousel() {
  return (
    <MovieCarousel
      title="Now Playing in Theaters"
      titleWidth="w-64"
      load={() => tmdbDiscoverApi.getNowPlayingMovies()}
    />
  );
}

export function PopularMoviesCarousel() {
  return (
    <MovieCarousel
      title="Popular Movies"
      titleWidth="w-48"
      load={() => tmdbDiscoverApi.getPopularMovies()}
    />
  );
}

export function UpcomingMoviesCarousel() {
  return (
    <MovieCarousel
      title="Coming Soon to Theaters"
      titleWidth="w-60"
      load={() => tmdbDiscoverApi.getUpcomingMovies()}
    />
  );
}

export function TopRatedMoviesCarousel() {
  return (
    <MovieCarousel
      title="Top Rated Movies"
      titleWidth="w-56"
      load={() => tmdbDiscoverApi.getTopRatedMovies()}
    />
  );
}

export function AiringTodayCarousel() {
  return (
    <TVCarousel
      title="Airing Today"
      titleWidth="w-36"
      load={() => tmdbDiscoverApi.getAiringTodayTVShows()}
    />
  );
}

export function PopularTVShowsCarousel() {
  return (
    <TVCarousel
      title="Popular TV Shows"
      titleWidth="w-52"
      load={() => tmdbDiscoverApi.getPopularTVShows()}
    />
  );
}

export function TopRatedTVShowsCarousel() {
  return (
    <TVCarousel
      title="Top Rated TV Shows"
      titleWidth="w-56"
      load={() => tmdbDiscoverApi.getTopRatedTVShows()}
    />
  );
}
