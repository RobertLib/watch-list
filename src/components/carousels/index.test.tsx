// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NowPlayingCarousel, TrendingCarousel } from "./index";

const page = { page: 1, results: [], total_pages: 1, total_results: 0 };

vi.mock("@/lib/tmdb-discover", () => ({
  tmdbDiscoverApi: {
    getTrending: vi.fn(async () => page),
    getNowPlayingMovies: vi.fn(async () => page),
  },
}));
vi.mock("@/hooks/useSettings", () => ({ useSettingsKey: () => "settings" }));
vi.mock("../MediaCarousel", () => ({
  MediaCarousel: ({ title, headingLevel = 2 }: { title: string; headingLevel?: 2 | 3 }) => {
    const Heading = headingLevel === 3 ? "h3" : "h2";
    return <Heading>{title}</Heading>;
  },
}));

afterEach(cleanup);

// The home page puts most rows under "Movies" and "TV Shows" h2s, so it asks
// for h3 row titles there – and the row has to pass that on.
it("passes the page's heading level through to the row", async () => {
  await act(async () => { render(<NowPlayingCarousel headingLevel={3} />); });

  expect(
    screen.getByRole("heading", { level: 3, name: "Now Playing in Theaters" }),
  ).toBeTruthy();
});

it("is a section of its own page by default", async () => {
  await act(async () => { render(<TrendingCarousel />); });

  expect(
    screen.getByRole("heading", { level: 2, name: "Trending This Week" }),
  ).toBeTruthy();
});
