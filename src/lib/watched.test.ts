import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WATCHED_STORAGE_KEY,
  addToWatched,
  clearWatched,
  getWatched,
  isWatched,
  removeFromWatched,
  saveWatched,
  type WatchedItem,
} from "./watched";

/**
 * The write-outcome cases live in `watchlist.test.ts`, which checks the two
 * lists behave the same way on save, duplicate and refusal. What is here is the
 * rest of the module: the read path that has to survive whatever is in storage,
 * and the lookups the detail pages call on every render.
 */

/** A localStorage with a seam for refusing a write, as a full quota would. */
class FakeStorage {
  private data = new Map<string, string>();
  failOn = new Set<string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    if (this.failOn.has(key)) {
      throw new DOMException("QuotaExceededError");
    }
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failOn.has(key)) {
      throw new DOMException("SecurityError");
    }
    this.data.delete(key);
  }
}

let storage: FakeStorage;

const movie = {
  id: 550,
  title: "Fight Club",
  mediaType: "movie" as const,
  posterPath: "/poster.jpg",
  voteAverage: 8.4,
  releaseDate: "1999-10-15",
};

const show = {
  id: 1396,
  title: "Breaking Bad",
  mediaType: "tv" as const,
  posterPath: "/bb.jpg",
  voteAverage: 8.9,
  releaseDate: "2008-01-20",
};

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal("window", { localStorage: storage });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getWatched", () => {
  it("answers empty before anything has been stored", () => {
    expect(getWatched()).toEqual([]);
  });

  it("answers empty for a stored value that is not JSON", () => {
    storage.setItem(WATCHED_STORAGE_KEY, "{not json");

    expect(getWatched()).toEqual([]);
  });

  // Storage is hand-editable and outlives the shape that wrote it. One bad
  // record has to cost that record rather than the page that reads it.
  it("drops a malformed entry and keeps the sound one", () => {
    storage.setItem(
      WATCHED_STORAGE_KEY,
      JSON.stringify([{ nonsense: true }, { ...movie, watchedAt: "" }]),
    );

    const watched = getWatched();

    expect(watched).toHaveLength(1);
    expect(watched[0].id).toBe(550);
  });

  it("answers empty for a stored value that is not a list at all", () => {
    storage.setItem(WATCHED_STORAGE_KEY, JSON.stringify({ id: 550 }));

    expect(getWatched()).toEqual([]);
  });

  // Every one of these functions runs during a prerender, where there is no
  // window at all – returning empty is what keeps the build from throwing.
  it("answers empty with no window, rather than throwing", () => {
    vi.stubGlobal("window", undefined);

    expect(getWatched()).toEqual([]);
    expect(saveWatched([])).toBe(false);
    expect(isWatched(550, "movie")).toBe(false);
    expect(() => clearWatched()).not.toThrow();
  });
});

describe("isWatched", () => {
  it("finds a title that is there", () => {
    addToWatched(movie);

    expect(isWatched(550, "movie")).toBe(true);
  });

  it("does not confuse the two media types", () => {
    addToWatched(movie);

    expect(isWatched(550, "tv")).toBe(false);
  });

  it("answers false for a title that was never added", () => {
    expect(isWatched(999, "movie")).toBe(false);
  });
});

describe("removeFromWatched", () => {
  it("removes only the title named", () => {
    addToWatched(movie);
    addToWatched(show);

    expect(removeFromWatched(550, "movie")).toBe("ok");
    expect(getWatched().map((item) => item.id)).toEqual([1396]);
  });
});

describe("addToWatched", () => {
  it("puts the newest title first", () => {
    addToWatched(movie);
    addToWatched(show);

    expect(getWatched().map((item) => item.id)).toEqual([1396, 550]);
  });

  it("stamps the entry with when it was watched", () => {
    addToWatched(movie);

    expect(Date.parse(getWatched()[0].watchedAt)).not.toBeNaN();
  });
});

describe("clearWatched", () => {
  it("empties the list", () => {
    addToWatched(movie);
    clearWatched();

    expect(getWatched()).toEqual([]);
  });

  // A browser that refuses the removal must not take the page down with it.
  it("swallows a storage that refuses to remove", () => {
    addToWatched(movie);
    storage.failOn.add(WATCHED_STORAGE_KEY);

    expect(() => clearWatched()).not.toThrow();
  });
});

describe("saveWatched", () => {
  it("round-trips a list through storage", () => {
    const items: WatchedItem[] = [
      { ...movie, watchedAt: "2026-01-01T00:00:00.000Z" },
    ];

    expect(saveWatched(items)).toBe(true);
    expect(getWatched()).toEqual(items);
  });
});
