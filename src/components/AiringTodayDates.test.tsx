// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AiringTodayCarousel } from "./carousels";
import { TVShowsContent } from "./TVShowsContent";
import type { MediaItem, TMDBResponse, TVShow } from "@/types/tmdb";

const api = vi.hoisted(() => ({
  getPopularTVShows: vi.fn(),
  getTrendingTVShowsWeekly: vi.fn(),
  getAiringTodayTVShows: vi.fn(),
  getTopRatedTVShows: vi.fn(),
  discoverTVShowsWithFilters: vi.fn(),
}));

vi.mock("@/lib/tmdb-discover", () => ({ tmdbDiscoverApi: api }));
vi.mock("@/lib/api", () => api);
vi.mock("@/hooks/useSettings", () => ({ useSettingsKey: () => "settings" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("./FilterPresets", () => ({ TV_PRESETS: [], FilterPresets: () => null }));
vi.mock("./ViewModeToggle", () => ({ ViewModeToggle: () => null }));
vi.mock("./MediaGrid", () => ({
  MediaGrid: ({ items }: { items: MediaItem[] }) => (
    <ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
  ),
}));
vi.mock("./MediaCarousel", () => ({
  MediaCarousel: ({ title, items }: { title: string; items: MediaItem[] }) => (
    <section aria-label={title}>{items.map((item) => item.title).join(", ")}</section>
  ),
}));
vi.mock("./MediaSection", () => ({
  MediaSection: ({ title, items }: { title: string; items: MediaItem[] }) => (
    <section aria-label={title}>{items.map((item) => item.title).join(", ")}</section>
  ),
}));

beforeEach(() => {
  vi.useFakeTimers();
  for (const loader of Object.values(api)) {
    loader.mockReset().mockImplementation(async () => ({
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [{ id: 1, name: `Programme ${new Date().getDate()}`, first_air_date: "2026-01-01" }],
    }));
  }
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

function programmePage(page = 1): TMDBResponse<TVShow> {
  const name = `Programme ${new Date().getDate()} page ${page}`;
  return {
    page,
    total_pages: 3,
    total_results: 3,
    results: [{
      id: page,
      name,
      original_name: name,
      overview: "",
      poster_path: null,
      backdrop_path: null,
      first_air_date: "2026-01-01",
      vote_average: 7,
      vote_count: 100,
      genre_ids: [],
      adult: false,
      original_language: "en",
      popularity: 1,
    }],
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TV listing pagination across dates", () => {
  it.each(["midnight", "return to a suspended tab"])(
    "keeps other sections' loaded pages during and after %s refresh",
    async (trigger) => {
      vi.setSystemTime(new Date(2026, 9, 6, 23, 59, 59));
      for (const loader of Object.values(api)) {
        loader.mockImplementation(async (page = 1) => programmePage(page));
      }
      await act(async () => { render(<TVShowsContent />); });

      const discover = screen.getByRole("heading", { name: "Discover TV Shows" }).closest("section")!;
      const trending = screen.getByRole("region", { name: "Trending This Week" }).parentElement!;
      const topRated = screen.getByRole("region", { name: "Top Rated TV Shows" }).parentElement!;
      const airing = screen.getByRole("region", { name: "Airing Today" }).parentElement!;
      for (const section of [discover, trending, topRated, airing]) {
        await act(async () => {
          fireEvent.click(within(section).getByRole("button", { name: /^Load More/ }));
        });
        expect(section.textContent).toContain("Programme 6 page 2");
      }

      let completeRefresh!: (value: TMDBResponse<TVShow>) => void;
      api.getAiringTodayTVShows.mockImplementationOnce(() =>
        new Promise<TMDBResponse<TVShow>>((resolve) => { completeRefresh = resolve; }),
      );
      await act(async () => {
        if (trigger === "midnight") {
          await vi.advanceTimersByTimeAsync(2000);
        } else {
          vi.setSystemTime(new Date(2026, 9, 7, 12));
          document.dispatchEvent(new Event("visibilitychange"));
        }
      });

      // The daily request is still pending: unrelated listings must stay usable.
      for (const section of [discover, trending, topRated]) {
        expect(section.isConnected).toBe(true);
        expect(section.textContent).toContain("Programme 6 page 2");
      }
      expect(screen.queryByRole("region", { name: "Airing Today" })).toBeNull();

      await act(async () => { completeRefresh(programmePage()); });

      for (const section of [discover, trending, topRated]) {
        expect(section.isConnected).toBe(true);
        expect(section.textContent).toContain("Programme 6 page 2");
        await act(async () => {
          fireEvent.click(within(section).getByRole("button", { name: /^Load More/ }));
        });
        expect(section.textContent).toContain("Programme 7 page 3");
      }
      expect(screen.getByRole("region", { name: "Airing Today" }).textContent).toBe("Programme 7 page 1");
      for (const loader of [api.getPopularTVShows, api.getTrendingTVShowsWeekly, api.getTopRatedTVShows]) {
        expect(loader.mock.calls.map(([page]) => page)).toEqual([1, 2, 3]);
      }
      expect(api.getAiringTodayTVShows.mock.calls.map(([page]) => page)).toEqual([1, 2, 1]);
    },
  );
});

describe.each([
  { name: "home carousel", Component: AiringTodayCarousel },
  { name: "TV listing", Component: TVShowsContent },
])("Airing Today in the $name", ({ Component }) => {
  it("replaces yesterday's programme when local midnight passes", async () => {
    vi.setSystemTime(new Date(2026, 9, 6, 23, 59, 59));
    await act(async () => { render(<Component />); });
    expect(screen.getByRole("region", { name: "Airing Today" }).textContent).toBe("Programme 6");

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(screen.getByRole("region", { name: "Airing Today" }).textContent).toBe("Programme 7");
    expect(api.getAiringTodayTVShows).toHaveBeenCalledTimes(2);
  });

  it("refreshes a suspended tab when it becomes visible on a later day", async () => {
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    await act(async () => { render(<Component />); });
    vi.setSystemTime(new Date(2026, 9, 8, 12));

    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });

    expect(screen.getByRole("region", { name: "Airing Today" }).textContent).toBe("Programme 8");
    expect(api.getAiringTodayTVShows).toHaveBeenCalledTimes(2);
  });
});
