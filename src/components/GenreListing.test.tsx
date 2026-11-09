// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { GenreListing } from "./GenreListing";
import { findStreamingPlatform } from "@/lib/streaming-landing";
import type { GenreListingPage } from "@/lib/genre-listing-data";
import type { MediaItem, MediaType, Movie, TVShow } from "@/types/tmdb";

const state = vi.hoisted(() => ({ query: "", settingsKey: "US|all|", suspend: false }));
const replace = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  getMovieGenres: vi.fn(),
  getTVGenres: vi.fn(),
  discoverMoviesByGenre: vi.fn(),
  discoverTVShowsByGenre: vi.fn(),
}));
const router = { replace };

vi.mock("next/navigation", () => ({
  // A prerender has no query string to read: `useSearchParams` hands the tree
  // to the client, and the page shows its Suspense fallback. Suspending forever
  // is how a test asks for that render.
  useSearchParams: () => {
    if (state.suspend) throw new Promise(() => {});
    return new URLSearchParams(state.query);
  },
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
// Counts its own mounts and offers a real control to hold focus, so a test can
// tell a filter bar that stayed put from one that was torn down and rebuilt.
const filterBar = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("./DiscoverFilterBar", async () => {
  const { useEffect } = await import("react");
  return {
    DiscoverFilterBarSkeleton: () => <div>Filter bar placeholder</div>,
    DiscoverFilterBar: ({ totalResults, resultsPending }: { totalResults?: number; resultsPending?: boolean }) => {
      useEffect(() => { filterBar.mounts += 1; }, []);
      return (
        <div>
          Filters
          <select aria-label="Release year"><option>All Years</option></select>
          <span>{resultsPending ? "Updating results…" : `${totalResults} results`}</span>
        </div>
      );
    },
  };
});
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
  filterBar.mounts = 0;
  state.query = "page=20";
  state.settingsKey = "US|all|";
  state.suspend = false;
  for (const discover of [api.discoverMoviesByGenre, api.discoverTVShowsByGenre]) {
    discover.mockReset().mockImplementation(async (_id: number, page: number) => ({
      results: page === 1 ? [title] : [], total_pages: 1, total_results: 1,
    }));
  }
});
afterEach(cleanup);

const action = { id: 28, name: "Action" };

/** The listing as a genre route renders it: the path has already named the genre. */
function listing(
  mediaType: MediaType,
  { platform, snapshot = null }: { platform?: string; snapshot?: GenreListingPage | null } = {},
) {
  return (
    <GenreListing
      mediaType={mediaType}
      genre={action}
      platform={platform ? findStreamingPlatform(platform) : undefined}
      snapshot={snapshot}
    />
  );
}

async function followReplacement(
  view: ReturnType<typeof render>,
  mediaType: MediaType,
  platform?: string,
) {
  state.query = new URL(replace.mock.calls.at(-1)![0], "https://example.com").search;
  await act(async () => { view.rerender(listing(mediaType, { platform })); });
}

describe("GenreListing pagination recovery", () => {
  it.each(["movie", "tv"] as const)("includes the Czech Prime Video ID in the %s platform landing", async (mediaType) => {
    state.query = "";
    state.settingsKey = "CZ|all|";

    await act(async () => { render(listing(mediaType, { platform: "prime-video" })); });

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
    await act(async () => { view = render(listing(mediaType)); });
    expect(screen.getByText("Page 20 of 20")).toBeTruthy();

    state.settingsKey = "CZ|all|";
    await act(async () => { view.rerender(listing(mediaType)); });

    expect(replace).toHaveBeenCalledExactlyOnceWith(`/genres/${mediaType}/action-28`, { scroll: false });
    expect(screen.getByText("Loading titles")).toBeTruthy();
    expect(screen.queryByText(/No action/)).toBeNull();
    await followReplacement(view, mediaType);
    expect(screen.getByText("Available title")).toBeTruthy();
    expect(discover.mock.calls.map((call) => call[1])).toEqual([20, 20, 1]);
  });

  it("keeps genre filters while replacing an unavailable page with the last valid page", async () => {
    state.query = "page=20&year=2020&with_genre=12";
    api.discoverMoviesByGenre.mockImplementation(async (_id: number, page: number) => ({
      results: page === 2 ? [title] : [], total_pages: 2, total_results: 21,
    }));
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(listing("movie")); });

    const target = new URL(replace.mock.calls.at(-1)![0], "https://example.com");
    expect(target.pathname).toBe("/genres/movie/action-28");
    expect(target.searchParams.get("page")).toBe("2");
    expect(target.searchParams.get("year")).toBe("2020");
    expect(target.searchParams.get("with_genre")).toBe("12");
    expect(target.searchParams.has("genre")).toBe(false);
    expect(screen.queryByText(/No action/)).toBeNull();

    await followReplacement(view, "movie");
    expect(screen.getByText("Available title")).toBeTruthy();
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
  });

  it("preserves the streaming platform while recovering from an unavailable platform page", async () => {
    state.query = "page=10";
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(listing("movie", { platform: "netflix" })); });
    expect(replace).toHaveBeenCalledExactlyOnceWith("/genres/movie/action-28/netflix", { scroll: false });
    expect(screen.queryByText(/No action/)).toBeNull();

    await followReplacement(view, "movie", "netflix");
    expect(screen.getByText("Available title")).toBeTruthy();
    expect(api.discoverMoviesByGenre.mock.calls.map((call) => call[1])).toEqual([10, 1]);
    expect(api.discoverMoviesByGenre.mock.calls.at(-1)![2]).toMatchObject({ watchProviders: "8" });
  });

  it("shows the empty state only after confirming that page one has no results", async () => {
    api.discoverMoviesByGenre.mockResolvedValue({ results: [], total_pages: 0, total_results: 0 });
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(listing("movie")); });
    expect(screen.queryByText("No action movies found.")).toBeNull();

    await followReplacement(view, "movie");
    expect(screen.getByText("No action movies found.")).toBeTruthy();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(api.discoverMoviesByGenre.mock.calls.map((call) => call[1])).toEqual([20, 1]);
  });
});

function deferredPage() {
  let resolve!: (value: { results: unknown[]; total_pages: number; total_results: number }) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<{ results: unknown[]; total_pages: number; total_results: number }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * A filter change used to reset the one load behind the whole page, which put
 * the page back to its skeleton – the filter bar included. The control being
 * used was unmounted under the visitor and focus fell to <body>; with arrow
 * keys on a closed <select> firing `change` on every step, a keyboard user
 * could not get past the first option.
 */
describe("GenreListing filter changes", () => {
  const filtered = { ...title, id: 2, title: "Filtered title", name: "Filtered title" };

  it("keeps the filter bar mounted, and focused, while only the results reload", async () => {
    state.query = "";
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(listing("movie")); });
    expect(screen.getByText("Available title")).toBeTruthy();
    expect(filterBar.mounts).toBe(1);

    const select = screen.getByRole("combobox", { name: "Release year" });
    select.focus();

    const next = deferredPage();
    api.discoverMoviesByGenre.mockReturnValueOnce(next.promise);
    state.query = "year=2020";
    await act(async () => { view.rerender(listing("movie")); });

    // Only the results are waiting.
    expect(screen.getByText("Loading titles")).toBeTruthy();
    expect(screen.queryByText("Available title")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Action Movies");
    expect(screen.getByText("Updating results…")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Release year" })).toBe(select);
    expect(document.activeElement).toBe(select);
    expect(filterBar.mounts).toBe(1);

    await act(async () => { next.resolve({ results: [filtered], total_pages: 1, total_results: 1 }); });

    expect(screen.getByText("Filtered title")).toBeTruthy();
    expect(screen.getByText("1 results")).toBeTruthy();
    expect(document.activeElement).toBe(select);
    expect(filterBar.mounts).toBe(1);
    expect(api.discoverMoviesByGenre.mock.calls.at(-1)![2]).toMatchObject({ year: "2020" });
  });

  it("reports a failed listing in place of the results, filters and all still there", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.query = "";
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(listing("movie")); });

    api.discoverMoviesByGenre.mockRejectedValueOnce(new Error("TMDB API error: 503"));
    state.query = "year=2020";
    await act(async () => { view.rerender(listing("movie")); });

    expect(screen.getByRole("heading", { name: "Could not load these movies" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Action Movies");
    expect(screen.getByRole("combobox", { name: "Release year" })).toBeTruthy();
    expect(filterBar.mounts).toBe(1);

    api.discoverMoviesByGenre.mockResolvedValueOnce({ results: [filtered], total_pages: 1, total_results: 1 });
    await act(async () => { screen.getByRole("button", { name: "Try again" }).click(); });

    expect(screen.getByText("Filtered title")).toBeTruthy();
    expect(filterBar.mounts).toBe(1);
  });

  it("keeps the page when it moves to another page of the same genre", async () => {
    state.query = "";
    api.discoverMoviesByGenre.mockResolvedValue({ results: [title], total_pages: 3, total_results: 60 });
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(listing("movie")); });

    const next = deferredPage();
    api.discoverMoviesByGenre.mockReturnValueOnce(next.promise);
    state.query = "page=2";
    await act(async () => { view.rerender(listing("movie")); });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Action Movies");
    expect(screen.getByText("Loading titles")).toBeTruthy();
    expect(filterBar.mounts).toBe(1);

    await act(async () => { next.resolve({ results: [filtered], total_pages: 3, total_results: 60 }); });
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
  });
});

/**
 * The build writes page one of the unfiltered listing into the page. The
 * prerender shows it, and the browser starts from it rather than from a
 * skeleton – but only for the view it describes.
 */
describe("GenreListing build snapshot", () => {
  const snapshotTitle = { ...title, id: 3, title: "Snapshot title", name: "Snapshot title" } as unknown as MediaItem;
  const snapshot: GenreListingPage = { items: [snapshotTitle], totalPages: 20, totalResults: 400 };

  it("prerenders the heading, the snapshot and the platform links", async () => {
    state.suspend = true;
    await act(async () => { render(listing("movie", { snapshot })); });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Action Movies");
    expect(screen.getByText("Snapshot title")).toBeTruthy();
    expect(screen.getByText("Page 1 of 20")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next →" }).getAttribute("href")).toBe(
      "/genres/movie/action-28?page=2",
    );
    expect(screen.getByRole("link", { name: "Action on Netflix" }).getAttribute("href")).toBe(
      "/genres/movie/action-28/netflix",
    );
    // The real bar reads the query string, which a prerender does not have.
    expect(screen.queryByText("Filters")).toBeNull();
    expect(screen.getByText("Filter bar placeholder")).toBeTruthy();
    expect(api.discoverMoviesByGenre).not.toHaveBeenCalled();
  });

  it("prerenders a skeleton when the build had no snapshot", async () => {
    state.suspend = true;
    await act(async () => { render(listing("movie")); });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Action Movies");
    expect(screen.getByText("Loading titles")).toBeTruthy();
  });

  it("counts a platform landing's titles from the snapshot", async () => {
    state.suspend = true;
    await act(async () => { render(listing("tv", { platform: "netflix", snapshot })); });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Action TV Shows on Netflix");
    expect(screen.getByText(/400 action TV shows streaming on Netflix/)).toBeTruthy();
  });

  it("shows the snapshot until the visitor's own listing arrives, then replaces it", async () => {
    state.query = "";
    const next = deferredPage();
    api.discoverMoviesByGenre.mockReturnValueOnce(next.promise);
    await act(async () => { render(listing("movie", { snapshot })); });

    expect(screen.getByText("Snapshot title")).toBeTruthy();
    expect(screen.queryByText("Loading titles")).toBeNull();

    await act(async () => { next.resolve({ results: [title], total_pages: 1, total_results: 1 }); });
    expect(screen.getByText("Available title")).toBeTruthy();
    expect(screen.queryByText("Snapshot title")).toBeNull();
  });

  it.each([
    ["a filtered view", "year=2020"],
    ["a later page", "page=2"],
  ])("never stands the snapshot in for %s", async (_label, query) => {
    state.query = query;
    api.discoverMoviesByGenre.mockReturnValueOnce(deferredPage().promise);
    await act(async () => { render(listing("movie", { snapshot })); });

    expect(screen.queryByText("Snapshot title")).toBeNull();
    expect(screen.getByText("Loading titles")).toBeTruthy();
  });
});
