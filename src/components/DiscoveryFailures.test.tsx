// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MoviesContent } from "./MoviesContent";
import { TVShowsContent } from "./TVShowsContent";
import type { MediaItem, Movie, TMDBResponse, TVShow } from "@/types/tmdb";

const initialApi = vi.hoisted(() => ({
  getPopularMovies: vi.fn(),
  getTrendingMoviesWeekly: vi.fn(),
  getNowPlayingMovies: vi.fn(),
  getUpcomingMovies: vi.fn(),
  getTopRatedMovies: vi.fn(),
  getPopularTVShows: vi.fn(),
  getTrendingTVShowsWeekly: vi.fn(),
  getAiringTodayTVShows: vi.fn(),
  getTopRatedTVShows: vi.fn(),
}));
const discoverApi = vi.hoisted(() => ({
  discoverMoviesWithFilters: vi.fn(),
  discoverTVShowsWithFilters: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ query: "" }));

vi.mock("@/lib/tmdb-discover", () => ({ tmdbDiscoverApi: initialApi }));
vi.mock("@/lib/api", () => ({ ...initialApi, ...discoverApi }));
vi.mock("@/hooks/useSettings", () => ({ useSettingsKey: () => "settings" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
}));
vi.mock("./MediaGrid", () => ({
  MediaGrid: ({ items }: { items: MediaItem[] }) => (
    <ul aria-label="Discover results">
      {items.map((item) => <li key={item.id}>{item.title}</li>)}
    </ul>
  ),
}));
vi.mock("./FilterPresets", () => ({
  MOVIE_PRESETS: [],
  TV_PRESETS: [],
  FilterPresets: () => <p>Filter controls</p>,
}));
vi.mock("./ViewModeToggle", () => ({ ViewModeToggle: () => null }));
vi.mock("./LoadingSpinner", () => ({
  LoadingSpinner: () => <p role="status">Loading titles</p>,
  LoadingSection: ({ title }: { title: string }) => <p>Loading {title}</p>,
}));
vi.mock("./PaginatedMovieSection", () => ({
  PaginatedMovieSection: PaginatedSectionProbe,
}));
vi.mock("./PaginatedTVSection", () => ({
  PaginatedTVSection: PaginatedSectionProbe,
}));

// A loaded extra page belongs to this mounted section. Retrying a sibling must
// not discard it, even while that sibling is waiting for its replacement data.
function PaginatedSectionProbe({ title }: { title: string }) {
  const [loadedMore, setLoadedMore] = useState(false);
  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      <button onClick={() => setLoadedMore(true)}>Load more {title}</button>
      {loadedMore && <p>Extra page of {title}</p>}
    </section>
  );
}

function page(name: string): TMDBResponse<Movie & TVShow> {
  return {
    page: 1,
    total_pages: 1,
    total_results: 1,
    results: [{
      id: 1,
      title: name,
      name,
      original_title: name,
      original_name: name,
      overview: "",
      poster_path: null,
      backdrop_path: null,
      release_date: "2020-01-01",
      first_air_date: "2020-01-01",
      vote_average: 8,
      vote_count: 100,
      genre_ids: [],
      adult: false,
      original_language: "en",
      popularity: 10,
      video: false,
    }],
  };
}

const contentTypes = [
  {
    name: "movies",
    heading: "Discover Movies",
    popular: initialApi.getPopularMovies,
    discover: discoverApi.discoverMoviesWithFilters,
    initialLoaders: [
      initialApi.getPopularMovies,
      initialApi.getTrendingMoviesWeekly,
      initialApi.getNowPlayingMovies,
      initialApi.getUpcomingMovies,
      initialApi.getTopRatedMovies,
    ],
    component: () => <MoviesContent />,
  },
  {
    name: "TV shows",
    heading: "Discover TV Shows",
    popular: initialApi.getPopularTVShows,
    discover: discoverApi.discoverTVShowsWithFilters,
    initialLoaders: [
      initialApi.getPopularTVShows,
      initialApi.getTrendingTVShowsWeekly,
      initialApi.getAiringTodayTVShows,
      initialApi.getTopRatedTVShows,
    ],
    component: () => <TVShowsContent />,
  },
];

beforeEach(() => {
  navigation.query = "";
  for (const loader of Object.values(initialApi)) {
    loader.mockReset().mockResolvedValue(page("Popular title"));
  }
  for (const loader of Object.values(discoverApi)) loader.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(contentTypes)("Discovery failures: $name", ({
  name,
  heading,
  popular,
  discover,
  initialLoaders,
  component,
}) => {
  it("loads active filters when popular fails and keeps successful sections", async () => {
    navigation.query = "year=2020";
    popular.mockRejectedValue(new Error("Popular request failed"));
    discover.mockResolvedValue(page("Filtered title"));

    await act(async () => { render(component()); });

    expect(screen.getByRole("heading", { name: heading })).toBeDefined();
    expect(screen.getByText("Filter controls")).toBeDefined();
    expect(screen.getByText("Filtered title")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Trending This Week" })).toBeDefined();
    expect(discover).toHaveBeenCalledExactlyOnceWith(1, { year: "2020" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a failed unfiltered initial listing and retries it", async () => {
    popular
      .mockRejectedValueOnce(new Error("Popular request failed"))
      .mockResolvedValueOnce(page("Recovered popular title"));

    await act(async () => { render(component()); });

    expect(screen.getByText("Filter controls")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain(`Could not load ${name}`);
    expect(screen.queryByRole("list", { name: "Discover results" })).toBeNull();
    const trending = screen.getByRole("region", { name: "Trending This Week" });
    fireEvent.click(within(trending).getByRole("button"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(popular).toHaveBeenCalledTimes(2);
    expect(popular).toHaveBeenLastCalledWith(1);
    expect(discover).not.toHaveBeenCalled();
    expect(screen.getByText("Recovered popular title")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("region", { name: "Trending This Week" })).toBe(trending);
    expect(within(trending).getByText("Extra page of Trending This Week")).toBeDefined();
    for (const loader of initialLoaders.filter((loader) => loader !== popular)) {
      expect(loader).toHaveBeenCalledTimes(1);
    }
  });

  it("allows filters after an initial failure and reports it again when cleared", async () => {
    popular.mockRejectedValue(new Error("Popular request failed"));
    discover.mockResolvedValue(page("Filtered title"));
    const view = await act(async () => render(component()));
    expect(screen.getByRole("alert")).toBeDefined();

    navigation.query = "year=2020";
    await act(async () => { view.rerender(component()); });

    expect(screen.getByText("Filtered title")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    navigation.query = "";
    await act(async () => { view.rerender(component()); });

    expect(screen.getByRole("alert").textContent).toContain(`Could not load ${name}`);
    expect(screen.queryByText("Filtered title")).toBeNull();
    expect(popular).toHaveBeenCalledTimes(1);
  });

  it("retries a failed filtered query independently of the popular failure", async () => {
    navigation.query = "year=2020";
    popular.mockRejectedValue(new Error("Popular request failed"));
    discover
      .mockRejectedValueOnce(new Error("Filtered request failed"))
      .mockResolvedValueOnce(page("Recovered filtered title"));
    await act(async () => { render(component()); });
    expect(screen.getByRole("alert")).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(discover).toHaveBeenCalledTimes(2);
    expect(discover).toHaveBeenLastCalledWith(1, { year: "2020" });
    expect(popular).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Recovered filtered title")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps filtered discovery usable when every opening listing failed", async () => {
    navigation.query = "year=2020";
    for (const loader of initialLoaders) loader.mockRejectedValue(new Error("Offline"));
    discover.mockResolvedValue(page("Filtered title"));

    await act(async () => { render(component()); });

    expect(screen.getByText("Filter controls")).toBeDefined();
    expect(screen.getByText("Filtered title")).toBeDefined();
    expect(discover).toHaveBeenCalledExactlyOnceWith(1, { year: "2020" });
    expect(screen.getAllByRole("alert")).toHaveLength(initialLoaders.length - 1);
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(initialLoaders.length - 1);
  });

  it("accepts a successful empty popular result without showing a failure", async () => {
    popular.mockResolvedValue({ ...page(""), results: [], total_results: 0 });

    await act(async () => { render(component()); });

    expect(screen.getByRole("list", { name: "Discover results" })).toBeDefined();
    expect(screen.getByText(`0 ${name}`)).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe.each([
  { component: () => <MoviesContent />, title: "Trending This Week", loader: initialApi.getTrendingMoviesWeekly, sibling: "Now Playing" },
  { component: () => <MoviesContent />, title: "Now Playing", loader: initialApi.getNowPlayingMovies, sibling: "Trending This Week" },
  { component: () => <MoviesContent />, title: "Coming Soon", loader: initialApi.getUpcomingMovies, sibling: "Trending This Week" },
  { component: () => <MoviesContent />, title: "Top Rated Movies", loader: initialApi.getTopRatedMovies, sibling: "Trending This Week" },
  { component: () => <TVShowsContent />, title: "Trending This Week", loader: initialApi.getTrendingTVShowsWeekly, sibling: "Top Rated TV Shows" },
  { component: () => <TVShowsContent />, title: "Airing Today", loader: initialApi.getAiringTodayTVShows, sibling: "Trending This Week" },
  { component: () => <TVShowsContent />, title: "Top Rated TV Shows", loader: initialApi.getTopRatedTVShows, sibling: "Trending This Week" },
])("Recovery of $title", ({ component, title, loader, sibling }) => {
  it("keeps the failed listing visible and retries it without resetting successful listings", async () => {
    let resolveRetry!: (value: TMDBResponse<Movie & TVShow>) => void;
    loader
      .mockRejectedValueOnce(new Error("Temporary network failure"))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));

    await act(async () => { render(component()); });

    expect(screen.getByRole("heading", { name: title })).toBeDefined();
    const failed = screen.getByRole("alert");
    expect(failed.textContent).toContain(`Could not load ${title.toLowerCase()}`);
    const healthy = screen.getByRole("region", { name: sibling });
    fireEvent.click(within(healthy).getByRole("button"));

    await act(async () => {
      fireEvent.click(within(failed).getByRole("button", { name: "Try again" }));
    });

    expect(screen.getByText(`Loading ${title}`)).toBeDefined();
    expect(screen.getByRole("region", { name: sibling })).toBe(healthy);
    expect(within(healthy).getByText(`Extra page of ${sibling}`)).toBeDefined();
    expect(screen.getByText("Popular title")).toBeDefined();

    await act(async () => { resolveRetry(page("Recovered title")); });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("region", { name: title })).toBeDefined();
    expect(within(healthy).getByText(`Extra page of ${sibling}`)).toBeDefined();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader).toHaveBeenLastCalledWith(1);
    for (const other of Object.values(initialApi).filter((other) => other !== loader)) {
      expect(other.mock.calls.length).toBeLessThanOrEqual(1);
    }
  });
});
