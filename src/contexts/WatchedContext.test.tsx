// @vitest-environment jsdom

import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { WatchedProvider, useWatched } from "./WatchedContext";
import { WATCHED_STORAGE_KEY, type WatchedItem } from "@/lib/watched";
import type { MediaItem } from "@/types/tmdb";

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

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("WatchedProvider", () => {
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

    act(() => {
      expect(result.current.addItem(mediaItem())).toBe("ok");
    });

    expect(result.current.isWatched(550, "movie")).toBe(true);
  });

  it("names a title that is already on the list rather than adding it twice", async () => {
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addItem(mediaItem());
    });
    act(() => {
      expect(result.current.addItem(mediaItem())).toBe("duplicate");
    });

    expect(result.current.watched).toHaveLength(1);
  });

  it("keeps a film and a series with the same id apart", async () => {
    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.addItem(mediaItem({ id: 550, media_type: "movie" }));
    });

    expect(result.current.isWatched(550, "movie")).toBe(true);
    expect(result.current.isWatched(550, "tv")).toBe(false);
  });

  it("removes a title", async () => {
    writeStorage([storedItem({ id: 550 })]);

    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      expect(result.current.removeItem(550, "movie")).toBe("ok");
    });

    expect(result.current.isWatched(550, "movie")).toBe(false);
  });

  it("empties the whole history", async () => {
    writeStorage([storedItem(), storedItem({ id: 550 })]);

    const { result } = renderHook(() => useWatched(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      expect(result.current.clearAll()).toBe(true);
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
});
