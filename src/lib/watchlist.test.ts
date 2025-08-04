import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WATCHLIST_STORAGE_KEY,
  addToWatchlist,
  clearWatchlist,
  getWatchlist,
  removeFromWatchlist,
} from "./watchlist";
import {
  WATCHED_STORAGE_KEY,
  addToWatched,
  getWatched,
  removeFromWatched,
} from "./watched";

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
    if (this.failRemoveOn.has(key)) {
      throw new DOMException("QuotaExceededError");
    }
    this.data.delete(key);
  }

  failRemoveOn = new Set<string>();
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

beforeEach(() => {
  storage = new FakeStorage();
  vi.stubGlobal("window", { localStorage: storage });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("addToWatchlist", () => {
  it("saves the title and says so", () => {
    expect(addToWatchlist(movie)).toBe("ok");
    expect(getWatchlist()).toHaveLength(1);
    expect(getWatchlist()[0].title).toBe("Fight Club");
  });

  it("tells a duplicate apart from a save", () => {
    addToWatchlist(movie);

    expect(addToWatchlist(movie)).toBe("duplicate");
    expect(getWatchlist()).toHaveLength(1);
  });

  // The bug this replaced: a browser that stores nothing answered `true`, so the
  // UI reported a save that had not happened.
  it("reports a refused write rather than claiming success", () => {
    storage.failOn.add(WATCHLIST_STORAGE_KEY);

    expect(addToWatchlist(movie)).toBe("failed");
    expect(getWatchlist()).toEqual([]);
  });

  it("puts the newest title first", () => {
    addToWatchlist(movie);
    addToWatchlist({ ...movie, id: 1396, title: "Breaking Bad" });

    expect(getWatchlist().map((item) => item.id)).toEqual([1396, 550]);
  });
});

describe("removeFromWatchlist", () => {
  it("removes the title and says so", () => {
    addToWatchlist(movie);

    expect(removeFromWatchlist(550, "movie")).toBe("ok");
    expect(getWatchlist()).toEqual([]);
  });

  it("does not confuse the two media types", () => {
    addToWatchlist(movie);

    expect(removeFromWatchlist(550, "tv")).toBe("ok");
    expect(getWatchlist()).toHaveLength(1);
  });

  it("reports a refused write", () => {
    addToWatchlist(movie);
    storage.failOn.add(WATCHLIST_STORAGE_KEY);

    expect(removeFromWatchlist(550, "movie")).toBe("failed");
    expect(getWatchlist()).toHaveLength(1);
  });
});

describe("getWatchlist", () => {
  it("repairs what storage holds instead of handing it on", () => {
    storage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify([{ nonsense: true }, { ...movie, addedAt: "" }]),
    );

    expect(getWatchlist()).toHaveLength(1);
  });

  it("answers empty for a stored value that is not JSON", () => {
    storage.setItem(WATCHLIST_STORAGE_KEY, "{not json");

    expect(getWatchlist()).toEqual([]);
  });
});

describe("the watched list", () => {
  it("behaves the same way on each outcome", () => {
    expect(addToWatched(movie)).toBe("ok");
    expect(addToWatched(movie)).toBe("duplicate");
    expect(getWatched()).toHaveLength(1);

    expect(removeFromWatched(550, "movie")).toBe("ok");
    expect(getWatched()).toEqual([]);
  });

  it("reports a refused write rather than claiming success", () => {
    storage.failOn.add(WATCHED_STORAGE_KEY);

    expect(addToWatched(movie)).toBe("failed");
    expect(getWatched()).toEqual([]);
  });
});


describe("clearWatchlist", () => {
  /**
   * One write for the whole list. The page used to empty it by removing each
   * title in turn, which meant a read, a parse, a sanitise, a serialise and a
   * write per entry – on a list allowed to hold two thousand of them.
   */
  it("empties the list and says the write went through", () => {
    addToWatchlist(movie);
    addToWatchlist({ ...movie, id: 27205, title: "Inception" });

    expect(clearWatchlist()).toBe(true);
    expect(getWatchlist()).toEqual([]);
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
  });

  it("reports a browser that refused the write", () => {
    addToWatchlist(movie);
    storage.failRemoveOn.add(WATCHLIST_STORAGE_KEY);

    expect(clearWatchlist()).toBe(false);
    // Still there, which is exactly why the caller needs to be told.
    expect(getWatchlist()).toHaveLength(1);
  });
});
