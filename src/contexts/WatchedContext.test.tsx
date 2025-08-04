// @vitest-environment jsdom

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { WatchedProvider, useWatched } from "./WatchedContext";
import { WATCHED_STORAGE_KEY, type WatchedItem } from "@/lib/watched";
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
 * The history half of the pair, wrapped around the whole app next to the
 * watchlist.
 *
 * Two things here are easy to break and expensive to notice: the first render
 * has to match the empty HTML the static export shipped, and a title marked
 * watched in one tab has to reach the others. A third is specific to this one –
 * `isWatched` is called once per card on a listing page, over a history that
 * grows for the life of the browser.
 */

const wrapper = ({ children }: { children: ReactNode }) => (
  <WatchedProvider>{children}</WatchedProvider>
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

function storedItem(overrides: Partial<WatchedItem> = {}): WatchedItem {
  return {
    id: 27205,
    title: "Inception",
    mediaType: "movie",
    posterPath: "/inception.jpg",
    voteAverage: 8.4,
    releaseDate: "2010-07-16",
    watchedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function writeStorage(items: WatchedItem[]): void {
  window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(items));
}

async function holdRosterLock() {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
    enter();
    return new Promise<void>((resolve) => { release = resolve; });
  });
  await entered;
  return { holding, release: () => release() };
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("WatchedProvider", () => {
  it.each(["add", "remove", "clear"] as const)("waits for the shared lock and applies %s to the latest history", async (operation) => {
    writeStorage([storedItem({ id: 550 }), storedItem()]);
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const lock = await holdRosterLock();
    const requests = vi.spyOn(navigator.locks, "request");
    const pending = operation === "add" ? result.current.addItem(mediaItem({ id: 11 }))
      : operation === "remove" ? result.current.removeItem(550, "movie") : result.current.clearAll();
    await act(async () => {});

    expect(requests).toHaveBeenCalledWith(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, expect.any(Function));
    expect(result.current.watched.map((item) => item.id)).toEqual([550, 27205]);
    writeStorage([storedItem({ id: 550 }), storedItem(), storedItem({ id: 949 })]);

    await act(async () => {
      lock.release();
      await lock.holding;
      expect(await pending).toBe(operation === "clear" ? true : "ok");
    });

    const expected = operation === "add" ? [11, 550, 27205, 949]
      : operation === "remove" ? [27205, 949] : [];
    expect(result.current.watched.map((item) => item.id)).toEqual(expected);
    expect(JSON.parse(readProfileStore(WATCHED_STORAGE_KEY) ?? "[]").map((item: WatchedItem) => item.id))
      .toEqual(expected);
  });

  it("keeps the newly displayed owner after an older owner's queued edit finishes", async () => {
    writeStorage([storedItem({ id: 550 })]);
    writeProfileStore(WATCHED_STORAGE_KEY, JSON.stringify([storedItem({ id: 949 })]), "bob");
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const lock = await holdRosterLock();
    const pending = result.current.addItem(mediaItem({ id: 11 }));
    act(() => {
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });
    expect(result.current.profileId).toBe("bob");

    await act(async () => { lock.release(); await lock.holding; expect(await pending).toBe("ok"); });

    expect(result.current.profileId).toBe("bob");
    expect(result.current.watched.map((item) => item.id)).toEqual([949]);
    expect(JSON.parse(readProfileStore(WATCHED_STORAGE_KEY, "default")!).map((item: WatchedItem) => item.id))
      .toEqual([11, 550]);
  });

  it.each(["missing", "rejected"])("returns failures without changing history when the lock is %s", async (failure) => {
    writeStorage([storedItem({ id: 550 })]);
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const before = localStorage.getItem(WATCHED_STORAGE_KEY);
    vi.stubGlobal("navigator", failure === "missing" ? {} : {
      locks: { request: vi.fn().mockRejectedValue(new Error("Lock refused")) },
    });

    await act(async () => {
      expect(await result.current.addItem(mediaItem({ id: 11 }))).toBe("failed");
      expect(await result.current.removeItem(550, "movie")).toBe("failed");
      expect(await result.current.clearAll()).toBe(false);
    });

    expect(localStorage.getItem(WATCHED_STORAGE_KEY)).toBe(before);
    expect(result.current.watched.map((item) => item.id)).toEqual([550]);
  });

  it("refreshes a same-tab owner deletion and rejects callbacks retained from that owner", async () => {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "p2", name: "Second" },
    ]));
    writeProfileStore(WATCHED_STORAGE_KEY, JSON.stringify([storedItem()]), "p2");
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p2");
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.profileId).toBe("p2"));
    const retained = result.current;

    await act(async () => { expect(await switchProfile("default")).toBe(true); });
    expect(result.current.profileId).toBe("p2");
    await act(async () => { expect(await deleteProfile("p2")).toBe(true); });
    await act(async () => {
      expect(await retained.addItem(mediaItem())).toBe("failed");
      expect(await retained.clearAll()).toBe(false);
    });
    expect(readProfileStore(WATCHED_STORAGE_KEY, "p2")).toBeNull();
    expect(result.current.profileId).toBe("default");
    expect(result.current.watched).toEqual([]);
  });

  /**
   * The static export ships HTML with no history in it, so the first client
   * render has to agree – a provider that read storage during render would
   * disagree with that HTML on any browser holding a history. `isLoading` is
   * what lets the UI tell "not read yet" apart from "genuinely empty".
   */
  it("renders empty first, then hydrates from storage", async () => {
    writeStorage([storedItem()]);

    const seen: Array<{ isLoading: boolean; count: number }> = [];

    const { result } = renderHook(
      () => {
        const context = useWatched();
        seen.push({
          isLoading: context.isLoading,
          count: context.watched.length,
        });
        return context;
      },
      { wrapper },
    );

    expect(seen[0]).toEqual({ isLoading: true, count: 0 });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.watched).toHaveLength(1);
    expect(result.current.watched[0].title).toBe("Inception");
  });

  it("marks a title watched", async () => {
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      expect(await result.current.addItem(mediaItem())).toBe("ok");
    });

    expect(result.current.isWatched(550, "movie")).toBe(true);
  });

  it("names a title that is already on the list rather than adding it twice", async () => {
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addItem(mediaItem());
    });
    await act(async () => {
      expect(await result.current.addItem(mediaItem())).toBe("duplicate");
    });

    expect(result.current.watched).toHaveLength(1);
  });

  it("keeps a film and a series with the same id apart", async () => {
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addItem(mediaItem({ id: 550, media_type: "movie" }));
    });

    expect(result.current.isWatched(550, "movie")).toBe(true);
    expect(result.current.isWatched(550, "tv")).toBe(false);
  });

  it("removes a title", async () => {
    writeStorage([storedItem({ id: 550 })]);

    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      expect(await result.current.removeItem(550, "movie")).toBe("ok");
    });

    expect(result.current.isWatched(550, "movie")).toBe(false);
  });

  it("empties the whole history", async () => {
    writeStorage([storedItem(), storedItem({ id: 550 })]);

    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      expect(await result.current.clearAll()).toBe(true);
    });

    expect(result.current.watched).toEqual([]);
    expect(window.localStorage.getItem(WATCHED_STORAGE_KEY)).toBeNull();
  });

  /**
   * A `storage` event fires in every *other* tab with the app open. Without
   * this, a title ticked on the sofa leaves the tab on the laptop showing a
   * history that is one film out of date until it is reloaded.
   */
  it("picks up a change made in another tab", async () => {
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      writeStorage([storedItem({ id: 550, title: "Fight Club" })]);
      window.dispatchEvent(
        new StorageEvent("storage", { key: WATCHED_STORAGE_KEY }),
      );
    });

    expect(result.current.isWatched(550, "movie")).toBe(true);
  });

  it.each(["empty", "identical"] as const)(
    "updates the owner when another tab switches profiles with an %s history",
    async (history) => {
      const items = history === "empty" ? [] : [storedItem()];
      const raw = history === "empty" ? null : JSON.stringify(items);
      if (raw !== null) window.localStorage.setItem(WATCHED_STORAGE_KEY, raw);
      window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
        { id: "default", name: "Alice" }, { id: "bob", name: "Bob" },
      ]));
      window.localStorage.setItem("profile-data:bob", JSON.stringify(
        raw === null ? {} : { [WATCHED_STORAGE_KEY]: raw },
      ));
      const { result } = renderHook(() => useWatched(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.profileId).toBe("default");

      await act(async () => {
        expect(await switchProfile("bob")).toBe(true);
        // No history storage event is emitted when both raw values match.
        expect(window.localStorage.getItem(WATCHED_STORAGE_KEY)).toBe(raw);
        window.dispatchEvent(new StorageEvent("storage", {
          key: ACTIVE_PROFILE_STORAGE_KEY,
          newValue: "bob",
        }));
      });

      expect(result.current.profileId).toBe("bob");
      expect(result.current.watched).toEqual(items);
    },
  );

  // `key` is null when another tab cleared the whole store, which concerns this
  // list as much as a targeted write does.
  it("picks up another tab clearing everything", async () => {
    writeStorage([storedItem()]);

    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.watched).toHaveLength(1));

    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });

    expect(result.current.watched).toEqual([]);
  });

  it("ignores a storage event for somebody else's key", async () => {
    writeStorage([storedItem()]);

    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.watched).toHaveLength(1));

    const before = result.current.watched;

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "view-mode" }));
    });

    expect(result.current.watched).toBe(before);
  });

  it("survives a hand-edited store rather than taking the page down", async () => {
    window.localStorage.setItem(WATCHED_STORAGE_KEY, "{ not json");

    const { result } = renderHook(() => useWatched(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.watched).toEqual([]);
  });

  it("refuses to be used outside its provider", () => {
    expect(() => renderHook(() => useWatched())).toThrow(
      /must be used within a WatchedProvider/,
    );
  });

  it.each(["add", "remove", "clear"] as const)(
    "keeps a stale rendered profile's %s away from another profile before its event arrives",
    async (operation) => {
      writeStorage([storedItem({ id: 550 }), storedItem()]);
      const bobItems = [storedItem({ id: 550, title: "Bob's film" })];
      writeProfileStore(WATCHED_STORAGE_KEY, JSON.stringify(bobItems), "bob");
      const { result } = renderHook(() => useWatched(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      await act(async () => {
        expect(operation === "add"
          ? await result.current.addItem(mediaItem({ id: 11 }))
          : operation === "remove"
            ? await result.current.removeItem(550, "movie")
            : await result.current.clearAll()).toBe(operation === "clear" ? true : "ok");
      });

      expect(JSON.parse(readProfileStore(WATCHED_STORAGE_KEY, "bob")!)).toEqual(bobItems);
      const expectedIds = operation === "add" ? [11, 550, 27205]
        : operation === "remove" ? [27205] : [];
      expect(result.current.watched.map((item) => item.id)).toEqual(expectedIds);
      expect(result.current.profileId).toBe("default");
      expect(JSON.parse(readProfileStore(WATCHED_STORAGE_KEY, "default") ?? "[]")
        .map((item: WatchedItem) => item.id)).toEqual(expectedIds);
    },
  );

  it("keeps read, write, and refreshed state on one owner when the pointer switches mid-add", async () => {
    writeStorage([storedItem()]);
    const bobItems = [storedItem({ id: 550, title: "Bob's film" })];
    writeProfileStore(WATCHED_STORAGE_KEY, JSON.stringify(bobItems), "bob");
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const read = Storage.prototype.getItem;
    let switched = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = read.call(this, key);
      if (key === WATCHED_STORAGE_KEY && !switched) {
        switched = true;
        window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      }
      return value;
    });

    await act(async () => { expect(await result.current.addItem(mediaItem())).toBe("ok"); });

    expect(switched).toBe(true);
    expect(result.current.profileId).toBe("default");
    expect(result.current.watched.map((item) => item.id)).toEqual([550, 27205]);
    expect(JSON.parse(readProfileStore(WATCHED_STORAGE_KEY, "bob")!)).toEqual(bobItems);
  });

  it("keeps the current history on screen when clearing storage is refused", async () => {
    writeStorage([storedItem()]);
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.watched).toHaveLength(1));
    const before = result.current.watched;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    await act(async () => { expect(await result.current.clearAll()).toBe(false); });

    expect(result.current.watched).toBe(before);
    expect(result.current.profileId).toBe("default");
  });
});
