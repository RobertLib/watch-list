// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { MemoizedMediaListRow } from "./MediaListRow";
import type { MediaItem } from "@/types/tmdb";

vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-src={src}>{alt}</span>
  ),
}));

vi.mock("./GenreTags", () => ({ GenreTags: () => null }));
vi.mock("./VideoOverlay", () => ({ VideoOverlay: () => null }));
vi.mock("./WatchlistButton", () => ({ WatchlistButton: () => null }));
vi.mock("./WatchedButton", () => ({ WatchedButton: () => null }));

afterEach(cleanup);

describe("memoized list row updates", () => {
  it("updates visible metadata and detail links when the same title changes", () => {
    const original: MediaItem = {
      id: 550,
      media_type: "movie",
      title: "Original title",
      poster_path: "/original.jpg",
      backdrop_path: null,
      overview: "Original description",
      release_date: "1999-10-15",
      vote_average: 8.4,
      vote_count: 100,
      genre_ids: [],
    };
    const updated = {
      ...original,
      title: "Updated title",
      poster_path: "/updated.jpg",
      overview: "Updated description",
      release_date: "2025-01-01",
      vote_average: 9.1,
    };
    const { rerender } = render(
      <MemoizedMediaListRow item={original} />,
      { wrapper: WatchedProvider },
    );
    rerender(<MemoizedMediaListRow item={updated} />);

    expect(screen.getByRole("link").getAttribute("href"))
      .toBe("/movie?id=updated-title-550");
    expect(screen.getByRole("link").getAttribute("aria-label")).toContain("2025");
    expect(screen.getByText("Updated description")).toBeTruthy();
    expect(screen.queryByText("Original description")).toBeNull();
    expect(screen.getByText("Poster for Updated title").getAttribute("data-src"))
      .toContain("/updated.jpg");
    expect(screen.getByLabelText("Rating: 9.1 out of 10 stars")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play trailer for Updated title" })).toBeTruthy();
  });
});
