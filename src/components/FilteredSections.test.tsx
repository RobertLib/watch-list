// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FilteredMovieSection } from "./FilteredMovieSection";
import { FilteredTVSection } from "./FilteredTVSection";
import type { MediaItem, Movie, TMDBResponse, TVShow } from "@/types/tmdb";

const api = vi.hoisted(() => ({
  getPopularMovies: vi.fn(),
  getPopularTVShows: vi.fn(),
  discoverMoviesWithFilters: vi.fn(),
  discoverTVShowsWithFilters: vi.fn(),
}));

const navigation = vi.hoisted(() => ({ query: "" }));

vi.mock("@/lib/api", () => api);
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
}));
vi.mock("./MediaGrid", () => ({
  MediaGrid: ({ items }: { items: MediaItem[] }) => (
    <ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
  ),
}));
vi.mock("./FilterPresets", () => ({
  MOVIE_PRESETS: [],
  TV_PRESETS: [],
  FilterPresets: () => null,
}));
vi.mock("./ViewModeToggle", () => ({ ViewModeToggle: () => null }));
vi.mock("./LoadingSpinner", () => ({
  LoadingSpinner: () => <div role="status">Loading titles</div>,
}));

// One fixture can travel through either section; each reads its own TMDB title
// and date fields, while the assertions concern the listing the visitor sees.
function title(id: number, name: string): Movie & TVShow {
  return {
    id,
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
  };
}

function page(
  number: number,
  name: string,
  totalResults = 60,
): TMDBResponse<Movie & TVShow> {
  return {
    page: number,
    results: [title(number, name)],
    total_pages: 3,
    total_results: totalResults,
  };
}

function deferred() {
  let resolve!: (value: TMDBResponse<Movie & TVShow>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<TMDBResponse<Movie & TVShow>>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const sections = [
  {
    name: "movies",
    popular: api.getPopularMovies,
    discover: api.discoverMoviesWithFilters,
    component: () => (
      <FilteredMovieSection
        title="Discover Movies"
        initialMovies={[title(10, "Initial title")]}
        initialTotalPages={3}
        initialTotalResults={60}
      />
    ),
  },
  {
    name: "TV shows",
    popular: api.getPopularTVShows,
    discover: api.discoverTVShowsWithFilters,
    component: () => (
      <FilteredTVSection
        title="Discover TV Shows"
        initialTVShows={[title(10, "Initial title")]}
        initialTotalPages={3}
        initialTotalResults={60}
      />
    ),
  },
];

beforeEach(() => {
  navigation.query = "";
  vi.clearAllMocks();
  for (const fn of Object.values(api)) fn.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(sections)("Filtered section: $name", ({ name, popular, discover, component }) => {
  it.each([false, true])("stops at page 500 when filtered=%s and TMDB reports more pages", async (filtered) => {
    if (filtered) {
      navigation.query = "year=2020";
      discover.mockResolvedValueOnce({ ...page(499, "Penultimate page"), total_pages: 1000 });
      discover.mockResolvedValueOnce({ ...page(500, "Last accessible page"), total_pages: 1000 });
    } else {
      popular.mockResolvedValueOnce({ ...page(500, "Last accessible page"), total_pages: 1000 });
    }
    await act(async () => { render(component()); });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });

    if (filtered) expect(discover).toHaveBeenLastCalledWith(500, { year: "2020" });
    expect(screen.getByText("Last accessible page")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Load more content" })).toBeNull();
  });

  it("continues the bounded popular query when no URL filters are active", async () => {
    popular.mockResolvedValue(page(2, "Next popular title"));
    render(component());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });

    expect(popular).toHaveBeenCalledExactlyOnceWith(2);
    expect(discover).not.toHaveBeenCalled();
    expect(screen.getByText("Initial title")).toBeDefined();
    expect(screen.getByText("Next popular title")).toBeDefined();
  });

  it("continues the same discover filters when loading the next filtered page", async () => {
    navigation.query = "year=2020";
    discover
      .mockResolvedValueOnce(page(1, "Filtered first page"))
      .mockResolvedValueOnce(page(2, "Filtered next page"));
    await act(async () => { render(component()); });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });

    expect(discover).toHaveBeenNthCalledWith(1, 1, { year: "2020" });
    expect(discover).toHaveBeenNthCalledWith(2, 2, { year: "2020" });
    expect(popular).not.toHaveBeenCalled();
    expect(screen.getByText("Filtered next page")).toBeDefined();
  });

  it.each([false, true])("retains titles and retries the failed page when filtered=%s", async (filtered) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loader = filtered ? discover : popular;
    if (filtered) {
      navigation.query = "year=2020";
      discover.mockResolvedValueOnce(page(1, "Initial title"));
    }
    loader
      .mockRejectedValueOnce(new Error("TMDB is unavailable"))
      .mockResolvedValueOnce(page(2, "Recovered next page"));
    await act(async () => { render(component()); });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });

    expect(screen.getByText("Initial title")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("Could not load more titles");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry loading more content" }));
    });

    expect(loader).toHaveBeenLastCalledWith(...(filtered ? [2, { year: "2020" }] : [2]));
    expect(screen.getByText("Initial title")).toBeDefined();
    expect(screen.getByText("Recovered next page")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("drops a pagination failure when the filter is cleared", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    navigation.query = "year=2020";
    discover
      .mockResolvedValueOnce(page(1, "Filtered title"))
      .mockRejectedValueOnce(new Error("Offline"));
    const view = await act(async () => render(component()));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });
    expect(screen.getByRole("alert")).toBeDefined();

    navigation.query = "";
    await act(async () => { view.rerender(component()); });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Initial title")).toBeDefined();
    expect(screen.getByRole("button", { name: "Load more content" })).toBeDefined();
  });

  it("discards an old pagination response after the new filter results arrive", async () => {
    const oldPage = deferred();
    popular.mockReturnValue(oldPage.promise);
    discover
      .mockResolvedValueOnce(page(1, "New filter title", 80))
      .mockResolvedValueOnce(page(2, "New filter page two", 80));
    const view = render(component());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });

    navigation.query = "year=2020";
    await act(async () => { view.rerender(component()); });
    await act(async () => {
      oldPage.resolve(page(2, "Obsolete title"));
      await oldPage.promise;
    });

    expect(screen.getByText("New filter title")).toBeDefined();
    expect(screen.queryByText("Obsolete title")).toBeNull();
    expect(screen.getByText(`80 ${name}`)).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });
    expect(discover).toHaveBeenLastCalledWith(2, { year: "2020" });
  });

  it("keeps loading the new filter when obsolete pagination fails", async () => {
    const oldPage = deferred();
    const newPage = deferred();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    popular.mockReturnValue(oldPage.promise);
    discover.mockReturnValue(newPage.promise);
    const view = render(component());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });

    navigation.query = "year=2020";
    await act(async () => { view.rerender(component()); });
    await act(async () => {
      oldPage.reject(new Error("The old query failed"));
      await oldPage.promise.catch(() => {});
    });

    expect(screen.getByText("Loading titles")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(log).not.toHaveBeenCalled();

    await act(async () => {
      newPage.resolve(page(1, "New filter title", 80));
      await newPage.promise;
    });
    expect(screen.queryByText("Loading titles")).toBeNull();
    expect(screen.getByText("New filter title")).toBeDefined();
  });

  it("reports a failed first filtered page and lets the visitor retry", async () => {
    navigation.query = "year=2020";
    vi.spyOn(console, "error").mockImplementation(() => {});
    discover
      .mockRejectedValueOnce(new Error("TMDB is unavailable"))
      .mockResolvedValueOnce(page(1, "Recovered title"));
    await act(async () => { render(component()); });

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText(`Could not load ${name}`)).toBeDefined();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(discover).toHaveBeenCalledTimes(2);
    expect(discover).toHaveBeenLastCalledWith(1, { year: "2020" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Recovered title")).toBeDefined();
  });
});
