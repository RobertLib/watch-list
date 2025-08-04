// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EpisodeProgressProvider, useEpisodeProgress } from "@/contexts/EpisodeProgressContext";
import { WatchedProvider, useWatched } from "@/contexts/WatchedContext";
import { WatchlistProvider, useWatchlist } from "@/contexts/WatchlistContext";
import { createProfileLockManager } from "@/test/profile-locks";
import { getProfileStorageOwner, PROFILE_STORAGE_OWNER_KEY, profileStoreKey, withProfileStorage, writeProfileStore } from "./profile-storage";

const title = {
  id: 550, title: "Fight Club", mediaType: "movie" as const, posterPath: null,
  voteAverage: 8, releaseDate: "1999-10-15",
};
const timestamp = "2026-01-01T00:00:00.000Z";

interface StoreProbe {
  value: unknown;
  edit: () => Promise<unknown>;
  refused: unknown;
}

const stores = [
  {
    name: "watchlist", key: "watchlist", wrapper: WatchlistProvider,
    value: [{ ...title, addedAt: timestamp }], empty: [],
    useStore: () => {
      const store = useWatchlist();
      return { value: store.watchlist, edit: () => store.removeItem(title.id, "movie"), refused: "failed" };
    },
  },
  {
    name: "watched", key: "watched", wrapper: WatchedProvider,
    value: [{ ...title, watchedAt: timestamp }], empty: [],
    useStore: () => {
      const store = useWatched();
      return { value: store.watched, edit: () => store.removeItem(title.id, "movie"), refused: "failed" };
    },
  },
  {
    name: "episode progress", key: "episode-progress", wrapper: EpisodeProgressProvider,
    value: { "1396": { tvId: 1396, name: "Breaking Bad", posterPath: null, seasons: { "1": [1] }, updatedAt: timestamp } },
    empty: {},
    useStore: () => {
      const store = useEpisodeProgress();
      return { value: store.progress, edit: () => store.removeShow(1396), refused: false };
    },
  },
];

beforeEach(() => {
  localStorage.clear();
  document.cookie = "watchlist=;max-age=0;path=/";
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  vi.spyOn(console, "error").mockImplementation(() => {});
  localStorage.setItem(PROFILE_STORAGE_OWNER_KEY, "default");
  localStorage.setItem("active-profile", "p2");
  localStorage.setItem("profiles", JSON.stringify([
    { id: "default", name: "Me" }, { id: "p2", name: "Second" },
  ]));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe.each(stores)("$name migration recovery", ({ key, wrapper, value, empty, useStore }) => {
  it.each(["current", "parked"])("refuses an edit derived from an unreadable %s store", async (source) => {
    const raw = JSON.stringify(value).slice(0, -1);
    if (source === "current") localStorage.setItem(profileStoreKey(key, "p2"), raw);
    else localStorage.setItem("profile-data:p2", JSON.stringify({ [key]: raw }));
    const before = { ...localStorage };
    const { result } = renderHook((): StoreProbe => useStore(), { wrapper });
    expect(result.current.value).toEqual(empty);

    await act(async () => { expect(await result.current.edit()).toBe(result.current.refused); });

    expect(result.current.value).toEqual(empty);
    expect({ ...localStorage }).toEqual(before);
  });

  it.each([true, false])("publishes actual storage only when rollback is refused (%s)", async (refuseUndo) => {
    const parked = JSON.stringify({ [key]: JSON.stringify(value), ratings: "{}" });
    localStorage.setItem("profile-data:p2", parked);
    const { result } = renderHook((): StoreProbe => useStore(), { wrapper });
    const before = result.current.value;
    expect(before).toEqual(value);
    const invalidation = vi.fn();
    window.addEventListener("storage", invalidation);
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, address, next) {
      if (address === profileStoreKey(key, "p2") || (refuseUndo && address === "profile-data:p2" && next === parked)) {
        throw new DOMException("Refused", "QuotaExceededError");
      }
      setItem.call(this, address, next);
    });
    try {
      await act(async () => { expect(await result.current.edit()).toBe(result.current.refused); });

      if (refuseUndo) {
        expect(result.current.value).toEqual(empty);
        expect(invalidation).toHaveBeenCalledTimes(1);
      } else {
        expect(result.current.value).toBe(before);
        expect(localStorage.getItem("profile-data:p2")).toBe(parked);
        expect(invalidation).not.toHaveBeenCalled();
      }
    } finally {
      window.removeEventListener("storage", invalidation);
    }
  });
});

it("defers an incomplete rollback's invalidation until readers adopt the actual active owner", () => {
  const parked = JSON.stringify({ watchlist: '["old"]', ratings: "{}" });
  localStorage.setItem("profile-data:p2", parked);
  const owners: string[] = [];
  const onStorage = () => owners.push(getProfileStorageOwner());
  window.addEventListener("storage", onStorage);
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
    if (key === profileStoreKey("watchlist", "p2")) {
      setItem.call(this, "active-profile", "default");
      throw new DOMException("Refused", "QuotaExceededError");
    }
    if (key === "profile-data:p2" && value === parked) throw new DOMException("Refused undo", "QuotaExceededError");
    setItem.call(this, key, value);
  });
  try {
    withProfileStorage("p2", () => {
      expect(() => writeProfileStore("watchlist", '["new"]')).toThrow("previous data");
      expect(owners).toEqual([]);
    });
    expect(owners).toEqual(["default"]);
  } finally {
    window.removeEventListener("storage", onStorage);
  }
});
