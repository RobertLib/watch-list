// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Home from "./page";

// Everything around the rows is left out: this is about the outline the page
// itself puts the rows into.
vi.mock("@/components/HeroSection", () => ({ HeroSection: () => null }));
vi.mock("@/components/WelcomePanelContent", () => ({ WelcomePanelContent: () => null }));
vi.mock("@/components/HomeWatchlistPanel", () => ({ HomeWatchlistPanel: () => null }));
vi.mock("@/components/ContinueWatching", () => ({ ContinueWatching: () => null }));
vi.mock("@/components/DailyGameTeaser", () => ({ DailyGameTeaser: () => null }));
vi.mock("@/components/WelcomeBack", () => ({ WelcomeBack: () => null }));
vi.mock("@/components/KeepYourDataNudge", () => ({ KeepYourDataNudge: () => null }));
vi.mock("@/components/RecommendedForYou", () => ({ RecommendedForYou: () => null }));
vi.mock("@/components/GenreQuickNav", () => ({ GenreQuickNav: () => null }));
vi.mock("@/components/StructuredData", () => ({ StructuredData: () => null }));

vi.mock("@/components/carousels", () => {
  // A row that renders its heading at whatever level the page asks for – the
  // real rows pass it through to `MediaCarousel`, which has its own test.
  const row = (title: string) =>
    function Row({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
      const Heading = headingLevel === 3 ? "h3" : "h2";
      return <Heading>{title}</Heading>;
    };

  return {
    TrendingCarousel: row("Trending This Week"),
    NowPlayingCarousel: row("Now Playing in Theaters"),
    PopularMoviesCarousel: row("Popular Movies"),
    UpcomingMoviesCarousel: row("Coming Soon to Theaters"),
    TopRatedMoviesCarousel: row("Top Rated Movies"),
    AiringTodayCarousel: row("Airing Today"),
    PopularTVShowsCarousel: row("Popular TV Shows"),
    TopRatedTVShowsCarousel: row("Top Rated TV Shows"),
  };
});

afterEach(cleanup);

// The rows under "Movies" and "TV Shows" were h2s too, which made them
// siblings of the headings they sit under.
it("nests the movie and TV rows under their group headings", () => {
  render(<Home />);

  const outline = screen
    .getAllByRole("heading")
    .map((heading) => `${heading.tagName} ${heading.textContent}`);

  expect(outline.slice(0, 11)).toEqual([
    "H1 WatchList – Your Free Movie & TV Show Watchlist",
    "H2 Trending This Week",
    "H2 Movies",
    "H3 Now Playing in Theaters",
    "H3 Popular Movies",
    "H3 Coming Soon to Theaters",
    "H3 Top Rated Movies",
    "H2 TV Shows",
    "H3 Airing Today",
    "H3 Popular TV Shows",
    "H3 Top Rated TV Shows",
  ]);
});
