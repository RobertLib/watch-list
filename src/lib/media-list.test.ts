import { describe, expect, it } from "vitest";
import {
  MAX_ITEMS_PER_LIST,
  sanitizeStoredWatched,
  sanitizeStoredWatchlist,
  sanitizeWatchlistItems,
} from "./media-list";

const EXPORTED_AT = "2026-08-01T12:00:00.000Z";

const item = {
  id: 550,
  title: "Fight Club",
  mediaType: "movie" as const,
  posterPath: "/poster.jpg",
  voteAverage: 8.4,
  releaseDate: "1999-10-15",
  addedAt: EXPORTED_AT,
};

describe("sanitizeStoredWatchlist", () => {
  it("keeps a well-formed entry", () => {
    expect(sanitizeStoredWatchlist([item])).toEqual([item]);
  });

  it("drops what it cannot address and keeps the rest", () => {
    const items = sanitizeStoredWatchlist([
      null,
      "not an object",
      { ...item, id: "550" },
      { ...item, id: -1 },
      { ...item, mediaType: "book" },
      item,
    ]);

    expect(items).toEqual([item]);
  });

  it("answers empty for anything that is not an array", () => {
    expect(sanitizeStoredWatchlist(undefined)).toEqual([]);
    expect(sanitizeStoredWatchlist({ id: 550 })).toEqual([]);
    expect(sanitizeStoredWatchlist("[]")).toEqual([]);
  });

  it("keeps the first of a duplicated title", () => {
    const items = sanitizeStoredWatchlist([
      item,
      { ...item, title: "A second copy" },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Fight Club");
  });

  it("repairs a missing timestamp rather than dropping the title", () => {
    const [repaired] = sanitizeStoredWatchlist([
      { ...item, addedAt: "not a date" },
    ]);

    expect(repaired.id).toBe(550);
    expect(repaired.addedAt).toBe("");
  });

  // The read path feeds the next write, so a cap here would truncate a long
  // list and then persist the truncation.
  it("does not truncate a list longer than the import cap", () => {
    const many = Array.from({ length: MAX_ITEMS_PER_LIST + 25 }, (_, i) => ({
      ...item,
      id: i + 1,
    }));

    expect(sanitizeStoredWatchlist(many)).toHaveLength(MAX_ITEMS_PER_LIST + 25);
  });

  // A file's size is someone else's choice, so that path stays bounded.
  it("still caps a list arriving from a backup file", () => {
    const many = Array.from({ length: MAX_ITEMS_PER_LIST + 25 }, (_, i) => ({
      ...item,
      id: i + 1,
    }));

    expect(sanitizeWatchlistItems(many, EXPORTED_AT)).toHaveLength(
      MAX_ITEMS_PER_LIST,
    );
  });
});

describe("sanitizeStoredWatched", () => {
  it("reads the watched list's own timestamp field", () => {
    const [repaired] = sanitizeStoredWatched([
      {
        id: 1396,
        title: "Breaking Bad",
        mediaType: "tv",
        posterPath: null,
        voteAverage: 8.9,
        releaseDate: "2008-01-20",
        watchedAt: EXPORTED_AT,
      },
    ]);

    expect(repaired.watchedAt).toBe(EXPORTED_AT);
  });
});
