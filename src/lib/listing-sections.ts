/**
 * The fixed sections of `/movies` and `/tv-shows` – everything under the
 * filterable "Discover" grid – and how page one of each is loaded.
 *
 * Named here so the build can load the same pages: those two listings carry a
 * snapshot of these sections in their prerendered HTML (`build-time-tmdb.ts`).
 * The "Discover" grid itself reads its filters from the query string and only
 * renders in the browser.
 */

import { tmdbDiscoverApi } from "./tmdb-discover";
import { tmdbApi } from "./tmdb";
import { settle } from "./settle";
import type { Movie, Person, TMDBResponse, TVShow } from "@/types/tmdb";

export const MOVIE_SECTIONS = {
  trending: () => tmdbDiscoverApi.getTrendingMoviesWeekly(1),
  nowPlaying: () => tmdbDiscoverApi.getNowPlayingMovies(1),
  upcoming: () => tmdbDiscoverApi.getUpcomingMovies(1),
  topRated: () => tmdbDiscoverApi.getTopRatedMovies(1),
} satisfies Record<string, () => Promise<TMDBResponse<Movie>>>;

export const TV_SECTIONS = {
  trending: () => tmdbDiscoverApi.getTrendingTVShowsWeekly(1),
  airingToday: () => tmdbDiscoverApi.getAiringTodayTVShows(1),
  topRated: () => tmdbDiscoverApi.getTopRatedTVShows(1),
} satisfies Record<string, () => Promise<TMDBResponse<TVShow>>>;

export type MovieSection = keyof typeof MOVIE_SECTIONS;
export type TVSection = keyof typeof TV_SECTIONS;

export type MovieSectionsSnapshot = Record<MovieSection, TMDBResponse<Movie>>;
export type TVSectionsSnapshot = Record<TVSection, TMDBResponse<TVShow>>;

/**
 * Whoever TMDB says is popular this week – two pages, de-duplicated – or null
 * when neither page answered. What `/people` shows.
 *
 * The second page is settled separately: it is the tail of the grid, and losing
 * it is no reason to show nothing. A page of forty people is still the page.
 */
export async function loadPopularPeople(): Promise<Person[] | null> {
  const [page1, page2] = await Promise.all([
    settle(tmdbApi.getPopularPeople(1), "popular people"),
    settle(tmdbApi.getPopularPeople(2), "popular people, page 2"),
  ]);

  if (!page1 && !page2) return null;

  return Array.from(
    new Map(
      [...(page1?.results ?? []), ...(page2?.results ?? [])].map((p) => [p.id, p]),
    ).values(),
  );
}
