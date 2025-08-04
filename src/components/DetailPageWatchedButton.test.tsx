// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import { getWatched, WATCHED_STORAGE_KEY } from "@/lib/watched";
import { getWatchlist, WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { DetailPageWatchedButton } from "./DetailPageWatchedButton";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup } from "@/lib/portable-data";
import { restoreBackup } from "@/lib/restore-backup";
import { ACTIVE_PROFILE_STORAGE_KEY, PROFILES_STORAGE_KEY } from "@/lib/profiles";
import { deletedProfileKey, initializeProfileStorage, profileStoreKey, withProfileStorage } from "@/lib/profile-storage";

vi.mock("./Toast", () => ({ toast: { showToast: vi.fn() } }));
const { toast } = await import("./Toast");

function renderButton() {
  return render(
    <WatchlistProvider>
      <WatchedProvider>
        <DetailPageWatchedButton
          id={550}
          title="Fight Club"
          posterPath={null}
          voteAverage={8.4}
          releaseDate="1999-10-15"
          mediaType="movie"
        />
      </WatchedProvider>
    </WatchlistProvider>,
  );
}

function refuseWrite(refusedKey: string) {
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (key === refusedKey) {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    }
    setItem.call(this, key, value);
  });
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{
    id: 550,
    title: "Fight Club",
    mediaType: "movie",
    posterPath: null,
    voteAverage: 8.4,
    releaseDate: "1999-10-15",
    addedAt: "2026-01-01T00:00:00.000Z",
  }]));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("detail-page watched storage outcomes", async () => {
  it("refuses mixed context owners before marking watched or removing a queued title", async () => {
    initializeProfileStorage();
    const queued = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    renderButton();
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    const bobWatchlistKey = profileStoreKey(WATCHLIST_STORAGE_KEY, "bob");
    window.localStorage.setItem(bobWatchlistKey, queued!);
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: profileStoreKey(WATCHED_STORAGE_KEY, "bob"),
    })));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark as watched" })); });

    expect(getWatched()).toEqual([]);
    expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe(queued);
    expect(window.localStorage.getItem(bobWatchlistKey)).toBe(queued);
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("active profile changed"), "info");
  });

  it("keeps both stores on the rendered owner if the pointer changes after the guard", async () => {
    initializeProfileStorage();
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

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark as watched" })); });

    expect(withProfileStorage("default", getWatched)).toHaveLength(1);
    expect(withProfileStorage("default", getWatchlist)).toEqual([]);
    expect(getWatched()).toEqual([]);
    expect(getWatchlist()).toEqual([]);
    expect(toast.showToast).toHaveBeenCalledWith('Marked "Fight Club" as watched and removed it from your watchlist', "success");
  });

  it("does not remove another profile's watched entry before storage events arrive", async () => {
    const saved = JSON.stringify([{ id: 550, title: "Fight Club", mediaType: "movie", watchedAt: "2026-01-01T00:00:00.000Z" }]);
    window.localStorage.setItem(WATCHED_STORAGE_KEY, saved);
    renderButton();
    const bobWatched = JSON.stringify([{ id: 550, title: "Fight Club", mediaType: "movie", watchedAt: "2026-10-05T00:00:00.000Z" }]);
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    window.localStorage.setItem(WATCHED_STORAGE_KEY, bobWatched);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Watched" })); });

    expect(window.localStorage.getItem(WATCHED_STORAGE_KEY)).toBe(bobWatched);
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("active profile changed"), "info");
  });

  it("refreshes a changed watched state without reversing the rendered action", async () => {
    window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify([{
      id: 550, title: "Fight Club", mediaType: "movie", watchedAt: "2026-01-01T00:00:00.000Z",
    }]));
    renderButton();
    window.localStorage.setItem(WATCHED_STORAGE_KEY, "[]");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Watched" })); });

    expect(getWatched()).toEqual([]);
    expect(screen.getByRole("button", { name: "Mark as watched" })).toBeTruthy();
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("watched list changed"), "info");
  });

  it("removes a newly queued title when the rendered mark-watched action succeeds", async () => {
    window.localStorage.removeItem(WATCHLIST_STORAGE_KEY);
    renderButton();
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([{
      id: 550, title: "Fight Club", mediaType: "movie", addedAt: "2026-01-01T00:00:00.000Z",
    }]));

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark as watched" })); });

    expect(getWatched()).toHaveLength(1);
    expect(getWatchlist()).toEqual([]);
  });

  it("reports partial success when watched saves but watchlist removal is refused", async () => {
    refuseWrite(WATCHLIST_STORAGE_KEY);
    renderButton();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark as watched" })); });

    expect(getWatched()).toHaveLength(1);
    expect(getWatchlist()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Watched" }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(toast.showToast).toHaveBeenCalledWith(
      'Marked "Fight Club" as watched, but your browser would not remove it from your watchlist',
      "error",
    );
    expect(toast.showToast).not.toHaveBeenCalledWith(expect.anything(), "success");
  });

  it("announces removal when both writes succeed", async () => {
    renderButton();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark as watched" })); });

    expect(getWatched()).toHaveLength(1);
    expect(getWatchlist()).toHaveLength(0);
    expect(toast.showToast).toHaveBeenCalledWith(
      'Marked "Fight Club" as watched and removed it from your watchlist',
      "success",
    );
  });

  it("keeps the queued title when saving watched is refused", async () => {
    refuseWrite(WATCHED_STORAGE_KEY);
    renderButton();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mark as watched" })); });

    expect(getWatched()).toHaveLength(0);
    expect(getWatchlist()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Mark as watched" }).getAttribute("aria-pressed"))
      .toBe("false");
    expect(toast.showToast).toHaveBeenCalledWith(STORAGE_REFUSED_MESSAGE, "error");
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
    const control = screen.getByRole("button", { name: "Mark as watched" }) as HTMLButtonElement;

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
    const control = screen.getByRole("button", { name: "Mark as watched" }) as HTMLButtonElement;
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
  const control = screen.getByRole("button", { name: "Mark as watched" }) as HTMLButtonElement;
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
