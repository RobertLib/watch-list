// @vitest-environment jsdom

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { WatchlistProvider, useWatchlist } from "./WatchlistContext";
import { WATCHLIST_STORAGE_KEY, type WatchlistItem } from "@/lib/watchlist";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  PROFILES_STORAGE_KEY,
  deleteProfile,
  switchProfile,
} from "@/lib/profiles";
import type { MediaItem } from "@/types/tmdb";
import { readProfileStore, writeProfileStore } from "@/lib/profile-storage";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";

/**
 * The provider that wraps the whole app, over a store that does not exist while
 * the page is being generated. Two things here are easy to break and expensive
 * to notice: the first render has to match the empty HTML the static export
 * shipped, and a write in one tab has to reach the others.
 */

const wrapper = ({ children }: { children: ReactNode }) => (
  <WatchlistProvider>{children}</WatchlistProvider>
);

function mediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 550,
    title: "Fight Club",
    overview: "An insomniac office worker…",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    release_date: "1999-10-15",
    vote_average: 8.4,
    vote_count: 27000,
    genre_ids: [18],
    media_type: "movie",
    ...overrides,
  };
}

function storedItem(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: 27205,
    title: "Inception",
    mediaType: "movie",
    posterPath: "/inception.jpg",
    voteAverage: 8.4,
    releaseDate: "2010-07-16",
    addedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function writeStorage(items: WatchlistItem[]): void {
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items));
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.cookie = "watchlist=;max-age=0;path=/";
});

describe("WatchlistProvider", () => {
  it("renders a pending cookie immediately without a late migration replacing the displayed profile", async () => {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "bob", name: "Bob" },
    ]));
    const legacy = [storedItem()];
    document.cookie = `watchlist=${encodeURIComponent(JSON.stringify(legacy))};path=/`;
    const bobItems = [storedItem({ id: 99, title: "Bob's film" })];
    writeProfileStore(WATCHLIST_STORAGE_KEY, JSON.stringify(bobItems), "bob");

    let release!: () => void;
    let entered!: () => void;
    const acquired = new Promise<void>((resolve) => { entered = resolve; });
    const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
      entered();
      return new Promise<void>((resolve) => { release = resolve; });
    });
    await acquired;
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    expect(result.current.watchlist).toEqual(legacy);
    expect(result.current.isLoading).toBe(false);
    expect(readProfileStore(WATCHLIST_STORAGE_KEY, "default")).toBeNull();

    act(() => {
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });
    await act(async () => {
      release();
      await holding;
    });
    await waitFor(() => expect(document.cookie).not.toContain("watchlist="));
    expect(result.current.profileId).toBe("bob");
    expect(result.current.watchlist).toEqual(bobItems);
    expect(JSON.parse(readProfileStore(WATCHLIST_STORAGE_KEY, "default")!)).toEqual(legacy);
  });

  it("does not replace a newer displayed profile when an older queued write completes", async () => {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "bob", name: "Bob" },
    ]));
    writeStorage([storedItem()]);
    const bobItems = [storedItem({ id: 99, title: "Bob's film" })];
    writeProfileStore(WATCHLIST_STORAGE_KEY, JSON.stringify(bobItems), "bob");
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    let release!: () => void;
    let entered!: () => void;
    const acquired = new Promise<void>((resolve) => { entered = resolve; });
    const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
      entered();
      return new Promise<void>((resolve) => { release = resolve; });
    });
    await acquired;
    const pending = result.current.addItem(mediaItem());

    act(() => {
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });
    expect(result.current.profileId).toBe("bob");

    await act(async () => {
      release();
      await holding;
      expect(await pending).toBe("ok");
    });
    expect(result.current.profileId).toBe("bob");
    expect(result.current.watchlist).toEqual(bobItems);
    expect(JSON.parse(readProfileStore(WATCHLIST_STORAGE_KEY, "default")!)
      .map((item: WatchlistItem) => item.id)).toEqual([550, 27205]);
  });

  it("refreshes a same-tab owner deletion and rejects callbacks retained from that owner", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "p2", name: "Second" },
    ]));
    writeProfileStore(WATCHLIST_STORAGE_KEY, JSON.stringify([storedItem()]), "p2");
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p2");
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    await waitFor(() => expect(result.current.profileId).toBe("p2"));
    const retained = result.current;

    await act(async () => { expect(await switchProfile("default")).toBe(true); });
    expect(result.current.profileId).toBe("p2");
    await act(async () => { expect(await deleteProfile("p2")).toBe(true); });
    await act(async () => {
      expect(await retained.addItem(mediaItem())).toBe("failed");
      expect(await retained.clearAll()).toBe(false);
    });
    expect(readProfileStore(WATCHLIST_STORAGE_KEY, "p2")).toBeNull();
    expect(result.current.profileId).toBe("default");
    expect(result.current.watchlist).toEqual([]);
  });

  /**
   * The hydration contract, and the reason the read is in an effect rather than
   * a lazy initialiser. Storage does not exist while the page is generated, so
   * the export ships an empty list – and a first client render that already
   * knows about three saved films disagrees with that HTML. `isLoading` is what
   * lets the UI tell "not read yet" apart from "genuinely empty".
   */
  it("renders empty first, then hydrates from storage", async () => {
    writeStorage([storedItem()]);

    const seen: Array<{ isLoading: boolean; count: number }> = [];

    const { result } = renderHook(
      () => {
        const context = useWatchlist();
        seen.push({
          isLoading: context.isLoading,
          count: context.watchlist.length,
        });
        return context;
      },
      { wrapper },
    );

    expect(seen[0]).toEqual({ isLoading: true, count: 0 });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.watchlist).toHaveLength(1);
    expect(result.current.watchlist[0].title).toBe("Inception");
  });

  it("adds a title and answers isInWatchlist for it", async () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isInWatchlist(550, "movie")).toBe(false);

    await act(async () => {
      expect(await result.current.addItem(mediaItem())).toBe("ok");
    });

    expect(result.current.watchlist).toHaveLength(1);
    expect(result.current.isInWatchlist(550, "movie")).toBe(true);
  });

  /**
   * The id alone is not the identity. TMDB numbers films and series separately,
   * so movie 550 and series 550 are different titles – keying on the id would
   * make adding one look like a duplicate of the other.
   */
  it("keeps a film and a series with the same id apart", async () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addItem(mediaItem({ id: 550, media_type: "movie" }));
    });
    await act(async () => {
      expect(
        await result.current.addItem(mediaItem({ id: 550, media_type: "tv" })),
      ).toBe("ok");
    });

    expect(result.current.watchlist).toHaveLength(2);
    expect(result.current.isInWatchlist(550, "tv")).toBe(true);
  });

  it("reports a second add of the same title as a duplicate", async () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addItem(mediaItem());
    });
    await act(async () => {
      expect(await result.current.addItem(mediaItem())).toBe("duplicate");
    });

    expect(result.current.watchlist).toHaveLength(1);
  });

  it("removes a title", async () => {
    writeStorage([storedItem({ id: 550, mediaType: "movie" })]);

    const { result } = renderHook(() => useWatchlist(), { wrapper });

    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      expect(await result.current.removeItem(550, "movie")).toBe("ok");
    });

    expect(result.current.watchlist).toHaveLength(0);
    expect(result.current.isInWatchlist(550, "movie")).toBe(false);
  });

  /**
   * `storage` fires in every *other* tab, which is the only notice a second tab
   * gets that the list moved. Without this the two disagree until one is
   * reloaded – and the stale one will happily write its old list back over the
   * new one.
   */
  it("picks up a write from another tab", async () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.watchlist).toHaveLength(0);

    act(() => {
      writeStorage([storedItem()]);
      window.dispatchEvent(
        new StorageEvent("storage", { key: WATCHLIST_STORAGE_KEY }),
      );
    });

    expect(result.current.watchlist).toHaveLength(1);
    expect(result.current.isInWatchlist(27205, "movie")).toBe(true);
  });

  it.each(["empty", "identical"] as const)(
    "updates the owner when another tab switches profiles with an %s watchlist",
    async (list) => {
      const items = list === "empty" ? [] : [storedItem()];
      const raw = list === "empty" ? null : JSON.stringify(items);
      if (raw !== null) window.localStorage.setItem(WATCHLIST_STORAGE_KEY, raw);
      window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
        { id: "default", name: "Alice" }, { id: "bob", name: "Bob" },
      ]));
      window.localStorage.setItem("profile-data:bob", JSON.stringify(
        raw === null ? {} : { [WATCHLIST_STORAGE_KEY]: raw },
      ));
      const { result } = renderHook(() => useWatchlist(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.profileId).toBe("default");

      await act(async () => {
        expect(await switchProfile("bob")).toBe(true);
        // Identical values cause no watchlist storage event. The changed
        // active profile must still refresh the loaded list's owner.
        expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe(raw);
        window.dispatchEvent(new StorageEvent("storage", {
          key: ACTIVE_PROFILE_STORAGE_KEY,
          newValue: "bob",
        }));
      });

      expect(result.current.profileId).toBe("bob");
      expect(result.current.watchlist).toEqual(items);
    },
  );

  /**
   * A null key means the whole of storage was cleared – which concerns this list
   * as much as a targeted write does, and reads as "unrelated key" to a naive
   * comparison.
   */
  it("treats a cleared storage as concerning it", async () => {
    writeStorage([storedItem()]);

    const { result } = renderHook(() => useWatchlist(), { wrapper });

    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });

    expect(result.current.watchlist).toHaveLength(0);
  });

  /**
   * The clear-everything button. It used to remove the titles one at a time,
   * which re-read, parsed, sanitised, serialised and wrote the whole list once
   * per entry – and reported nothing when one of those writes was refused.
   *
   * Spied on `Storage.prototype` rather than on the instance: jsdom's
   * `localStorage` is a proxy, and an own property set on it is not what the
   * lookup finds.
   */
  it("empties the list in a single write", async () => {
    writeStorage([
      storedItem({ id: 1 }),
      storedItem({ id: 2 }),
      storedItem({ id: 3 }),
    ]);

    const { result } = renderHook(() => useWatchlist(), { wrapper });
    await waitFor(() => expect(result.current.watchlist).toHaveLength(3));

    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await act(async () => {
      expect(await result.current.clearAll()).toBe(true);
    });

    expect(result.current.watchlist).toHaveLength(0);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe("[]");
    expect(setItem.mock.calls.filter(([key]) => key === WATCHLIST_STORAGE_KEY))
      .toEqual([[WATCHLIST_STORAGE_KEY, "[]"]]);
  });

  it("keeps the titles on screen when the browser refuses the clear", async () => {
    writeStorage([storedItem()]);

    const { result } = renderHook(() => useWatchlist(), { wrapper });
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    await act(async () => {
      expect(await result.current.clearAll()).toBe(false);
    });

    // Emptying the screen here would show a list the next reload contradicts.
    expect(result.current.watchlist).toHaveLength(1);
  });

  it("ignores a write to a store it does not own", async () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      // The watchlist key does change, so a listener that ignored `key` entirely
      // would still pass the assertion below by accident – it is the event
      // naming another store that has to be filtered out.
      writeStorage([storedItem()]);
      window.dispatchEvent(new StorageEvent("storage", { key: "ratings" }));
    });

    expect(result.current.watchlist).toHaveLength(0);
  });

  it.each(["add", "remove", "clear"] as const)(
    "keeps a stale rendered profile's %s away from another profile before its event arrives",
    async (operation) => {
      writeStorage([storedItem({ id: 550 }), storedItem()]);
      const bobItems = [storedItem({ id: 550, title: "Bob's film" })];
      writeProfileStore(WATCHLIST_STORAGE_KEY, JSON.stringify(bobItems), "bob");
      const { result } = renderHook(() => useWatchlist(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      await act(async () => {
        expect(operation === "add"
          ? await result.current.addItem(mediaItem({ id: 11 }))
          : operation === "remove"
            ? await result.current.removeItem(550, "movie")
            : await result.current.clearAll()).toBe(operation === "clear" ? true : "ok");
      });

      expect(JSON.parse(readProfileStore(WATCHLIST_STORAGE_KEY, "bob")!)).toEqual(bobItems);
      const expectedIds = operation === "add" ? [11, 550, 27205]
        : operation === "remove" ? [27205] : [];
      expect(result.current.watchlist.map((item) => item.id)).toEqual(expectedIds);
      expect(result.current.profileId).toBe("default");
      expect(JSON.parse(readProfileStore(WATCHLIST_STORAGE_KEY, "default") ?? "[]")
        .map((item: WatchlistItem) => item.id)).toEqual(expectedIds);
    },
  );

  it("keeps read, write, and refreshed state on one owner when the pointer switches mid-add", async () => {
    writeStorage([storedItem()]);
    const bobItems = [storedItem({ id: 550, title: "Bob's film" })];
    writeProfileStore(WATCHLIST_STORAGE_KEY, JSON.stringify(bobItems), "bob");
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const read = Storage.prototype.getItem;
    let switched = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = read.call(this, key);
      if (key === WATCHLIST_STORAGE_KEY && !switched) {
        switched = true;
        window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      }
      return value;
    });

    await act(async () => { expect(await result.current.addItem(mediaItem())).toBe("ok"); });

    expect(switched).toBe(true);
    expect(result.current.profileId).toBe("default");
    expect(result.current.watchlist.map((item) => item.id)).toEqual([550, 27205]);
    expect(JSON.parse(readProfileStore(WATCHLIST_STORAGE_KEY, "bob")!)).toEqual(bobItems);
  });

  it("refreshes namespaced writes for the active profile", async () => {
    writeProfileStore(WATCHLIST_STORAGE_KEY, "[]", "bob");
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    const { result } = renderHook(() => useWatchlist(), { wrapper });
    await waitFor(() => expect(result.current.profileId).toBe("bob"));

    act(() => {
      writeProfileStore(WATCHLIST_STORAGE_KEY, JSON.stringify([storedItem()]), "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: "profile-store:bob:watchlist" }));
    });

    expect(result.current.watchlist.map((item) => item.id)).toEqual([27205]);
    expect(result.current.profileId).toBe("bob");
  });
});

describe("useWatchlist", () => {
  /**
   * Thrown rather than answered with an empty list: a component rendered outside
   * the provider would otherwise show every title as unsaved and silently drop
   * every click that tried to save one.
   */
  it("refuses to work outside its provider", () => {
    expect(() => renderHook(() => useWatchlist())).toThrow(
      /within a WatchlistProvider/,
    );
  });
});
