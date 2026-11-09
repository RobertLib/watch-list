// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { WatchProviders } from "./WatchProviders";
import { HomeWatchlistPanel } from "./HomeWatchlistPanel";

/**
 * The small images, each repeated across a page. `next.config.ts` sets
 * `unoptimized`, so the TMDB size in the URL is the file the browser downloads
 * – there is no optimiser to shrink a `w500` into the 24px or 40px box it is
 * drawn in. Each is asked for at the narrowest size that still covers its box
 * on a 2x screen.
 */

const watchlist = vi.hoisted(() => ({
  items: [] as { id: number; mediaType: "movie" | "tv"; title: string; posterPath: string | null; addedAt: string }[],
}));

vi.mock("@/contexts/WatchlistContext", () => ({
  useWatchlist: () => ({ watchlist: watchlist.items, isLoading: false }),
}));
vi.mock("@/contexts/WatchedContext", () => ({
  useWatched: () => ({ watched: [] }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: ComponentProps<"a">) => <a href={href}>{children}</a>,
}));

afterEach(() => {
  cleanup();
  watchlist.items = [];
});

function sources(container: HTMLElement) {
  return [...container.querySelectorAll("img")].map((image) => image.getAttribute("src"));
}

describe("streaming logos on a card", () => {
  // 24px each, up to three on every card in a grid of forty.
  it("ask for w92 rather than w500", () => {
    const { container } = render(
      <WatchProviders
        providers={[
          { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg", display_priority: 1 },
          { provider_id: 9, provider_name: "Prime Video", logo_path: "/prime.jpg", display_priority: 2 },
        ]}
      />,
    );

    expect(sources(container)).toEqual([
      "https://image.tmdb.org/t/p/w92/netflix.jpg",
      "https://image.tmdb.org/t/p/w92/prime.jpg",
    ]);
  });
});

describe("the home page watchlist strip", () => {
  // 40px-wide thumbnails.
  it("asks for w92 posters rather than w500", () => {
    watchlist.items = [
      { id: 550, mediaType: "movie", title: "Fight Club", posterPath: "/fight.jpg", addedAt: "2026-01-02T00:00:00.000Z" },
      { id: 1396, mediaType: "tv", title: "Breaking Bad", posterPath: "/bad.jpg", addedAt: "2026-01-01T00:00:00.000Z" },
    ];
    const { container } = render(<HomeWatchlistPanel />);

    expect(sources(container)).toEqual([
      "https://image.tmdb.org/t/p/w92/fight.jpg",
      "https://image.tmdb.org/t/p/w92/bad.jpg",
    ]);
  });
});
