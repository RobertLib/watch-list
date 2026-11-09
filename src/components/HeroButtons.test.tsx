// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HeroButtons } from "./HeroButtons";
import type { MediaItem } from "@/types/tmdb";

/**
 * "More Info" goes somewhere, so it is a link to that place. It was a button
 * that pushed the route: no address to open in a new tab or hover over, and
 * nothing in the prerendered home page for a crawler to follow.
 */

vi.mock("@/hooks/useVideoOverlay", () => ({
  useVideoOverlay: () => ({
    isOpen: false,
    video: null,
    isLoading: false,
    openVideo: vi.fn(),
    closeVideo: vi.fn(),
  }),
}));
vi.mock("./VideoOverlay", () => ({ VideoOverlay: () => null }));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

afterEach(() => cleanup());

function featured(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 550,
    title: "Fight Club",
    overview: "",
    poster_path: null,
    backdrop_path: null,
    release_date: "1999-10-15",
    vote_average: 8,
    vote_count: 10,
    genre_ids: [],
    media_type: "movie",
    ...overrides,
  } as MediaItem;
}

describe("More Info", () => {
  it("is a link to the film's page", () => {
    render(<HeroButtons featuredItem={featured()} />);

    const link = screen.getByRole("link", { name: "View more information about Fight Club" });
    expect(link.getAttribute("href")).toBe("/movie?id=fight-club-550");
    expect(link.textContent).toContain("More Info");
  });

  it("points a series at the tv route", () => {
    render(
      <HeroButtons
        featuredItem={featured({ id: 1396, title: undefined, name: "Breaking Bad", media_type: "tv" } as Partial<MediaItem>)}
      />,
    );

    expect(
      screen.getByRole("link", { name: "View more information about Breaking Bad" }).getAttribute("href"),
    ).toBe("/tv?id=breaking-bad-1396");
  });
});
