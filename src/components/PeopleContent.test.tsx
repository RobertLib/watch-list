// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { Person } from "@/types/tmdb";
import { PeopleContent } from "./PeopleContent";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: ComponentProps<"a">) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

function person(id: number, name: string, mediaTypes: ("movie" | "tv")[]): Person {
  return {
    id,
    name,
    profile_path: null,
    known_for_department: "Acting",
    known_for: mediaTypes.map((media_type, index) => ({
      id: id * 10 + index,
      media_type,
      ...(media_type === "movie" ? { title: "A Film" } : { name: "A Show" }),
    })),
  } as Person;
}

it("exposes media filters as pressed buttons and keeps the matching people in one grid", () => {
  render(<PeopleContent people={[
    person(1, "Movie Actor", ["movie"]),
    person(2, "TV Actor", ["tv"]),
    person(3, "Both Actor", ["movie", "tv"]),
  ]} />);

  const filters = screen.getByRole("group", { name: "Filter by media type" });
  expect(within(filters).getByRole("button", { name: "All 3", pressed: true })).toBeTruthy();
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.getAllByRole("link")).toHaveLength(3);

  fireEvent.click(within(filters).getByRole("button", { name: "TV Shows 2" }));

  expect(within(filters).getByRole("button", { name: "TV Shows 2", pressed: true })).toBeTruthy();
  expect(within(filters).getByRole("button", { name: "All 3", pressed: false })).toBeTruthy();
  expect(screen.getAllByRole("link")).toHaveLength(2);
  expect(screen.queryByText("Movie Actor")).toBeNull();
  expect(screen.getByText("TV Actor")).toBeTruthy();
  expect(screen.getByText("Both Actor")).toBeTruthy();
});

// With `unoptimized` set the size named is the file downloaded, twelve of them
// eagerly. A card is at most ~235px wide in the usual layouts; h632 (421px
// wide) covers that at 2x, where the w500 asked for before was 40% more.
it("asks for the h632 profile size", () => {
  render(<PeopleContent people={[{ ...person(1, "Movie Actor", ["movie"]), profile_path: "/face.jpg" }]} />);

  expect(screen.getByRole("img", { name: "Movie Actor" }).getAttribute("src")).toBe(
    "https://image.tmdb.org/t/p/h632/face.jpg",
  );
});
