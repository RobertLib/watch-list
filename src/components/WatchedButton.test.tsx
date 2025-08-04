// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { ACTIVE_PROFILE_STORAGE_KEY, PROFILES_STORAGE_KEY } from "@/lib/profiles";
import { deletedProfileKey, initializeProfileStorage, profileStoreKey, withProfileStorage } from "@/lib/profile-storage";
import { getWatched, WATCHED_STORAGE_KEY } from "@/lib/watched";
import { getWatchlist, WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import type { MediaItem } from "@/types/tmdb";
import { WatchedButton } from "./WatchedButton";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup } from "@/lib/portable-data";
import { restoreBackup } from "@/lib/restore-backup";

vi.mock("./Toast", () => ({ toast: { showToast: vi.fn() } }));
const { toast } = await import("./Toast");

const item: MediaItem = {
  id: 550, title: "Fight Club", media_type: "movie", overview: "",
  poster_path: null, backdrop_path: null, vote_average: 8.4, vote_count: 1,
  release_date: "1999-10-15", genre_ids: [],
};
const saved = {
  id: 550, title: "Fight Club", mediaType: "movie", posterPath: null,
  voteAverage: 8.4, releaseDate: "1999-10-15", watchedAt: "2026-01-01T00:00:00.000Z",
};

function renderButton() {
  return render(<WatchlistProvider><WatchedProvider><WatchedButton item={item} /></WatchedProvider></WatchlistProvider>);
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear(); });

describe("watched card actions across tabs", async () => {
  it("refuses to combine a refreshed watched context with the previous profile's watchlist", async () => {
    initializeProfileStorage();
    const queued = JSON.stringify([{ ...saved, addedAt: "2026-01-01T00:00:00.000Z" }]);
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, queued);
    renderButton();
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    const bobWatchlistKey = profileStoreKey(WATCHLIST_STORAGE_KEY, "bob");
    window.localStorage.setItem(bobWatchlistKey, queued);
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: profileStoreKey(WATCHED_STORAGE_KEY, "bob"),
    })));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark Fight Club as watched" })); });

    expect(getWatched()).toEqual([]);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe(queued);
    expect(window.localStorage.getItem(bobWatchlistKey)).toBe(queued);
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("active profile changed"), "info");
  });

  it("keeps both stores on the rendered owner if the pointer changes after the guard", async () => {
    initializeProfileStorage();
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{ ...saved, addedAt: "2026-01-01T00:00:00.000Z" }]));
    renderButton();
    const getItem = Storage.prototype.getItem;
    let switched = false;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      const value = getItem.call(this, key);
      if (!switched && key === ACTIVE_PROFILE_STORAGE_KEY) {
        switched = true;
        window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      }
      return value;
    });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark Fight Club as watched" })); });

    expect(withProfileStorage("default", getWatched)).toHaveLength(1);
    expect(withProfileStorage("default", getWatchlist)).toEqual([]);
    expect(getWatched()).toEqual([]);
    expect(getWatchlist()).toEqual([]);
    expect(toast.showToast).toHaveBeenCalledWith('Marked "Fight Club" as watched and removed it from your watchlist', "success");
  });

  it("does not remove a different profile's watched entry before events arrive", async () => {
    window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify([saved]));
    renderButton();
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "other");
    const incoming = [{ ...saved, watchedAt: "2026-02-01T00:00:00.000Z" }];
    window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify(incoming));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark Fight Club as not watched" })); });

    expect(getWatched()).toEqual(incoming);
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("active profile changed"), "info");
  });

  it("refreshes a pending watched change without undoing it", async () => {
    renderButton();
    window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify([saved]));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark Fight Club as watched" })); });

    expect(getWatched()).toEqual([saved]);
    expect(screen.getByRole("button", { name: "Mark Fight Club as not watched" })).toBeDefined();
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("watched list changed"), "info");
  });

  it("removes a newly queued title when marking it watched before the storage event", async () => {
    renderButton();
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([
      { ...saved, addedAt: "2026-01-01T00:00:00.000Z" },
    ]));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark Fight Club as watched" })); });

    expect(getWatched()).toHaveLength(1);
    expect(getWatchlist()).toEqual([]);
    expect(toast.showToast).toHaveBeenCalledWith('Marked "Fight Club" as watched and removed it from your watchlist', "success");
  });
});

async function holdRosterLock() {
  let release!: () => void;
  const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () =>
    new Promise<void>((resolve) => { release = resolve; }),
  );
  await Promise.resolve();
  return { release, held };
}

function seedActionProfiles() {
  initializeProfileStorage();
  window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
    { id: "default", name: "Me" }, { id: "alice", name: "Alice" }, { id: "bob", name: "Bob" },
  ]));
  window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "alice");
  const queued = JSON.stringify([{
    id: 550, title: "Fight Club", mediaType: "movie", addedAt: "2026-01-01T00:00:00.000Z",
  }]);
  const aliceWatchlist = profileStoreKey(WATCHLIST_STORAGE_KEY, "alice");
  const bobWatchlist = profileStoreKey(WATCHLIST_STORAGE_KEY, "bob");
  window.localStorage.setItem(aliceWatchlist, queued);
  window.localStorage.setItem(bobWatchlist, queued);
  return { aliceWatchlist, bobWatchlist, queued };
}

describe("pending watchlist removal", () => {
  it("waits for removal before announcing success and ignores repeated actions", async () => {
    seedActionProfiles();
    const lock = await holdRosterLock();
    const requests = vi.spyOn(navigator.locks, "request");
    renderButton();
    const control = screen.getByRole("button", { name: "Mark Fight Club as watched" }) as HTMLButtonElement;

    act(() => {
      fireEvent.click(control);
      fireEvent.click(control);
    });
    expect(requests).toHaveBeenCalledTimes(1);
    expect(control.disabled).toBe(true);
    expect(getWatched()).toEqual([]);
    expect(getWatchlist()).toHaveLength(1);
    expect(toast.showToast).not.toHaveBeenCalled();

    await act(async () => { lock.release(); await lock.held; });

    expect(control.disabled).toBe(false);
    expect(getWatched()).toHaveLength(1);
    expect(getWatchlist()).toEqual([]);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith('Marked "Fight Club" as watched and removed it from your watchlist', "success");
  });

  it.each(["switch", "delete"])("keeps a pending action on its original profile after a %s", async (change) => {
    const { aliceWatchlist, bobWatchlist, queued } = seedActionProfiles();
    const lock = await holdRosterLock();
    renderButton();
    const control = screen.getByRole("button", { name: "Mark Fight Club as watched" }) as HTMLButtonElement;
    await act(async () => { fireEvent.click(control); });
    expect(control.disabled).toBe(true);
    expect(toast.showToast).not.toHaveBeenCalled();

    act(() => {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      if (change === "delete") {
        // Model the roster-lock holder deleting Alice before the queued
        // removal receives its turn. Deleted owners must never be recreated.
        window.localStorage.setItem(deletedProfileKey("alice"), "true");
        window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([
          { id: "default", name: "Me" }, { id: "bob", name: "Bob" },
        ]));
        window.localStorage.removeItem(aliceWatchlist);
        window.localStorage.removeItem(profileStoreKey(WATCHED_STORAGE_KEY, "alice"));
      }
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });
    await act(async () => { lock.release(); await lock.held; });

    expect(control.disabled).toBe(false);
    expect(window.localStorage.getItem(bobWatchlist)).toBe(queued);
    expect(getWatchlist()).toHaveLength(1);
    expect(getWatched()).toEqual([]);
    if (change === "delete") {
      expect(window.localStorage.getItem(aliceWatchlist)).toBeNull();
      expect(window.localStorage.getItem(profileStoreKey(WATCHED_STORAGE_KEY, "alice"))).toBeNull();
      expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("profile for this action was deleted"), "info");
      expect(toast.showToast).not.toHaveBeenCalledWith(expect.any(String), "success");
    } else {
      expect(withProfileStorage("alice", getWatchlist)).toEqual([]);
      expect(withProfileStorage("alice", getWatched)).toHaveLength(1);
      expect(toast.showToast).toHaveBeenCalledExactlyOnceWith('Marked "Fight Club" as watched and removed it from your watchlist', "success");
    }
  });
});

it("applies the entire action after a previously queued restore of the same profile", async () => {
  const { queued } = seedActionProfiles();
  const lock = await holdRosterLock();
  renderButton();
  const imported = parseBackup({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    activeProfile: { id: "alice", name: "Alice" },
    otherProfiles: [
      { id: "default", name: "Me" },
      { id: "bob", name: "Bob", watchlist: JSON.parse(queued) },
    ],
    watchlist: [
      ...JSON.parse(queued),
      { id: 11, title: "Imported queue entry", mediaType: "movie", addedAt: "2026-01-01T00:00:00.000Z" },
    ],
    watched: [{ id: 12, title: "Imported watched entry", mediaType: "movie", watchedAt: "2026-01-01T00:00:00.000Z" }],
    ratings: { "movie-11": { rating: 6, ratedAt: "2026-01-01T00:00:00.000Z" } },
  })!;
  const restoring = restoreBackup(imported);
  const control = screen.getByRole("button", { name: "Mark Fight Club as watched" }) as HTMLButtonElement;
  await act(async () => { fireEvent.click(control); });

  expect(getWatched()).toEqual([]);
  expect(toast.showToast).not.toHaveBeenCalled();
  await act(async () => { lock.release(); await lock.held; expect(await restoring).toEqual({ ok: true }); });

  expect(getWatched().map((entry) => entry.id)).toEqual([550, 12]);
  expect(getWatchlist().map((entry) => entry.id)).toEqual([11]);
  expect(control.disabled).toBe(false);
  expect(control.getAttribute("aria-pressed")).toBe("true");
  expect(toast.showToast).toHaveBeenCalledExactlyOnceWith('Marked "Fight Club" as watched and removed it from your watchlist', "success");
});
