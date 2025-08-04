// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useRatings } from "./useRatings";
import { RATINGS_STORAGE_KEY } from "@/lib/ratings";
import { ACTIVE_PROFILE_STORAGE_KEY, PROFILES_STORAGE_KEY, deleteProfile } from "@/lib/profiles";
import { readProfileStore, writeProfileStore } from "@/lib/profile-storage";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { createProfileLockManager } from "@/test/profile-locks";
import { refuseNextLocalStorageRead } from "@/test/storage-faults";

/**
 * The viewer's own scores, shared by every card on the page.
 *
 * The write path is the one worth pinning. `rate` and `unrate` deliberately read
 * through the store rather than the copy this render is holding, because a page
 * can have the same title in three places – a carousel, a grid and a detail
 * panel – and two quick changes made through different copies would otherwise
 * have the second overwrite the first with a map that predates it.
 */

function Card() {
  const { ratingFor } = useRatings();
  return <p>{ratingFor(550, "movie") ?? "unrated"}</p>;
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("useRatings", () => {
  it.each(["rate", "unrate"] as const)("preserves every score when the first read for %s fails and allows retry", async (operation) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const initial = {
      "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" },
      "tv-949": { rating: 8, ratedAt: "2026-01-02T00:00:00.000Z" },
    };
    writeProfileStore(RATINGS_STORAGE_KEY, JSON.stringify(initial));
    const { result } = renderHook(() => useRatings());
    const lock = await holdRosterLock();
    const apply = () => operation === "rate" ? result.current.rate(550, "movie", 7)
      : result.current.unrate(550, "movie");
    const pending = apply();
    refuseNextLocalStorageRead(RATINGS_STORAGE_KEY);

    await act(async () => {
      lock.release();
      await lock.holding;
      expect(await pending).toBe(false);
    });

    expect(JSON.parse(readProfileStore(RATINGS_STORAGE_KEY)!)).toEqual(initial);
    expect(result.current.ratingFor(550, "movie")).toBe(9);
    await act(async () => { expect(await apply()).toBe(true); });
    expect(result.current.ratingFor(550, "movie")).toBe(operation === "rate" ? 7 : null);
    expect(JSON.parse(readProfileStore(RATINGS_STORAGE_KEY)!)["tv-949"]).toEqual(initial["tv-949"]);
  });

  it.each(["rate", "unrate"] as const)("waits for the shared lock and keeps scores saved while %s is queued", async (operation) => {
    const initial = { "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" } };
    writeProfileStore(RATINGS_STORAGE_KEY, JSON.stringify(initial));
    const { result } = renderHook(() => useRatings());
    const lock = await holdRosterLock();
    const requests = vi.spyOn(navigator.locks, "request");
    const pending = operation === "rate" ? result.current.rate(550, "movie", 7)
      : result.current.unrate(550, "movie");
    await act(async () => {});
    expect(requests).toHaveBeenCalledWith(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, expect.any(Function));
    expect(JSON.parse(readProfileStore(RATINGS_STORAGE_KEY)!)).toEqual(initial);
    const otherScore = { rating: 8, ratedAt: "2026-01-02T00:00:00.000Z" };
    writeProfileStore(RATINGS_STORAGE_KEY, JSON.stringify({ ...initial, "tv-949": otherScore }));

    await act(async () => { lock.release(); await lock.holding; expect(await pending).toBe(true); });

    expect(result.current.ratingFor(550, "movie")).toBe(operation === "rate" ? 7 : null);
    expect(result.current.ratingFor(949, "tv")).toBe(8);
    expect(JSON.parse(readProfileStore(RATINGS_STORAGE_KEY)!)["tv-949"]).toEqual(otherScore);
  });

  it.each(["rate", "unrate"] as const)("rejects a retained %s callback when its owner is deleted before the queued edit", async (operation) => {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
      { id: "default", name: "Me" }, { id: "bob", name: "Bob" },
    ]));
    writeProfileStore(RATINGS_STORAGE_KEY, "{}", "bob");
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    const { result } = renderHook(() => useRatings());
    const retained = result.current;
    // The hook still renders Bob while another tab has already switched away.
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "default");
    const lock = await holdRosterLock();
    const deleting = deleteProfile("bob");
    const pending = operation === "rate" ? retained.rate(550, "movie", 7)
      : retained.unrate(550, "movie");

    await act(async () => {
      lock.release();
      await lock.holding;
      expect(await deleting).toBe(true);
      expect(await pending).toBe(false);
    });

    expect(readProfileStore(RATINGS_STORAGE_KEY, "bob")).toBeNull();
    expect(readProfileStore(RATINGS_STORAGE_KEY, "default")).toBeNull();
  });

  it.each(["missing", "rejected"])("returns false without changing scores when the lock is %s", async (failure) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const initial = JSON.stringify({ "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" } });
    writeProfileStore(RATINGS_STORAGE_KEY, initial);
    const { result } = renderHook(() => useRatings());
    vi.stubGlobal("navigator", failure === "missing" ? {} : {
      locks: { request: vi.fn().mockRejectedValue(new Error("Lock refused")) },
    });

    await act(async () => {
      expect(await result.current.rate(550, "movie", 7)).toBe(false);
      expect(await result.current.unrate(550, "movie")).toBe(false);
    });

    expect(readProfileStore(RATINGS_STORAGE_KEY)).toBe(initial);
    expect(result.current.ratingFor(550, "movie")).toBe(9);
  });

  it("renders unrated in the prerendered HTML", () => {
    window.localStorage.setItem(
      RATINGS_STORAGE_KEY,
      JSON.stringify({
        "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );

    expect(renderToString(<Card />)).toContain("unrated");
  });

  it("reads the stored scores once the browser takes over", () => {
    window.localStorage.setItem(
      RATINGS_STORAGE_KEY,
      JSON.stringify({
        "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );

    const { result } = renderHook(() => useRatings());

    expect(result.current.ratingFor(550, "movie")).toBe(9);
  });

  it("answers null for a title with no score", () => {
    const { result } = renderHook(() => useRatings());

    expect(result.current.ratingFor(550, "movie")).toBeNull();
  });

  it("keeps a film and a series with the same id apart", async () => {
    const { result } = renderHook(() => useRatings());

    await act(async () => { await result.current.rate(550, "movie", 9); });

    expect(result.current.ratingFor(550, "movie")).toBe(9);
    expect(result.current.ratingFor(550, "tv")).toBeNull();
  });

  it("records a score and clears it again", async () => {
    const { result } = renderHook(() => useRatings());

    await act(async () => { await result.current.rate(550, "movie", 9); });
    expect(result.current.ratingFor(550, "movie")).toBe(9);

    await act(async () => { await result.current.unrate(550, "movie"); });
    expect(result.current.ratingFor(550, "movie")).toBeNull();
  });

  it("reaches every copy of the hook on the page", async () => {
    const detail = renderHook(() => useRatings());
    const card = renderHook(() => useRatings());

    await act(async () => { await detail.result.current.rate(550, "movie", 8); });

    expect(card.result.current.ratingFor(550, "movie")).toBe(8);
  });

  /**
   * Two titles scored through two different copies of the hook, neither of which
   * has re-rendered in between. Reading the render-time map instead of the store
   * would lose the first score.
   */
  it("does not let one copy's write undo another's", async () => {
    const carousel = renderHook(() => useRatings());
    const grid = renderHook(() => useRatings());

    await act(async () => {
      const first = carousel.result.current.rate(550, "movie", 9);
      const second = grid.result.current.rate(27205, "movie", 7);
      expect(await first).toBe(true);
      expect(await second).toBe(true);
    });

    expect(grid.result.current.ratingFor(550, "movie")).toBe(9);
    expect(carousel.result.current.ratingFor(27205, "movie")).toBe(7);
  });

  it("survives a hand-edited store rather than taking the page down", () => {
    window.localStorage.setItem(RATINGS_STORAGE_KEY, "{ not json");

    const { result } = renderHook(() => useRatings());

    expect(result.current.ratings).toEqual({});
  });

  it.each(["rate", "unrate"] as const)(
    "retains the rendered owner for %s before a profile event is delivered",
    async (operation) => {
      const alice = { "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" } };
      const bob = { "movie-550": { rating: 3, ratedAt: "2026-01-01T00:00:00.000Z" } };
      writeProfileStore(RATINGS_STORAGE_KEY, JSON.stringify(alice), "default");
      writeProfileStore(RATINGS_STORAGE_KEY, JSON.stringify(bob), "bob");
      const { result } = renderHook(() => useRatings());
      const retained = result.current;
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");

      await act(async () => {
        expect(operation === "rate"
          ? await retained.rate(550, "movie", 7)
          : await retained.unrate(550, "movie")).toBe(true);
      });

      expect(JSON.parse(readProfileStore(RATINGS_STORAGE_KEY, "bob")!)).toEqual(bob);
      expect(JSON.parse(readProfileStore(RATINGS_STORAGE_KEY, "default")!)["movie-550"]?.rating)
        .toBe(operation === "rate" ? 7 : undefined);
    },
  );

  it("keeps read and write on the same owner when the pointer changes during a rating edit", async () => {
    writeProfileStore(RATINGS_STORAGE_KEY, JSON.stringify({
      "movie-550": { rating: 9, ratedAt: "2026-01-01T00:00:00.000Z" },
    }), "default");
    writeProfileStore(RATINGS_STORAGE_KEY, "{}", "bob");
    const { result } = renderHook(() => useRatings());
    const retained = result.current;
    const read = Storage.prototype.getItem;
    let switched = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = read.call(this, key);
      if (key === RATINGS_STORAGE_KEY && !switched) {
        switched = true;
        window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      }
      return value;
    });

    await act(async () => { expect(await retained.rate(27205, "movie", 7)).toBe(true); });

    expect(switched).toBe(true);
    expect(readProfileStore(RATINGS_STORAGE_KEY, "bob")).toBe("{}");
    const alice = JSON.parse(readProfileStore(RATINGS_STORAGE_KEY, "default")!);
    expect(alice["movie-550"].rating).toBe(9);
    expect(alice["movie-27205"].rating).toBe(7);
  });

  it("updates the rendered owner and ratings together after a profile storage event", async () => {
    writeProfileStore(RATINGS_STORAGE_KEY, "{}", "default");
    writeProfileStore(RATINGS_STORAGE_KEY, JSON.stringify({
      "movie-550": { rating: 3, ratedAt: "2026-01-01T00:00:00.000Z" },
    }), "bob");
    const { result } = renderHook(() => useRatings());

    act(() => {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });
    expect(result.current.ratingFor(550, "movie")).toBe(3);
    expect(result.current.profileId).toBe("bob");

    await act(async () => { expect(await result.current.rate(550, "movie", 8)).toBe(true); });
    expect(JSON.parse(readProfileStore(RATINGS_STORAGE_KEY, "bob")!)["movie-550"].rating).toBe(8);
    expect(readProfileStore(RATINGS_STORAGE_KEY, "default")).toBe("{}");
  });
});
