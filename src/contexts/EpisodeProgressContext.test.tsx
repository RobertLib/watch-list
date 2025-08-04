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
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  PROFILES_STORAGE_KEY,
  deleteProfile,
  switchProfile,
} from "@/lib/profiles";
import { readProfileStore, writeProfileStore } from "@/lib/profile-storage";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { refuseNextLocalStorageRead } from "@/test/storage-faults";

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

async function holdProfileLock() {
  const locks = createProfileLockManager();
  vi.stubGlobal("navigator", { locks });
  let release!: () => void;
  let entered!: () => void;
  const acquired = new Promise<void>((resolve) => { entered = resolve; });
  const held = locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, async () => {
    entered();
    await new Promise<void>((resolve) => { release = resolve; });
  });
  await acquired;
  return { release, held };
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

describe("EpisodeProgressProvider", () => {
  it.each(["toggle", "season", "remove"] as const)(
    "preserves saved progress when the first read for %s fails, then retries safely",
    async (operation) => {
      const initial = {
        "1396": { ...BREAKING_BAD, seasons: { "1": [1] }, updatedAt: "2026-01-01" },
        "1438": { ...THE_WIRE, seasons: { "1": [5] }, updatedAt: "2026-01-01" },
      };
      writeStorage(initial);
      const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const before = result.current.progress;
      const { release, held } = await holdProfileLock();
      const apply = () => operation === "toggle"
        ? result.current.toggleEpisode(BREAKING_BAD, 1, 2)
        : operation === "season"
          ? result.current.setSeasonWatched(BREAKING_BAD, 1, [2, 3], true)
          : result.current.removeShow(1396);
      const pending = apply();
      refuseNextLocalStorageRead(EPISODE_PROGRESS_STORAGE_KEY);

      await act(async () => {
        release();
        await held;
        expect(await pending).toBe(false);
      });

      expect(stored()).toEqual(initial);
      expect(result.current.progress).toBe(before);
      await act(async () => { expect(await apply()).toBe(true); });
      expect(stored()["1438"]).toEqual(initial["1438"]);
      expect(stored()["1396"]?.seasons["1"]).toEqual(
        operation === "toggle" ? [1, 2] : operation === "season" ? [1, 2, 3] : undefined,
      );
    },
  );

  it.each(["toggle", "season", "remove", "clear"] as const)(
    "waits for another edit and applies %s to the latest progress",
    async (operation) => {
      writeStorage({
        "1396": { ...BREAKING_BAD, seasons: { "1": [1] }, updatedAt: "2026-01-01" },
      });
      const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const { release, held } = await holdProfileLock();
      const before = result.current.progress;
      let pending!: Promise<boolean>;
      act(() => {
        pending = operation === "toggle"
          ? result.current.toggleEpisode(BREAKING_BAD, 1, 3)
          : operation === "season"
            ? result.current.setSeasonWatched(BREAKING_BAD, 1, [3, 4], true)
            : operation === "remove"
              ? result.current.removeShow(1396)
              : result.current.clearAll();
      });
      expect(result.current.progress).toBe(before);
      expect(stored()["1396"].seasons["1"]).toEqual([1]);

      // The holder represents a write in another tab or a backup restore.
      writeStorage({
        "1396": { ...BREAKING_BAD, seasons: { "1": [1, 2] }, updatedAt: "2026-01-01" },
        "1438": { ...THE_WIRE, seasons: { "1": [5] }, updatedAt: "2026-01-01" },
      });
      release();
      await act(async () => {
        await held;
        expect(await pending).toBe(true);
      });

      expect(stored()["1396"]?.seasons["1"]).toEqual(
        operation === "toggle" ? [1, 2, 3] : operation === "season" ? [1, 2, 3, 4] : undefined,
      );
      expect(stored()["1438"]?.seasons["1"]).toEqual(operation === "clear" ? undefined : [5]);
      expect(result.current.progress).toEqual(stored());
    },
  );

  it("preserves both simultaneous edits from independent providers", async () => {
    const first = renderHook(() => useEpisodeProgress(), { wrapper });
    const second = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(first.result.current.isLoading || second.result.current.isLoading).toBe(false));

    await act(async () => {
      expect(await Promise.all([
        first.result.current.toggleEpisode(BREAKING_BAD, 1, 1),
        second.result.current.toggleEpisode(BREAKING_BAD, 1, 2),
      ])).toEqual([true, true]);
    });

    expect(stored()["1396"].seasons["1"]).toEqual([1, 2]);
  });

  it("keeps a queued old-owner write out of the refreshed profile's state", async () => {
    writeProfileStore(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify({
      "1438": { ...THE_WIRE, seasons: { "1": [5] }, updatedAt: "2026-01-01" },
    }), "bob");
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const { release, held } = await holdProfileLock();
    const pending = result.current.toggleEpisode(BREAKING_BAD, 1, 1);
    act(() => {
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });
    expect(result.current.profileId).toBe("bob");
    const incoming = result.current.progress;

    release();
    await act(async () => {
      await held;
      expect(await pending).toBe(true);
    });

    expect(result.current.profileId).toBe("bob");
    expect(result.current.progress).toBe(incoming);
    expect(JSON.parse(readProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "default")!)["1396"].seasons["1"]).toEqual([1]);
  });

  it.each(["missing", "rejected"] as const)(
    "refuses edits when the shared browser lock is %s",
    async (failure) => {
      const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      vi.stubGlobal("navigator", failure === "missing" ? {} : {
        locks: { request: vi.fn().mockRejectedValue(new Error("Lock refused")) },
      });
      const before = result.current.progress;

      await act(async () => {
        expect(await result.current.toggleEpisode(BREAKING_BAD, 1, 1)).toBe(false);
        expect(await result.current.clearAll()).toBe(false);
      });

      expect(stored()).toEqual({});
      expect(result.current.progress).toBe(before);
    },
  );

  it("refreshes a same-tab owner deletion and rejects callbacks retained from that owner", async () => {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "p2", name: "Second" },
    ]));
    writeProfileStore(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify({
      "1396": { ...BREAKING_BAD, seasons: { "1": [1] }, updatedAt: "2026-01-01" },
    }), "p2");
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "p2");
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.profileId).toBe("p2"));
    const retained = result.current;

    await act(async () => { expect(await switchProfile("default")).toBe(true); });
    expect(result.current.profileId).toBe("p2");
    await act(async () => { expect(await deleteProfile("p2")).toBe(true); });
    await act(async () => {
      expect(await retained.toggleEpisode(BREAKING_BAD, 1, 2)).toBe(false);
      expect(await retained.clearAll()).toBe(false);
    });
    expect(readProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "p2")).toBeNull();
    expect(result.current.profileId).toBe("default");
    expect(result.current.progress).toEqual({});
  });

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

    await act(async () => { await result.current.toggleEpisode(BREAKING_BAD, 1, 3); });
    expect(result.current.isEpisodeWatched(1396, 1, 3)).toBe(true);

    await act(async () => { await result.current.toggleEpisode(BREAKING_BAD, 1, 3); });
    expect(result.current.isEpisodeWatched(1396, 1, 3)).toBe(false);
  });

  it("persists the same map it put into state", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.toggleEpisode(BREAKING_BAD, 1, 1); });

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

    await act(async () => { await result.current.toggleEpisode(BREAKING_BAD, 1, 1); });
    const before = result.current.progress;

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.toggleEpisode(BREAKING_BAD, 1, 2);
    });

    expect(outcome).toBe(false);
    expect(result.current.progress).toBe(before);
    expect(result.current.isEpisodeWatched(1396, 1, 2)).toBe(false);
  });

  it("answers true for a write the browser took", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.toggleEpisode(BREAKING_BAD, 1, 1);
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

    await act(async () => { await result.current.toggleEpisode(BREAKING_BAD, 1, 1); });

    expect(setItem.mock.calls.filter(([key]) => key === EPISODE_PROGRESS_STORAGE_KEY)).toHaveLength(1);
    expect(result.current.isEpisodeWatched(1396, 1, 1)).toBe(true);
  });

  it("ticks and clears a whole season", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.setSeasonWatched(BREAKING_BAD, 1, [1, 2, 3], true); });
    expect(result.current.watchedInSeason(1396, 1)).toEqual([1, 2, 3]);

    await act(async () => { await result.current.setSeasonWatched(BREAKING_BAD, 1, [1, 2, 3], false); });
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

    await act(async () => {
      await result.current.toggleEpisode(BREAKING_BAD, 1, 1);
      await result.current.toggleEpisode(BREAKING_BAD, 1, 3);
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

    await act(async () => { await result.current.toggleEpisode(BREAKING_BAD, 1, 2); });

    expect(result.current.shows[0].tvId).toBe(1396);
  });

  // Un-ticking the last episode has to clean up after itself, or the row keeps
  // offering a show with nothing watched in it.
  it("drops a show once nothing in it is ticked", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.toggleEpisode(BREAKING_BAD, 1, 1); });
    expect(result.current.shows).toHaveLength(1);

    await act(async () => { await result.current.toggleEpisode(BREAKING_BAD, 1, 1); });
    expect(result.current.shows).toHaveLength(0);
  });

  it("forgets one show without touching the others", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleEpisode(BREAKING_BAD, 1, 1);
      await result.current.toggleEpisode(THE_WIRE, 1, 1);
    });

    await act(async () => { await result.current.removeShow(1396); });

    expect(result.current.shows.map((show) => show.tvId)).toEqual([1438]);
  });

  it("empties everything", async () => {
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.toggleEpisode(BREAKING_BAD, 1, 1); });
    await act(async () => { await result.current.clearAll(); });

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

  it.each(["empty", "identical"] as const)(
    "updates the owner when another tab switches profiles with %s progress",
    async (state) => {
      const progress: EpisodeProgress = state === "empty" ? {} : {
        "1396": {
          ...BREAKING_BAD,
          seasons: { "1": [1] },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      };
      const raw = state === "empty" ? null : JSON.stringify(progress);
      if (raw !== null) window.localStorage.setItem(EPISODE_PROGRESS_STORAGE_KEY, raw);
      window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
        { id: "default", name: "Alice" }, { id: "bob", name: "Bob" },
      ]));
      window.localStorage.setItem("profile-data:bob", JSON.stringify(
        raw === null ? {} : { [EPISODE_PROGRESS_STORAGE_KEY]: raw },
      ));
      const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.profileId).toBe("default");

      await act(async () => {
        expect(await switchProfile("bob")).toBe(true);
        // Only the active profile changes: absent or byte-identical progress
        // produces no episode-progress event for this tab to hear.
        expect(window.localStorage.getItem(EPISODE_PROGRESS_STORAGE_KEY)).toBe(raw);
        window.dispatchEvent(new StorageEvent("storage", {
          key: ACTIVE_PROFILE_STORAGE_KEY,
          newValue: "bob",
        }));
      });

      expect(result.current.profileId).toBe("bob");
      expect(result.current.progress).toEqual(progress);
    },
  );

  it.each(["toggle", "season", "remove"] as const)(
    "preserves another tab's saved ticks before its storage event arrives (%s)",
    async (change) => {
      writeStorage({
        "1396": {
          ...BREAKING_BAD,
          seasons: { "1": [1] },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        "1438": {
          ...THE_WIRE,
          seasons: { "1": [1] },
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      });
      const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const latest = stored();
      latest["1396"].seasons["1"] = [1, 2];
      latest["1438"].seasons["1"] = [1, 2];
      // Storage is shared immediately, while the event notifying this tab is
      // still queued. Deliberately do not dispatch it before the local change.
      writeStorage(latest);

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = change === "toggle"
          ? await result.current.toggleEpisode(BREAKING_BAD, 1, 3)
          : change === "season"
            ? await result.current.setSeasonWatched(BREAKING_BAD, 1, [3, 4], true)
            : await result.current.removeShow(1396);
      });

      expect(outcome).toBe(true);
      expect(stored()["1438"]).toEqual(latest["1438"]);
      expect(stored()["1396"]?.seasons["1"]).toEqual(
        change === "remove" ? undefined : change === "toggle" ? [1, 2, 3] : [1, 2, 3, 4],
      );
      expect(result.current.progress).toEqual(stored());
    },
  );

  it("does not resurrect ticks another tab cleared before its storage event arrives", async () => {
    writeStorage({
      "1396": {
        ...BREAKING_BAD,
        seasons: { "1": [1] },
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    window.localStorage.removeItem(EPISODE_PROGRESS_STORAGE_KEY);
    await act(async () => { await result.current.toggleEpisode(BREAKING_BAD, 1, 2); });

    expect(stored()["1396"].seasons["1"]).toEqual([2]);
    expect(result.current.progress).toEqual(stored());
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

  it.each(["toggle", "season", "remove", "clear"] as const)(
    "binds a stale rendered profile's %s to its own progress",
    async (operation) => {
      const alice: EpisodeProgress = {
        "1396": { ...BREAKING_BAD, seasons: { "1": [1] }, updatedAt: "2026-01-01T00:00:00.000Z" },
      };
      const bob: EpisodeProgress = {
        "1438": { ...THE_WIRE, seasons: { "1": [5] }, updatedAt: "2026-01-01T00:00:00.000Z" },
      };
      writeStorage(alice);
      writeProfileStore(EPISODE_PROGRESS_STORAGE_KEY, JSON.stringify(bob), "bob");
      const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");

      await act(async () => {
        expect(operation === "toggle"
          ? await result.current.toggleEpisode(BREAKING_BAD, 1, 2)
          : operation === "season"
            ? await result.current.setSeasonWatched(BREAKING_BAD, 1, [2, 3], true)
            : operation === "remove"
              ? await result.current.removeShow(BREAKING_BAD.tvId)
              : await result.current.clearAll()).toBe(true);
      });

      expect(JSON.parse(readProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "bob")!)).toEqual(bob);
      expect(result.current.profileId).toBe("default");
      expect(result.current.watchedInSeason(BREAKING_BAD.tvId, 1)).toEqual(
        operation === "toggle" ? [1, 2] : operation === "season" ? [1, 2, 3] : [],
      );
      expect(result.current.progress).toEqual(JSON.parse(
        readProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "default") ?? "{}",
      ));
    },
  );

  it("keeps a mid-mutation pointer switch from moving the write or relabeling its owner", async () => {
    writeStorage({
      "1396": { ...BREAKING_BAD, seasons: { "1": [1] }, updatedAt: "2026-01-01T00:00:00.000Z" },
    });
    writeProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "{}", "bob");
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const read = Storage.prototype.getItem;
    let switched = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = read.call(this, key);
      if (key === EPISODE_PROGRESS_STORAGE_KEY && !switched) {
        switched = true;
        window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      }
      return value;
    });

    await act(async () => { expect(await result.current.toggleEpisode(BREAKING_BAD, 1, 2)).toBe(true); });

    expect(switched).toBe(true);
    expect(result.current.profileId).toBe("default");
    expect(result.current.watchedInSeason(BREAKING_BAD.tvId, 1)).toEqual([1, 2]);
    expect(readProfileStore(EPISODE_PROGRESS_STORAGE_KEY, "bob")).toBe("{}");
  });

  it("answers false and retains progress when the browser refuses clearing it", async () => {
    writeStorage({
      "1396": { ...BREAKING_BAD, seasons: { "1": [1] }, updatedAt: "2026-01-01T00:00:00.000Z" },
    });
    const { result } = renderHook(() => useEpisodeProgress(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const before = result.current.progress;
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    await act(async () => { expect(await result.current.clearAll()).toBe(false); });

    expect(result.current.progress).toBe(before);
    expect(result.current.profileId).toBe("default");
    expect(result.current.watchedCount(BREAKING_BAD.tvId)).toBe(1);
  });
});
