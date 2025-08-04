// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { FilteredMovieSection } from "./FilteredMovieSection";
import { FilteredTVSection } from "./FilteredTVSection";
import { getMoviePresets, getTVPresets } from "@/lib/filter-presets";
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
vi.mock("./FilterPresets", () => ({ FilterPresets: () => <p>Filter controls</p> }));
vi.mock("./ViewModeToggle", () => ({ ViewModeToggle: () => null }));
vi.mock("./LoadingSpinner", () => ({
  LoadingSpinner: () => <div role="status">Loading titles</div>,
}));
vi.mock("./MediaGrid", () => ({
  MediaGrid: ({ items }: { items: MediaItem[] }) => (
    <ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
  ),
}));

function page(number: number, name: string): TMDBResponse<Movie & TVShow> {
  return {
    page: number,
    results: [{
      id: number,
      title: name,
      name,
      release_date: "2020-01-01",
      first_air_date: "2020-01-01",
    } as Movie & TVShow],
    total_pages: 3,
    total_results: 60,
  };
}

const sections = [
  {
    name: "movies",
    datedPreset: "recent-releases",
    fixedPreset: "top-rated-classics",
    discover: api.discoverMoviesWithFilters,
    popular: api.getPopularMovies,
    presets: getMoviePresets,
    component: () => <FilteredMovieSection title="Movies" initialMovies={page(1, "Initial title").results} initialTotalPages={3} />,
  },
  {
    name: "TV shows",
    datedPreset: "new-series",
    fixedPreset: "binge-worthy",
    discover: api.discoverTVShowsWithFilters,
    popular: api.getPopularTVShows,
    presets: getTVPresets,
    component: () => <FilteredTVSection title="TV shows" initialTVShows={page(1, "Initial title").results} initialTotalPages={3} />,
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  navigation.query = "";
  for (const loader of Object.values(api)) loader.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each(sections)("Preset dates: $name", ({ datedPreset, fixedPreset, discover, popular, presets, component }) => {
  it("refreshes an active preset at local New Year and resets its loaded pages", async () => {
    navigation.query = `preset=${datedPreset}`;
    discover
      .mockResolvedValueOnce(page(1, "Previous year page one"))
      .mockResolvedValueOnce(page(2, "Previous year page two"))
      .mockResolvedValueOnce(page(1, "Current year page one"));
    await act(async () => { render(component()); });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });
    expect(screen.getByText("Previous year page two")).toBeDefined();

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(discover.mock.calls.map(([number]) => number)).toEqual([1, 2, 1]);
    expect(discover).toHaveBeenLastCalledWith(1, presets("2027-01-01").find((preset) => preset.id === datedPreset)!.filters);
    expect(screen.getByText("Current year page one")).toBeDefined();
    expect(screen.queryByText("Previous year page one")).toBeNull();
    expect(screen.queryByText("Previous year page two")).toBeNull();
  });

  it("refreshes date bounds when a suspended tab becomes visible on a later day", async () => {
    navigation.query = `preset=${datedPreset}`;
    discover.mockResolvedValue(page(1, "A title"));
    await act(async () => { render(component()); });
    vi.setSystemTime(new Date(2027, 0, 2, 12));

    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });

    expect(discover).toHaveBeenCalledTimes(2);
    expect(discover).toHaveBeenLastCalledWith(1, presets("2027-01-02").find((preset) => preset.id === datedPreset)!.filters);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it("ignores pagination from the previous day while the refreshed preset is pending", async () => {
    navigation.query = `preset=${datedPreset}`;
    let finishOldPage!: (value: TMDBResponse<Movie & TVShow>) => void;
    let finishNewDay!: (value: TMDBResponse<Movie & TVShow>) => void;
    discover
      .mockResolvedValueOnce(page(1, "Previous day title"))
      .mockImplementationOnce(() => new Promise((resolve) => { finishOldPage = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishNewDay = resolve; }));
    await act(async () => { render(component()); });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await act(async () => { finishOldPage(page(2, "Obsolete page")); });

    expect(screen.getByText("Loading titles")).toBeDefined();
    expect(screen.queryByText("Obsolete page")).toBeNull();
    expect(screen.queryByText("Previous day title")).toBeNull();
    await act(async () => { finishNewDay(page(1, "Current day title")); });
    expect(screen.getByText("Current day title")).toBeDefined();
  });

  it.each(["unfiltered", "fixed preset"])("preserves pagination for the %s listing at midnight", async (scope) => {
    const loader = scope === "unfiltered" ? popular : discover;
    if (scope === "fixed preset") navigation.query = `preset=${fixedPreset}`;
    discover.mockResolvedValueOnce(page(1, "Fixed preset title"));
    loader.mockResolvedValueOnce(page(2, "Extra page"));
    await act(async () => { render(component()); });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });
    const requests = loader.mock.calls.length;

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });

    expect(loader).toHaveBeenCalledTimes(requests);
    expect(screen.getByText("Extra page")).toBeDefined();
  });

  it("hydrates static HTML before requesting the visitor's dated preset", async () => {
    navigation.query = `preset=${datedPreset}`;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    discover.mockResolvedValue(page(1, "Hydrated title"));
    const container = document.createElement("div");
    container.innerHTML = renderToString(component());
    document.body.append(container);
    expect(container.textContent).toContain("Loading titles");
    expect(discover).not.toHaveBeenCalled();

    let root!: ReturnType<typeof hydrateRoot>;
    try {
      await act(async () => { root = hydrateRoot(container, component()); });

      expect(errors).not.toHaveBeenCalled();
      expect(discover).toHaveBeenCalledExactlyOnceWith(1, presets("2026-12-31").find((preset) => preset.id === datedPreset)!.filters);
      expect(container.textContent).toContain("Hydrated title");
    } finally {
      await act(async () => { root?.unmount(); });
      container.remove();
    }
  });
});
