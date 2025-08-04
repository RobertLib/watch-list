// @vitest-environment jsdom

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { WatchlistProvider, useWatchlist } from "./WatchlistContext";
import { WATCHLIST_STORAGE_KEY, type WatchlistItem } from "@/lib/watchlist";
import type { MediaItem } from "@/types/tmdb";

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("WatchlistProvider", () => {
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

    act(() => {
      expect(result.current.addItem(mediaItem())).toBe("ok");
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

    act(() => {
      result.current.addItem(mediaItem({ id: 550, media_type: "movie" }));
    });
    act(() => {
      expect(
        result.current.addItem(mediaItem({ id: 550, media_type: "tv" })),
      ).toBe("ok");
    });

    expect(result.current.watchlist).toHaveLength(2);
    expect(result.current.isInWatchlist(550, "tv")).toBe(true);
  });

  it("reports a second add of the same title as a duplicate", async () => {
    const { result } = renderHook(() => useWatchlist(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addItem(mediaItem());
    });
    act(() => {
      expect(result.current.addItem(mediaItem())).toBe("duplicate");
    });

    expect(result.current.watchlist).toHaveLength(1);
  });

  it("removes a title", async () => {
    writeStorage([storedItem({ id: 550, mediaType: "movie" })]);

    const { result } = renderHook(() => useWatchlist(), { wrapper });

    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    act(() => {
      expect(result.current.removeItem(550, "movie")).toBe("ok");
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

    act(() => {
      expect(result.current.clearAll()).toBe(true);
    });

    expect(result.current.watchlist).toHaveLength(0);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBeNull();
    // Removed, not rewritten – and certainly not rewritten once per title.
    expect(setItem).not.toHaveBeenCalled();
  });

  it("keeps the titles on screen when the browser refuses the clear", async () => {
    writeStorage([storedItem()]);

    const { result } = renderHook(() => useWatchlist(), { wrapper });
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    act(() => {
      expect(result.current.clearAll()).toBe(false);
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
