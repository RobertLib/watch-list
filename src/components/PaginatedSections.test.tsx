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
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });
    expect(screen.getByText("Title 1")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry loading more content" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Load more content" }));
    });

    expect(fetchPage).toHaveBeenCalledExactlyOnceWith(500);
    expect(screen.getByText("Title 500")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more content" })).toBeNull();
  });

  it("does not offer a page beyond the transport limit on initial render", () => {
    const fetchPage = vi.fn<FetchPage>();
    render(component(500, fetchPage));

    expect(screen.queryByRole("button", { name: "Load more content" })).toBeNull();
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
