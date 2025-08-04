import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "../test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "./profile-roster-lock";
import { PROFILE_STORAGE_OWNER_KEY, profileStoreKey, withProfileStorage } from "./profile-storage";
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
  byteLimit = Number.POSITIVE_INFINITY;

  get usedBytes(): number {
    return [...this.data].reduce((total, [key, value]) => total + 2 * (key.length + value.length), 0);
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    const previous = this.data.get(key);
    const previousBytes = previous === undefined ? 0 : 2 * (key.length + previous.length);
    if (this.failOn.has(key) || this.usedBytes - previousBytes + 2 * (key.length + value.length) > this.byteLimit) {
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
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("editing older parked watchlists", () => {
  beforeEach(() => {
    storage.setItem(PROFILE_STORAGE_OWNER_KEY, "default");
    storage.setItem("profiles", JSON.stringify([
      { id: "default", name: "Me" }, { id: "bob", name: "Bob" },
    ]));
    storage.setItem("active-profile", "bob");
    storage.setItem("profile-data:bob", JSON.stringify({
      watchlist: JSON.stringify(Array.from({ length: 80 }, (_, index) => ({
        ...movie, id: index + 1, title: "A".repeat(200), addedAt: "2026-01-01T00:00:00.000Z",
      }))),
      watched: JSON.stringify([{ ...movie, watchedAt: "2026-01-01T00:00:00.000Z" }]),
    }));
    storage.byteLimit = storage.usedBytes;
  });

  it("removes a title with full storage without copying the old list", async () => {
    const before = storage.usedBytes;
    expect(await removeFromWatchlist(1, "movie")).toBe("ok");
    expect(getWatchlist()).toHaveLength(79);
    expect(getWatchlist().some((item) => item.id === 1)).toBe(false);
    expect(getWatched()).toHaveLength(1);
    expect(storage.usedBytes).toBeLessThan(before);
    expect(JSON.parse(storage.getItem("profile-data:bob")!)).not.toHaveProperty("watchlist");
  });

  it("frees its old storage when clearing and allows a new title afterwards", async () => {
    const before = storage.usedBytes;
    expect(await clearWatchlist()).toBe(true);
    expect(getWatchlist()).toEqual([]);
    expect(getWatched()).toHaveLength(1);
    expect(storage.usedBytes).toBeLessThan(before / 2);
    expect(await addToWatchlist(movie)).toBe("ok");
    expect(getWatchlist().map((item) => item.id)).toEqual([movie.id]);
  });
});

describe("addToWatchlist", () => {
  it("keeps both titles when another tab starts an add during the first read", async () => {
    storage.setItem(WATCHLIST_STORAGE_KEY, "[]");
    const read = storage.getItem.bind(storage);
    let second: Promise<"ok" | "duplicate" | "failed"> | undefined;
    vi.spyOn(storage, "getItem").mockImplementation((key) => {
      const value = read(key);
      if (key === WATCHLIST_STORAGE_KEY && !second) {
        second = addToWatchlist({ ...movie, id: 27205, title: "Inception" });
      }
      return value;
    });

    expect(await addToWatchlist(movie)).toBe("ok");
    expect(await second).toBe("ok");
    expect(getWatchlist().map((item) => item.id)).toEqual([27205, 550]);
  });

  it.each(["remove", "clear"] as const)(
    "retains another tab's %s instead of resurrecting its removed titles",
    async (operation) => {
      await addToWatchlist(movie);
      const read = storage.getItem.bind(storage);
      let second: Promise<unknown> | undefined;
      vi.spyOn(storage, "getItem").mockImplementation((key) => {
        const value = read(key);
        if (key === WATCHLIST_STORAGE_KEY && !second) {
          second = operation === "clear" ? clearWatchlist() : removeFromWatchlist(movie.id, "movie");
        }
        return value;
      });

      expect(await addToWatchlist({ ...movie, id: 27205, title: "Inception" })).toBe("ok");
      expect(await second).toBe(operation === "clear" ? true : "ok");
      expect(getWatchlist().map((item) => item.id)).toEqual(operation === "clear" ? [] : [27205]);
    },
  );

  it("retains the requested owner while waiting for another tab's lock", async () => {
    storage.setItem(PROFILE_STORAGE_OWNER_KEY, "default");
    storage.setItem("profiles", JSON.stringify([
      { id: "default", name: "Me" }, { id: "bob", name: "Bob" },
    ]));
    storage.setItem(WATCHLIST_STORAGE_KEY, "[]");
    storage.setItem(profileStoreKey(WATCHLIST_STORAGE_KEY, "bob"), "[]");
    let release!: () => void;
    const hold = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () =>
      new Promise<void>((resolve) => { release = resolve; }),
    );
    await Promise.resolve();
    const add = withProfileStorage("default", () => addToWatchlist(movie));
    storage.setItem("active-profile", "bob");
    expect(readDefaultIds()).toEqual([]);

    release();
    await hold;
    expect(await add).toBe("ok");
    expect(readDefaultIds()).toEqual([550]);
    expect(withProfileStorage("bob", getWatchlist)).toEqual([]);
  });

  it("rejects updates when the browser cannot coordinate writers", async () => {
    for (const locks of [undefined, { request: () => Promise.reject(new Error("Denied")) }]) {
      vi.stubGlobal("navigator", { locks });
      expect(await addToWatchlist(movie)).toBe("failed");
      expect(await removeFromWatchlist(movie.id, "movie")).toBe("failed");
      expect(await clearWatchlist()).toBe(false);
      expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    }
  });

  it("saves the title and says so", async () => {
    expect(await addToWatchlist(movie)).toBe("ok");
    expect(getWatchlist()).toHaveLength(1);
    expect(getWatchlist()[0].title).toBe("Fight Club");
  });

  it("tells a duplicate apart from a save", async () => {
    await addToWatchlist(movie);

    expect(await addToWatchlist(movie)).toBe("duplicate");
    expect(getWatchlist()).toHaveLength(1);
  });

  // The bug this replaced: a browser that stores nothing answered `true`, so the
  // UI reported a save that had not happened.
  it("reports a refused write rather than claiming success", async () => {
    storage.failOn.add(WATCHLIST_STORAGE_KEY);

    expect(await addToWatchlist(movie)).toBe("failed");
    expect(getWatchlist()).toEqual([]);
  });

  it("puts the newest title first", async () => {
    await addToWatchlist(movie);
    await addToWatchlist({ ...movie, id: 1396, title: "Breaking Bad" });

    expect(getWatchlist().map((item) => item.id)).toEqual([1396, 550]);
  });
});

function readDefaultIds(): number[] {
  return withProfileStorage("default", getWatchlist).map((item) => item.id);
}

describe("removeFromWatchlist", () => {
  it("removes the title and says so", async () => {
    await addToWatchlist(movie);

    expect(await removeFromWatchlist(550, "movie")).toBe("ok");
    expect(getWatchlist()).toEqual([]);
  });

  it("does not confuse the two media types", async () => {
    await addToWatchlist(movie);

    expect(await removeFromWatchlist(550, "tv")).toBe("ok");
    expect(getWatchlist()).toHaveLength(1);
  });

  it("reports a refused write", async () => {
    await addToWatchlist(movie);
    storage.failOn.add(WATCHLIST_STORAGE_KEY);

    expect(await removeFromWatchlist(550, "movie")).toBe("failed");
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
  it("empties the list and says the write went through", async () => {
    await addToWatchlist(movie);
    await addToWatchlist({ ...movie, id: 27205, title: "Inception" });

    expect(await clearWatchlist()).toBe(true);
    expect(getWatchlist()).toEqual([]);
    expect(storage.getItem(WATCHLIST_STORAGE_KEY)).toBe("[]");
  });

  it("reports a browser that refused the write", async () => {
    await addToWatchlist(movie);
    storage.failOn.add(WATCHLIST_STORAGE_KEY);

    expect(await clearWatchlist()).toBe(false);
    // Still there, which is exactly why the caller needs to be told.
    expect(getWatchlist()).toHaveLength(1);
  });
});
