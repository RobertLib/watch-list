"use client";

import { MediaCarousel } from "../MediaCarousel";
import { CarouselSkeleton } from "@/components/skeletons";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useSettingsKey } from "@/hooks/useSettings";
import { useLocalDay } from "@/hooks/useLocalDay";
import { loadHomeRow, type HomeRow } from "@/lib/home-rows";
import type { MediaItem } from "@/types/tmdb";
import { useT } from "@/i18n/LocaleProvider";

/**
 * The rows on the home page.
 *
 * They were eight files of Server Component plus Suspense boundary, each one
 * awaiting a different listing. They are one file of the same shape now: the
 * await became an effect, and the boundary became a loading branch. What made
 * them collapse into one is the settings key – every row reloads on a region or
 * platform change, which is a dependency they all share.
 *
 * Each row takes the build's snapshot of itself (`build-time-tmdb.ts`), which
 * is what the prerendered home page shows and what the browser starts from
 * until the visitor's own region answers.
 */
/**
 * Where a row sits in its page's outline. The home page groups most rows under
 * "Movies" and "TV Shows" headings, which makes those rows subsections.
 */
interface CarouselPlacement {
  headingLevel?: 2 | 3;
  /** Page one of the row, loaded at build time; `null` or absent for none. */
  snapshot?: MediaItem[] | null;
}

function DiscoverCarousel({
  title,
  titleWidth,
  row,
  reloadKey,
  headingLevel,
  snapshot,
}: CarouselPlacement & {
  title: string;
  titleWidth: string;
  row: HomeRow;
  reloadKey?: string;
}) {
  const settingsKey = useSettingsKey();
  const { data, isLoading } = useAsyncData(
    () => loadHomeRow(row),
    [row, settingsKey, reloadKey],
    snapshot,
  );

  if (isLoading) return <CarouselSkeleton titleWidth={titleWidth} />;
  // A row that failed is left out rather than shown as an error: it is one of
  // eight, and the page is still worth reading without it. A row the build
  // wrote a snapshot of keeps showing that instead (`useAsyncData`).
  if (!data) return null;

  return (
    <MediaCarousel title={title} items={data} headingLevel={headingLevel} />
  );
}

export function TrendingCarousel({ snapshot }: CarouselPlacement = {}) {
  const t = useT();
  return (
    <DiscoverCarousel
      title={t("Trending This Week", "Trendy tohoto týdne")}
      titleWidth="w-52"
      row="trending"
      snapshot={snapshot}
    />
  );
}

export function NowPlayingCarousel({ headingLevel, snapshot }: CarouselPlacement = {}) {
  const t = useT();
  return (
    <DiscoverCarousel
      title={t("Now Playing in Theaters", "V kinech")}
      titleWidth="w-64"
      headingLevel={headingLevel}
      row="nowPlaying"
      snapshot={snapshot}
    />
  );
}

export function PopularMoviesCarousel({ headingLevel, snapshot }: CarouselPlacement = {}) {
  const t = useT();
  return (
    <DiscoverCarousel
      title={t("Popular Movies", "Populární filmy")}
      titleWidth="w-48"
      headingLevel={headingLevel}
      row="popularMovies"
      snapshot={snapshot}
    />
  );
}

export function UpcomingMoviesCarousel({ headingLevel, snapshot }: CarouselPlacement = {}) {
  const t = useT();
  return (
    <DiscoverCarousel
      title={t("Coming Soon to Theaters", "Připravujeme do kin")}
      titleWidth="w-60"
      headingLevel={headingLevel}
      row="upcomingMovies"
      snapshot={snapshot}
    />
  );
}

export function TopRatedMoviesCarousel({ headingLevel, snapshot }: CarouselPlacement = {}) {
  const t = useT();
  return (
    <DiscoverCarousel
      title={t("Top Rated Movies", "Nejlépe hodnocené filmy")}
      titleWidth="w-56"
      headingLevel={headingLevel}
      row="topRatedMovies"
      snapshot={snapshot}
    />
  );
}

export function AiringTodayCarousel({ headingLevel, snapshot }: CarouselPlacement = {}) {
  const day = useLocalDay();
  const t = useT();
  return (
    <DiscoverCarousel
      title={t("Airing Today", "Dnes vysílané")}
      titleWidth="w-36"
      headingLevel={headingLevel}
      row="airingToday"
      reloadKey={day}
      snapshot={snapshot}
    />
  );
}

export function PopularTVShowsCarousel({ headingLevel, snapshot }: CarouselPlacement = {}) {
  const t = useT();
  return (
    <DiscoverCarousel
      title={t("Popular TV Shows", "Populární seriály")}
      titleWidth="w-52"
      headingLevel={headingLevel}
      row="popularTVShows"
      snapshot={snapshot}
    />
  );
}

export function TopRatedTVShowsCarousel({ headingLevel, snapshot }: CarouselPlacement = {}) {
  const t = useT();
  return (
    <DiscoverCarousel
      title={t("Top Rated TV Shows", "Nejlépe hodnocené seriály")}
      titleWidth="w-56"
      headingLevel={headingLevel}
      row="topRatedTVShows"
      snapshot={snapshot}
    />
  );
}
