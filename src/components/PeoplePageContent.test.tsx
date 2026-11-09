// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { Person } from "@/types/tmdb";
import { PeoplePageContent } from "./PeoplePageContent";

const getPopularPeople = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tmdb", async () => ({
  tmdbApi: {
    getPopularPeople,
    getImageUrl: (await import("@/lib/tmdb-image")).getImageUrl,
  },
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: ComponentProps<"a">) => <a href={href}>{children}</a>,
}));

function person(id: number, name: string): Person {
  return {
    id,
    name,
    profile_path: `/profile-${id}.jpg`,
    known_for_department: "Acting",
    known_for: [{ id: id * 10, media_type: "movie", title: "A Film" }],
  } as Person;
}

beforeEach(() => {
  getPopularPeople.mockImplementation(async (page: number) => ({
    page,
    results: page === 1 ? [person(1, "Featured Star"), person(2, "Second Star")] : [],
    total_pages: 2,
    total_results: 2,
  }));
});

afterEach(cleanup);

// The spotlight above the grid used to name its person in an h2, which came
// before the page's h1 – an outline that opened a level below a title it had
// not reached yet.
it("opens the page's outline with its h1", async () => {
  await act(async () => { render(<PeoplePageContent />); });

  const headings = screen.getAllByRole("heading");
  expect(headings[0].tagName).toBe("H1");
  expect(headings[0].textContent).toBe("Popular People");
  expect(screen.queryByRole("heading", { name: "Featured Star" })).toBeNull();
  // Still named, and still a link to the person.
  expect(screen.getAllByRole("link", { name: "Featured Star" }).length).toBeGreaterThan(0);
});

// The sharp portrait and the blurred wash behind it share one file, and it is
// the file the grid's first card asks for too: h632, not the w500 before.
it("spends a single profile-sized download on the spotlight", async () => {
  await act(async () => { render(<PeoplePageContent />); });

  const sources = new Set(
    [
      screen.getByRole("img", { name: "Featured Star background" }),
      ...screen.getAllByRole("img", { name: "Featured Star" }),
    ].map((image) => image.getAttribute("src")),
  );
  expect([...sources]).toEqual(["https://image.tmdb.org/t/p/h632/profile-1.jpg"]);
});

it("gives the failure its own h1 when nobody could be loaded", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  getPopularPeople.mockRejectedValue(new Error("TMDB API error: 503"));
  await act(async () => { render(<PeoplePageContent />); });

  expect(
    screen.getByRole("heading", { level: 1, name: "Could not load people" }),
  ).toBeTruthy();
});
