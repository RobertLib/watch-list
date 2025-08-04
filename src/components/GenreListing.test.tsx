// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { GenreListing } from "./GenreListing";
import type { MediaItem, MediaType, Movie, TVShow } from "@/types/tmdb";

const state = vi.hoisted(() => ({ query: "", settingsKey: "US|all|" }));
const replace = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  getMovieGenres: vi.fn(),
  getTVGenres: vi.fn(),
  discoverMoviesByGenre: vi.fn(),
  discoverTVShowsByGenre: vi.fn(),
}));
const router = { replace };

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.query),
  useRouter: () => router,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: React.ComponentProps<"a">) => <a href={href}>{children}</a>,
}));
vi.mock("@/hooks/useSettings", () => ({ useSettingsKey: () => state.settingsKey }));
vi.mock("@/lib/tmdb", () => ({ tmdbApi: api }));
vi.mock("@/lib/tmdb-discover", () => ({ tmdbDiscoverApi: api }));
vi.mock("@/lib/wikipedia", () => ({
  getGenreWikipediaContent: vi.fn().mockResolvedValue(null),
}));
vi.mock("./DiscoverFilterBar", () => ({ DiscoverFilterBar: () => <div>Filters</div> }));
vi.mock("./MediaSection", () => ({
  MediaSection: ({ items, emptyMessage }: { items: MediaItem[]; emptyMessage: string }) =>
    items.length ? <ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul> : <p>{emptyMessage}</p>,
}));
vi.mock("./LoadingSpinner", () => ({ LoadingSection: () => <p>Loading titles</p> }));

const title: Movie & TVShow = {
  id: 1, title: "Available title", name: "Available title", overview: "",
  poster_path: null, backdrop_path: null, release_date: "2020-01-01",
  first_air_date: "2020-01-01", vote_average: 7, vote_count: 100,
  genre_ids: [28], adult: false, original_language: "en",
  original_title: "Available title", original_name: "Available title",
  popularity: 1, video: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.query = "genre=action-28&page=20";
  state.settingsKey = "US|all|";
  api.getMovieGenres.mockResolvedValue({ genres: [{ id: 28, name: "Action" }] });
  api.getTVGenres.mockResolvedValue({ genres: [{ id: 28, name: "Action" }] });
  for (const discover of [api.discoverMoviesByGenre, api.discoverTVShowsByGenre]) {
    discover.mockReset().mockImplementation(async (_id: number, page: number) => ({
      results: page === 1 ? [title] : [], total_pages: 1, total_results: 1,
    }));
  }
});
afterEach(cleanup);

async function followReplacement(view: ReturnType<typeof render>, mediaType: MediaType) {
  state.query = new URL(replace.mock.calls.at(-1)![0], "https://example.com").search;
  await act(async () => { view.rerender(<GenreListing mediaType={mediaType} />); });
}

describe("GenreListing pagination recovery", () => {
  it.each(["movie", "tv"] as const)("includes the Czech Prime Video ID in the %s platform landing", async (mediaType) => {
    state.query = "genre=action-28&provider=prime-video";
    state.settingsKey = "CZ|all|";

    await act(async () => { render(<GenreListing mediaType={mediaType} />); });

    const discover = mediaType === "movie" ? api.discoverMoviesByGenre : api.discoverTVShowsByGenre;
    expect(discover).toHaveBeenCalledWith(28, 1, {
      watchProviders: "9|119",
      sortBy: "popularity.desc",
    });
    expect(screen.getByText("Available title")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Amazon Prime Video");
  });

  it.each(["movie", "tv"] as const)("loads an available %s page when a region change shrinks the catalogue", async (mediaType) => {
    const discover = mediaType === "movie" ? api.discoverMoviesByGenre : api.discoverTVShowsByGenre;
    discover.mockImplementation(async (_id: number, page: number) => ({
      results: state.settingsKey.startsWith("US") || page === 1 ? [title] : [],
      total_pages: state.settingsKey.startsWith("US") ? 20 : 1,
      total_results: state.settingsKey.startsWith("US") ? 400 : 1,
    }));
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<GenreListing mediaType={mediaType} />); });
    expect(screen.getByText("Page 20 of 20")).toBeTruthy();

    state.settingsKey = "CZ|all|";
    await act(async () => { view.rerender(<GenreListing mediaType={mediaType} />); });

    expect(replace).toHaveBeenCalledExactlyOnceWith(`/genres/${mediaType}?genre=action-28`, { scroll: false });
    expect(screen.getByText("Loading titles")).toBeTruthy();
    expect(screen.queryByText(/No action/)).toBeNull();
    await followReplacement(view, mediaType);
    expect(screen.getByText("Available title")).toBeTruthy();
    expect(discover.mock.calls.map((call) => call[1])).toEqual([20, 20, 1]);
  });

  it("keeps genre filters while replacing an unavailable page with the last valid page", async () => {
    state.query = "genre=action-28&page=20&year=2020&with_genre=12";
    api.discoverMoviesByGenre.mockImplementation(async (_id: number, page: number) => ({
      results: page === 2 ? [title] : [], total_pages: 2, total_results: 21,
    }));
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<GenreListing mediaType="movie" />); });

    const target = new URL(replace.mock.calls.at(-1)![0], "https://example.com");
    expect(target.searchParams.get("page")).toBe("2");
    expect(target.searchParams.get("year")).toBe("2020");
    expect(target.searchParams.get("with_genre")).toBe("12");
    expect(target.searchParams.get("genre")).toBe("action-28");
    expect(screen.queryByText(/No action/)).toBeNull();

    await followReplacement(view, "movie");
    expect(screen.getByText("Available title")).toBeTruthy();
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
  });

  it("preserves the streaming platform while recovering from an unavailable platform page", async () => {
    state.query = "genre=action-28&provider=netflix&page=10";
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<GenreListing mediaType="movie" />); });
    expect(replace).toHaveBeenCalledExactlyOnceWith("/genres/movie?genre=action-28&provider=netflix", { scroll: false });
    expect(screen.queryByText(/No action/)).toBeNull();

    await followReplacement(view, "movie");
    expect(screen.getByText("Available title")).toBeTruthy();
    expect(api.discoverMoviesByGenre.mock.calls.map((call) => call[1])).toEqual([10, 1]);
    expect(api.discoverMoviesByGenre.mock.calls.at(-1)![2]).toMatchObject({ watchProviders: "8" });
  });

  it("shows the empty state only after confirming that page one has no results", async () => {
    api.discoverMoviesByGenre.mockResolvedValue({ results: [], total_pages: 0, total_results: 0 });
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<GenreListing mediaType="movie" />); });
    expect(screen.queryByText("No action movies found.")).toBeNull();

    await followReplacement(view, "movie");
    expect(screen.getByText("No action movies found.")).toBeTruthy();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(api.discoverMoviesByGenre.mock.calls.map((call) => call[1])).toEqual([20, 1]);
  });
});
