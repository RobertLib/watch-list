// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { MediaItem, Person } from "@/types/tmdb";
import type { MultiSearchPage } from "@/lib/tmdb";
import { SearchContent } from "./SearchContent";

const api = vi.hoisted(() => ({
  searchMultiWithPeople: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ query: "q=Heat" }));

vi.mock("@/lib/tmdb", () => ({ tmdbApi: api }));
vi.mock("@/hooks/useSettings", () => ({ useSettingsKey: () => "settings" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
}));
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));
vi.mock("./MediaGrid", () => ({
  MediaGrid: ({ items }: { items: MediaItem[] }) => (
    <ul aria-label="Title results">
      {items.map((item) => <li key={item.id}>{item.title}</li>)}
    </ul>
  ),
}));
vi.mock("./PersonGrid", () => ({
  PersonGrid: ({ people }: { people: Person[] }) => (
    <ul aria-label="People results">
      {people.map((person) => <li key={person.id}>{person.name}</li>)}
    </ul>
  ),
}));
vi.mock("./LoadingSpinner", () => ({
  LoadingSection: () => <p role="status">Loading search results</p>,
}));

const film: MediaItem = {
  id: 949,
  title: "Heat",
  overview: "",
  poster_path: null,
  backdrop_path: null,
  release_date: "1995-12-15",
  vote_average: 8,
  vote_count: 100,
  genre_ids: [],
  media_type: "movie",
};
const person: Person = {
  id: 1158,
  name: "Al Pacino",
  profile_path: null,
  known_for_department: "Acting",
  popularity: 10,
  known_for: [],
};

function results(items: MediaItem[], people: Person[] = [], page = 1): MultiSearchPage {
  return {
    page,
    results: items,
    people,
    total_pages: page,
    total_results: items.length + people.length,
  };
}

beforeEach(() => {
  navigation.query = "q=Heat";
  api.searchMultiWithPeople.mockReset().mockResolvedValue(results([film]));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("search recovery", () => {
  it("retries the current query and page without navigation after an outage", async () => {
    navigation.query = "q=Heat&page=3";
    api.searchMultiWithPeople
      .mockRejectedValueOnce(new Error("Temporary outage"))
      .mockResolvedValueOnce(results([film], [person], 3));

    await act(async () => { render(<SearchContent />); });

    expect(screen.getByRole("alert").textContent).toContain("Could not load search results");
    expect(screen.queryByText(/Nothing found/)).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(api.searchMultiWithPeople).toHaveBeenCalledTimes(2);
    expect(api.searchMultiWithPeople).toHaveBeenLastCalledWith("Heat", 3);
    expect(screen.getByRole("list", { name: "Title results" }).textContent).toContain("Heat");
    expect(screen.getByRole("list", { name: "People results" }).textContent).toContain("Al Pacino");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("mixed search pagination", () => {
  it("reports mixed results honestly when broad queries reach TMDB's total cap", async () => {
    navigation.query = "q=John&page=2";
    api.searchMultiWithPeople.mockResolvedValue({
      ...results([film], [person], 2),
      total_pages: 500,
      total_results: 10000,
    });

    await act(async () => { render(<SearchContent />); });

    expect(screen.getByText("10,000 results · page 2 of 500")).toBeDefined();
    expect(screen.getByRole("list", { name: "Title results" }).textContent).toContain("Heat");
    expect(screen.getByRole("list", { name: "People results" }).textContent).toContain("Al Pacino");
    expect(screen.queryByText("No titles matched.")).toBeNull();
    expect(api.searchMultiWithPeople).toHaveBeenCalledExactlyOnceWith("John", 2);
  });

  it("shows every person on the current page and exposes later people through linked pages", async () => {
    navigation.query = "q=John";
    const people = Array.from({ length: 20 }, (_, index) => ({
      ...person,
      id: index + 1,
      name: `John ${index + 1}`,
    }));
    api.searchMultiWithPeople.mockResolvedValue({
      ...results([], people),
      total_pages: 2,
      total_results: 40,
    });
    const view = await act(async () => render(<SearchContent />));

    expect(screen.getByRole("list", { name: "People results" }).children).toHaveLength(20);
    expect(screen.getByText("John 17")).toBeDefined();
    expect(screen.getByText("John 20")).toBeDefined();
    const nextHref = screen.getByRole("link", { name: "Next" }).getAttribute("href");
    expect(nextHref).toBe("/search?q=John&page=2");

    navigation.query = nextHref!.split("?")[1];
    api.searchMultiWithPeople.mockResolvedValue({
      ...results([], [{ ...person, id: 21, name: "John 21" }], 2),
      total_pages: 2,
      total_results: 40,
    });
    await act(async () => { view.rerender(<SearchContent />); });

    expect(api.searchMultiWithPeople).toHaveBeenLastCalledWith("John", 2);
    expect(screen.getByText("John 21")).toBeDefined();
    expect(screen.queryByText("John 1")).toBeNull();
    expect(screen.queryByText("No results on this page")).toBeNull();
    expect(screen.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/search?q=John");
  });
});

describe("empty search results", () => {
  it("keeps pagination when a non-final page contains no renderable rows", async () => {
    navigation.query = "q=John&page=2";
    api.searchMultiWithPeople.mockResolvedValue({
      ...results([], [], 2),
      total_pages: 3,
      total_results: 60,
    });

    await act(async () => { render(<SearchContent />); });

    expect(screen.getByRole("heading", { name: "No results on this page" })).toBeDefined();
    expect(screen.queryByText(/Nothing found/)).toBeNull();
    expect(screen.queryByRole("list", { name: "People results" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Search result pages" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/search?q=John");
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/search?q=John&page=3");
    expect(screen.getByRole("link", { name: "Back to the first page" }).getAttribute("href")).toBe("/search?q=John");
    expect(screen.getByText("60 results · page 2 of 3")).toBeDefined();
  });

  it("keeps the global empty state when the query matches no titles or people", async () => {
    api.searchMultiWithPeople.mockResolvedValue(results([]));

    await act(async () => { render(<SearchContent />); });

    expect(screen.getByRole("heading", { name: "Nothing found for “Heat”" })).toBeDefined();
    expect(screen.queryByText("No results on this page")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Search result pages" })).toBeNull();
    expect(screen.getByRole("link", { name: "Browse movies" })).toBeDefined();
  });

  it("offers the first page when a shared link requests a page beyond the results", async () => {
    navigation.query = "q=Heat&page=99";
    api.searchMultiWithPeople.mockResolvedValue({
      ...results([], [], 99),
      total_pages: 2,
      total_results: 40,
    });

    await act(async () => { render(<SearchContent />); });

    expect(screen.getByText("There are only 2 pages of results for this search.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to the first page" }).getAttribute("href")).toBe("/search?q=Heat");
    expect(screen.queryByText("No results on this page")).toBeNull();
  });
});
