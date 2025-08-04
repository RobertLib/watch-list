// @vitest-environment jsdom

import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  EpisodeProgressProvider,
  useEpisodeProgress,
} from "./EpisodeProgressContext";
import {
  EPISODE_PROGRESS_STORAGE_KEY,
  type EpisodeProgress,
  type ShowRef,
} from "@/lib/episode-progress";

/**
 * Episode ticks, which are the only store in the app that a *derived* feature
 * depends on: "Continue Watching" reads the order of `shows` and the gaps in
 * `seasons` to work out what to play next.
 *
 * The write path deserves its own note. Storage is written *first*, and state
 * adopts the new map only if the browser took the write. It used to be the
 * other way round – the write sat inside the `setState` updater, which runs
 * during render and twice under StrictMode, and its result was discarded – so a
 * refused write still showed the tick on screen, to vanish on the next reload.
 */

const wrapper = ({ children }: { children: ReactNode }) => (
  <EpisodeProgressProvider>{children}</EpisodeProgressProvider>
);

const BREAKING_BAD: ShowRef = {
  tvId: 1396,
  name: "Breaking Bad",
  posterPath: "/breaking-bad.jpg",
};

const THE_WIRE: ShowRef = {
  tvId: 1438,
  name: "The Wire",
  posterPath: "/the-wire.jpg",
};

function writeStorage(progress: EpisodeProgress): void {
  window.localStorage.setItem(
    EPISODE_PROGRESS_STORAGE_KEY,
    JSON.stringify(progress),
  );
}

function stored(): EpisodeProgress {
  const raw = window.localStorage.getItem(EPISODE_PROGRESS_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as EpisodeProgress) : {};
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("EpisodeProgressProvider", () => {
  it("renders empty first, then hydrates from storage", async () => {
    writeStorage({
      "1396": {
        ...BREAKING_BAD,
        seasons: { "1": [1, 2] },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const seen: Array<{ isLoading: boolean; count: number }> = [];

    const { result } = renderHook(
      () => {
        const context = useEpisodeProgress();
        seen.push({
          isLoading: context.isLoading,
          count: context.shows.length,
        });
        return context;
      },
      { wrapper },
    );

    expect(seen[0]).toEqual({ isLoading: true, count: 0 });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.watchedCount(1396)).toBe(2);
  });

  it("ticks an episode and unticks it again", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleEpisode(BREAKING_BAD, 1, 3));
    expect(result.current.isEpisodeWatched(1396, 1, 3)).toBe(true);

    act(() => result.current.toggleEpisode(BREAKING_BAD, 1, 3));
    expect(result.current.isEpisodeWatched(1396, 1, 3)).toBe(false);
  });

  it("persists the same map it put into state", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleEpisode(BREAKING_BAD, 1, 1));

    expect(stored()).toEqual(result.current.progress);
  });

  /**
   * A full quota, or a private window that stores nothing. The tick must not
   * appear on screen when it was not saved – it would vanish on the next
   * reload, after the visitor had moved on believing it was recorded – and the
   * caller has to be told so it can say so.
   */
  it("keeps the old map and answers false when storage refuses the write", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleEpisode(BREAKING_BAD, 1, 1));
    const before = result.current.progress;

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    let outcome: boolean | undefined;
    act(() => {
      outcome = result.current.toggleEpisode(BREAKING_BAD, 1, 2);
    });

    expect(outcome).toBe(false);
    expect(result.current.progress).toBe(before);
    expect(result.current.isEpisodeWatched(1396, 1, 2)).toBe(false);
  });

  it("answers true for a write the browser took", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome: boolean | undefined;
    act(() => {
      outcome = result.current.toggleEpisode(BREAKING_BAD, 1, 1);
    });

    expect(outcome).toBe(true);
  });

  /**
   * The write no longer runs inside the updater, so React re-running the
   * updater – as StrictMode does on purpose – cannot write storage twice or
   * flip a toggle back. Asserted directly: one tick, one write.
   */
  it("writes storage once per tick under StrictMode", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const strictWrapper = ({ children }: { children: ReactNode }) => (
      <React.StrictMode>
        <EpisodeProgressProvider>{children}</EpisodeProgressProvider>
      </React.StrictMode>
    );

    const { result } = renderHook(() => useEpisodeProgress(), {
      wrapper: strictWrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    setItem.mockClear();

    act(() => result.current.toggleEpisode(BREAKING_BAD, 1, 1));

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(result.current.isEpisodeWatched(1396, 1, 1)).toBe(true);
  });

  it("ticks and clears a whole season", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() =>
      result.current.setSeasonWatched(BREAKING_BAD, 1, [1, 2, 3], true),
    );
    expect(result.current.watchedInSeason(1396, 1)).toEqual([1, 2, 3]);

    act(() =>
      result.current.setSeasonWatched(BREAKING_BAD, 1, [1, 2, 3], false),
    );
    expect(result.current.watchedInSeason(1396, 1)).toEqual([]);
  });

  /**
   * The gap is the feature. Someone who skips an episode leaves one, and it is
   * exactly what "up next" has to find – so the store must keep the ticks
   * sparse rather than collapsing them to a count.
   */
  it("keeps a skipped episode as a gap", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.toggleEpisode(BREAKING_BAD, 1, 1);
      result.current.toggleEpisode(BREAKING_BAD, 1, 3);
    });

    expect(result.current.watchedInSeason(1396, 1)).toEqual([1, 3]);
  });

  // The "Continue Watching" row wants the show someone last ticked at the front.
  it("orders shows by most recent activity", async () => {
    writeStorage({
      "1396": {
        ...BREAKING_BAD,
        seasons: { "1": [1] },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      "1438": {
        ...THE_WIRE,
        seasons: { "1": [1] },
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    });

    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.shows.map((show) => show.tvId)).toEqual([1438, 1396]);

    act(() => result.current.toggleEpisode(BREAKING_BAD, 1, 2));

    expect(result.current.shows[0].tvId).toBe(1396);
  });

  // Un-ticking the last episode has to clean up after itself, or the row keeps
  // offering a show with nothing watched in it.
  it("drops a show once nothing in it is ticked", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleEpisode(BREAKING_BAD, 1, 1));
    expect(result.current.shows).toHaveLength(1);

    act(() => result.current.toggleEpisode(BREAKING_BAD, 1, 1));
    expect(result.current.shows).toHaveLength(0);
  });

  it("forgets one show without touching the others", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.toggleEpisode(BREAKING_BAD, 1, 1);
      result.current.toggleEpisode(THE_WIRE, 1, 1);
    });

    act(() => result.current.removeShow(1396));

    expect(result.current.shows.map((show) => show.tvId)).toEqual([1438]);
  });

  it("empties everything", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleEpisode(BREAKING_BAD, 1, 1));
    act(() => result.current.clearAll());

    expect(result.current.shows).toEqual([]);
    expect(stored()).toEqual({});
  });

  it("picks up a change made in another tab", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      writeStorage({
        "1396": {
          ...BREAKING_BAD,
          seasons: { "1": [1, 2, 3] },
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
      });
      window.dispatchEvent(
        new StorageEvent("storage", { key: EPISODE_PROGRESS_STORAGE_KEY }),
      );
    });

    expect(result.current.watchedCount(1396)).toBe(3);
  });

  it("ignores a storage event for somebody else's key", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const before = result.current.progress;

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "view-mode" }));
    });

    expect(result.current.progress).toBe(before);
  });

  it("survives a hand-edited store rather than taking the page down", async () => {
    window.localStorage.setItem(EPISODE_PROGRESS_STORAGE_KEY, "{ not json");

    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.shows).toEqual([]);
  });

  it("refuses to be used outside its provider", () => {
    expect(() => renderHook(() => useEpisodeProgress())).toThrow(
      /must be used within an EpisodeProgressProvider/,
    );
  });
});
