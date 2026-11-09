// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CollectionContent } from "./CollectionContent";
import type { CollectionDetails, MediaItem, Movie } from "@/types/tmdb";

const api = vi.hoisted(() => ({
  getCollectionDetails: vi.fn(),
  getImageUrl: vi.fn((path: string | null, size: string) => `https://image.tmdb.org/t/p/${size}${path}`),
}));

vi.mock("@/lib/tmdb", () => ({ tmdbApi: api }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("id=10-star-wars-collection"),
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: React.ComponentProps<"a">) => <a href={href}>{children}</a>,
}));
// The card needs the personal-data contexts; this page only decides the order.
vi.mock("@/components/MediaCard", () => ({
  MemoizedMediaCard: ({ item }: { item: MediaItem }) => <p data-testid="part">{item.title}</p>,
}));

function part(id: number, title: string, release_date: string): Movie {
  return {
    id, title, release_date, overview: "", poster_path: null, backdrop_path: null,
    vote_average: 7, vote_count: 100, genre_ids: [], adult: false,
    original_language: "en", original_title: title, popularity: 10, video: false,
  };
}

function collection(parts: Movie[]): CollectionDetails {
  return {
    id: 10,
    name: "Star Wars Collection",
    overview: null,
    poster_path: "/collection.jpg",
    backdrop_path: null,
    parts,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

async function shownOrder(parts: Movie[]): Promise<string[]> {
  api.getCollectionDetails.mockResolvedValue(collection(parts));
  await act(async () => { render(<CollectionContent />); });
  return screen.getAllByTestId("part").map((card) => card.textContent ?? "");
}

describe("CollectionContent order", () => {
  /**
   * TMDB lists an announced, undated sequel with `release_date: ""`. That used
   * to read as time zero, so the film nobody has seen yet led the collection.
   */
  it("puts undated parts after every dated one", async () => {
    const order = await shownOrder([
      part(3, "Episode VI", "1983-05-25"),
      part(9, "Untitled Sequel", ""),
      part(1, "Episode IV", "1977-05-25"),
      part(2, "Episode V", "1980-05-17"),
    ]);

    expect(order).toEqual(["Episode IV", "Episode V", "Episode VI", "Untitled Sequel"]);
  });

  it("keeps TMDB's order among the undated, and among parts sharing a date", async () => {
    const order = await shownOrder([
      part(5, "Untitled B", ""),
      part(3, "Same Day 1", "2000-01-01"),
      part(6, "Untitled A", ""),
      part(4, "Same Day 2", "2000-01-01"),
    ]);

    expect(order).toEqual(["Same Day 1", "Same Day 2", "Untitled B", "Untitled A"]);
  });

  it("orders the structured data the same way", async () => {
    await shownOrder([part(9, "Untitled Sequel", ""), part(1, "Episode IV", "1977-05-25")]);

    const list = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => JSON.parse(script.textContent ?? "{}"))
      .find((entry) => entry["@type"] === "ItemList");
    const names = list.itemListElement.map(
      (entry: { item: { name: string } }) => entry.item.name,
    );
    expect(names).toEqual(["Episode IV", "Untitled Sequel"]);
  });
});

describe("CollectionContent images", () => {
  // `unoptimized`: the size named is the size downloaded, and the poster is
  // shown at 128px wide at most.
  it("fetches the collection poster at w300 rather than w500", async () => {
    await shownOrder([part(1, "Episode IV", "1977-05-25")]);

    expect(api.getImageUrl).toHaveBeenCalledWith("/collection.jpg", "w300");
  });
});
