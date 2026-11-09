// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaginatedMovieSection } from "./PaginatedMovieSection";
import { PaginatedTVSection } from "./PaginatedTVSection";
import type { MediaItem, Movie, TVShow } from "@/types/tmdb";

vi.mock("./MediaSection", () => ({
  MediaSection: ({ items }: { items: MediaItem[] }) => (
    <ul>{items.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
  ),
}));

const title = (id: number): Movie & TVShow => ({
  id,
  title: `Title ${id}`,
  name: `Title ${id}`,
  overview: "",
  poster_path: null,
  backdrop_path: null,
  release_date: "2020-01-01",
  first_air_date: "2020-01-01",
  vote_average: 7,
  vote_count: 100,
  genre_ids: [],
  adult: false,
  original_language: "en",
  original_title: `Title ${id}`,
  original_name: `Title ${id}`,
  popularity: 1,
  video: false,
});

type FetchPage = (page: number) => Promise<{
  results: (Movie & TVShow)[];
  total_pages: number;
}>;

const sections = [
  { name: "movies", component: (page: number, fetchPage: FetchPage) => (
    <PaginatedMovieSection title="Movies" initialMovies={[title(page)]}
      initialPage={page} initialTotalPages={1000} fetchFunction={fetchPage} />
  ) },
  { name: "TV shows", component: (page: number, fetchPage: FetchPage) => (
    <PaginatedTVSection title="TV shows" initialTVShows={[title(page)]}
      initialPage={page} initialTotalPages={1000} fetchFunction={fetchPage} />
  ) },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(sections)("Paginated $name", ({ component }) => {
  it("keeps the current titles and retries the same page after a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchPage = vi.fn<FetchPage>()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ results: [title(2)], total_pages: 3 });
    render(component(1, fetchPage));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Load More/ }));
    });
    expect(screen.getByText("Title 1")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(fetchPage).toHaveBeenNthCalledWith(1, 2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2);
    expect(screen.getByText("Title 1")).toBeTruthy();
    expect(screen.getByText("Title 2")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("loads page 500 once and stops despite a higher total_pages", async () => {
    const fetchPage = vi.fn<FetchPage>().mockResolvedValue({ results: [title(500)], total_pages: 1000 });
    render(component(499, fetchPage));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Load More/ }));
    });

    expect(fetchPage).toHaveBeenCalledExactlyOnceWith(500);
    expect(screen.getByText("Title 500")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Load More/ })).toBeNull();
  });

  it("does not offer a page beyond the transport limit on initial render", () => {
    const fetchPage = vi.fn<FetchPage>();
    render(component(500, fetchPage));

    expect(screen.queryByRole("button", { name: /^Load More/ })).toBeNull();
    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe("Load More behind the build's snapshot", () => {
  // Page two would come from the visitor's own region and be appended to the
  // build's default-region page one, and the section remounts – dropping what
  // was appended – the moment the visitor's own page one arrives.
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  async function renderSection(loadFirstPage: () => Promise<{ results: (Movie & TVShow)[]; total_pages: number }>) {
    const { AsyncDiscoverySection } = await import("./AsyncDiscoverySection");
    const fetchPage = vi.fn<FetchPage>().mockResolvedValue({ results: [title(3)], total_pages: 5 });
    await act(async () => {
      render(
        <AsyncDiscoverySection
          title="Movies"
          loadKey="US"
          loadFirstPage={loadFirstPage}
          placeholder={{ results: [title(1)], total_pages: 5 }}
        >
          {(page, snapshot) => (
            <PaginatedMovieSection
              title="Movies"
              initialMovies={page.results}
              initialTotalPages={page.total_pages}
              fetchFunction={fetchPage}
              snapshot={snapshot}
            />
          )}
        </AsyncDiscoverySection>,
      );
    });
    return fetchPage;
  }

  it("holds Load More until the visitor's own page one replaces the snapshot", async () => {
    const live = deferred<{ results: (Movie & TVShow)[]; total_pages: number }>();
    const fetchPage = await renderSection(() => live.promise);

    const button = screen.getByRole("button", { name: "Load More Movies" }) as HTMLButtonElement;
    expect(screen.getByText("Title 1")).toBeTruthy();
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(fetchPage).not.toHaveBeenCalled();

    await act(async () => { live.resolve({ results: [title(2)], total_pages: 5 }); });
    expect(screen.getByText("Title 2")).toBeTruthy();
    const liveButton = screen.getByRole("button", { name: "Load More Movies" }) as HTMLButtonElement;
    expect(liveButton.disabled).toBe(false);

    await act(async () => { fireEvent.click(liveButton); });
    expect(fetchPage).toHaveBeenCalledWith(2);
    expect(screen.getByText("Title 3")).toBeTruthy();
  });

  it("keeps the snapshot when page one fails, and offers that load again in Load More's place", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loadFirstPage = vi.fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ results: [title(2)], total_pages: 5 });
    await renderSection(loadFirstPage);

    expect(screen.getByText("Title 1")).toBeTruthy();
    expect(screen.queryByText(/Could not load/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Load More Movies" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(screen.getByText("Title 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load More Movies" })).toBeTruthy();
  });
});
