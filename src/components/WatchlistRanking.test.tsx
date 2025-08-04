// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { refuseNextLocalStorageRead } from "@/test/storage-faults";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { toast } from "@/components/Toast";
import { getRanking, RANKING_STORAGE_KEY, recordChoice, saveRanking } from "@/lib/ranking";
import { WATCHLIST_STORAGE_KEY, type WatchlistItem } from "@/lib/watchlist";
import { ACTIVE_PROFILE_STORAGE_KEY } from "@/lib/profiles";
import { initializeProfileStorage, profileStoreKey, withProfileStorage } from "@/lib/profile-storage";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { WatchlistRanking } from "./WatchlistRanking";

const watchlist: WatchlistItem[] = [1, 2, 3].map((id) => ({
  id,
  title: `Film ${id}`,
  mediaType: "movie",
  posterPath: null,
  voteAverage: 8,
  releaseDate: "",
  addedAt: "2026-01-01T00:00:00.000Z",
}));

vi.mock("@/components/Toast", () => ({
  toast: { showToast: vi.fn() },
}));

vi.mock("@/components/ShareListButton", () => ({ ShareListButton: () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

function refuseRankingWrites() {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    if (key === RANKING_STORAGE_KEY) throw new DOMException("Quota exceeded", "QuotaExceededError");
    original.call(this, key, value);
  });
}

function renderRanking() {
  return render(<WatchlistProvider><WatchlistRanking /></WatchlistProvider>);
}

async function click(element: Element) {
  await act(async () => { fireEvent.click(element); });
}

async function holdProfileLock() {
  let release!: () => void;
  let entered!: () => void;
  const acquired = new Promise<void>((resolve) => { entered = resolve; });
  const held = navigator.locks.request(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, () => {
    entered();
    return new Promise<void>((resolve) => { release = resolve; });
  });
  await acquired;
  return async () => { await act(async () => { release(); await held; }); };
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("ranking saved across tabs", () => {
  it.each([RANKING_STORAGE_KEY, WATCHLIST_STORAGE_KEY])("preserves the ranking when a queued choice cannot read %s, then retries", async (key) => {
    const original = recordChoice({}, "movie-11", "movie-12");
    saveRanking(original);
    renderRanking();
    const release = await holdProfileLock();
    const button = screen.getByRole("button", { name: "Film 1 —" });
    await click(button);
    refuseNextLocalStorageRead(key);

    await release();

    expect(getRanking()).toEqual(original);
    expect(button.getAttribute("disabled")).toBeNull();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith("Could not save your choice. Please try again.", "error");
    await click(button);
    expect(getRanking()).toEqual(recordChoice(original, "movie-1", "movie-2"));
  });

  it("records a queued choice after another tab's choice without accepting duplicate clicks", async () => {
    renderRanking();
    const release = await holdProfileLock();
    const request = vi.spyOn(navigator.locks, "request");
    const button = screen.getByRole("button", { name: "Film 1 —" });
    await click(button);
    await click(button);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(PROFILE_ROSTER_LOCK);
    expect(button.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Skip this pair" }).getAttribute("disabled")).not.toBeNull();
    expect(getRanking()).toEqual({});
    const otherChoice = recordChoice({}, "movie-2", "movie-3");
    saveRanking(otherChoice);
    await release();
    expect(getRanking()).toEqual(recordChoice(otherChoice, "movie-1", "movie-2"));
    expect(getRanking()["movie-2"].matches).toBe(2);
  });

  it("rechecks a queued duel after a restore removes its winner", async () => {
    renderRanking();
    const release = await holdProfileLock();
    await click(screen.getByRole("button", { name: "Film 1 —" }));
    const restoredRanking = recordChoice({}, "movie-2", "movie-3");
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist.slice(1)));
    saveRanking(restoredRanking);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await release();
    expect(getRanking()).toEqual(restoredRanking);
    expect(writes).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Film 1 —" })).toBeNull();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Your watchlist changed. Review the current pair and try again.", "info",
    );
  });

  it("queues reset behind a restore and applies it once", async () => {
    const original = recordChoice({}, "movie-1", "movie-2");
    saveRanking(original);
    renderRanking();
    await click(screen.getByRole("button", { name: "Reset" }));
    const release = await holdProfileLock();
    const request = vi.spyOn(navigator.locks, "request");
    const button = screen.getByRole("button", { name: "Erase the ranking" });
    await click(button);
    await click(button);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(PROFILE_ROSTER_LOCK);
    expect(getRanking()).toEqual(original);
    saveRanking(recordChoice({}, "movie-3", "movie-2"));
    await release();
    expect(getRanking()).toEqual({});
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
  });

  it.each([
    ["choice", "pointer"], ["choice", "event"], ["choice", "unmount"],
    ["reset", "pointer"], ["reset", "event"], ["reset", "unmount"],
  ])("cancels queued %s after a profile %s", async (action, change) => {
    const original = recordChoice({}, "movie-1", "movie-2");
    saveRanking(original);
    renderRanking();
    if (action === "reset") await click(screen.getByRole("button", { name: "Reset" }));
    const release = await holdProfileLock();
    await click(screen.getByRole("button", { name: action === "reset" ? "Erase the ranking" : "Film 1 —" }));
    if (change === "unmount") cleanup();
    else {
      initializeProfileStorage();
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      if (change === "event") act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
      });
    }
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await release();
    expect(withProfileStorage("default", getRanking)).toEqual(original);
    expect(writes).not.toHaveBeenCalled();
    expect(toast.showToast).not.toHaveBeenCalledWith(expect.any(String), "success");
  });

  it.each(["choice", "reset"])("reports lock refusal for %s without changing the ranking", async (action) => {
    const original = recordChoice({}, "movie-1", "movie-2");
    saveRanking(original);
    renderRanking();
    if (action === "reset") await click(screen.getByRole("button", { name: "Reset" }));
    vi.stubGlobal("navigator", {});
    await click(screen.getByRole("button", { name: action === "reset" ? "Erase the ranking" : "Film 1 —" }));
    expect(getRanking()).toEqual(original);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      action === "reset" ? "Could not reset your ranking. Please try again." : "Could not save your choice. Please try again.",
      "error",
    );
  });

  it("keeps a choice with the displayed profile when the pointer changes during the ranking read", async () => {
    initializeProfileStorage();
    const bobRanking = recordChoice({}, "movie-11", "movie-12");
    window.localStorage.setItem(profileStoreKey(RANKING_STORAGE_KEY, "bob"), JSON.stringify(bobRanking));
    renderRanking();
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = getItem.call(this, key);
      if (key === RANKING_STORAGE_KEY) setItem.call(this, ACTIVE_PROFILE_STORAGE_KEY, "bob");
      return value;
    });

    await click(screen.getByRole("button", { name: "Film 1 —" }));

    expect(withProfileStorage("default", getRanking)["movie-1"].matches).toBe(1);
    expect(withProfileStorage("bob", getRanking)).toEqual(bobRanking);
  });

  function switchToBobWithoutEvents() {
    const bobItems = watchlist.map((item) => ({ ...item, id: item.id + 10, title: `Film ${item.id + 10}` }));
    const bobRanking = recordChoice({}, "movie-11", "movie-12");
    // Other-tab writes are visible before this tab receives storage events.
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(bobItems));
    window.localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(bobRanking));
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    return bobRanking;
  }

  it("does not write a previous profile's displayed duel into the new profile", async () => {
    renderRanking();
    const bobRanking = switchToBobWithoutEvents();

    await click(screen.getByRole("button", { name: "Film 1 —" }));

    expect(getRanking()).toEqual(bobRanking);
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("active profile changed"), "info");
  });

  it("does not erase another profile through a pending reset confirmation", async () => {
    renderRanking();
    await click(screen.getByRole("button", { name: "Reset" }));
    const bobRanking = switchToBobWithoutEvents();

    await click(screen.getByRole("button", { name: "Erase the ranking" }));

    expect(getRanking()).toEqual(bobRanking);
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("active profile changed"), "info");
  });

  it("cancels the old profile's reset confirmation after all storage events arrive", async () => {
    renderRanking();
    await click(screen.getByRole("button", { name: "Reset" }));
    const bobRanking = switchToBobWithoutEvents();

    act(() => {
      for (const key of [WATCHLIST_STORAGE_KEY, RANKING_STORAGE_KEY, ACTIVE_PROFILE_STORAGE_KEY]) {
        window.dispatchEvent(new StorageEvent("storage", { key }));
      }
    });

    expect(screen.queryByRole("button", { name: "Erase the ranking" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Film 11 —" })).toBeTruthy();
    expect(getRanking()).toEqual(bobRanking);

    await click(screen.getByRole("button", { name: "Film 11 —" }));
    expect(getRanking()["movie-11"].matches).toBe(2);
    expect(getRanking()["movie-1"]).toBeUndefined();
  });

  it("does not record a displayed pair after another tab removes one of its titles", async () => {
    renderRanking();
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist.slice(1)));

    await click(screen.getByRole("button", { name: "Film 1 —" }));

    expect(getRanking()).toEqual({});
    expect(screen.queryByRole("button", { name: "Film 1 —" })).toBeNull();
    expect(screen.getByRole("button", { name: "Film 2 —" })).toBeTruthy();
  });

  it("preserves an earlier choice even before its storage event arrives", async () => {
    const firstTab = renderRanking();
    vi.mocked(Math.random).mockReturnValue(0.5);
    const secondTab = renderRanking();

    await click(within(firstTab.container).getByRole("button", { name: "Film 1 —" }));
    await click(within(secondTab.container).getByRole("button", { name: "Film 2 —" }));

    expect(getRanking()).toEqual(
      recordChoice(recordChoice({}, "movie-1", "movie-2"), "movie-2", "movie-3"),
    );
    expect(getRanking()["movie-1"].matches).toBe(1);
    expect(getRanking()["movie-2"].matches).toBe(2);
    expect(getRanking()["movie-3"].matches).toBe(1);
  });

  it("updates the displayed order and progress when another tab saves", async () => {
    renderRanking();
    expect(screen.getByText(/^6 more comparisons/)).toBeTruthy();

    act(() => {
      saveRanking(recordChoice({}, "movie-2", "movie-1"));
      window.dispatchEvent(new StorageEvent("storage", { key: RANKING_STORAGE_KEY }));
    });

    expect(screen.getByText(/^5 more comparisons/)).toBeTruthy();
    expect(screen.getByText("1516")).toBeTruthy();
    expect(within(screen.getByRole("list")).getAllByRole("link")[0].textContent).toContain("Film 2");

    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(screen.getByText("Save two titles first")).toBeTruthy();
    expect(screen.queryByText("1516")).toBeNull();
  });
});

describe("refused ranking writes", () => {
  it("keeps the current pair, order and progress when a choice cannot be saved", async () => {
    renderRanking();
    const writes = refuseRankingWrites();

    await click(screen.getByRole("button", { name: "Film 1 —" }));

    expect(getRanking()).toEqual({});
    expect(screen.getByRole("button", { name: "Film 1 —" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Film 2 —" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Film 3 —" })).toBeNull();
    expect(screen.getByText(/^6 more comparisons/)).toBeTruthy();
    expect(screen.queryByText("1516")).toBeNull();
    expect(toast.showToast).toHaveBeenCalledWith(
      "Could not save your choice. Please try again.",
      "error",
    );

    writes.mockRestore();
    await click(screen.getByRole("button", { name: "Film 1 —" }));
    expect(getRanking()["movie-1"].matches).toBe(1);
    expect(screen.getByText(/^5 more comparisons/)).toBeTruthy();
  });

  it("keeps a ranking and its confirmation available when reset fails", async () => {
    const saved = recordChoice({}, "movie-1", "movie-2");
    saveRanking(saved);
    renderRanking();
    const writes = refuseRankingWrites();

    await click(screen.getByRole("button", { name: "Reset" }));
    await click(screen.getByRole("button", { name: "Erase the ranking" }));

    expect(getRanking()).toEqual(saved);
    expect(screen.getByText("1516")).toBeTruthy();
    expect(screen.getByText(/^5 more comparisons/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erase the ranking" })).toBeTruthy();
    expect(toast.showToast).toHaveBeenCalledWith(
      "Could not reset your ranking. Please try again.",
      "error",
    );

    writes.mockRestore();
    await click(screen.getByRole("button", { name: "Erase the ranking" }));
    expect(getRanking()).toEqual({});
    expect(screen.getByText(/^6 more comparisons/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
  });

  it("clears the previous move feedback after a successful reset", async () => {
    renderRanking();
    await click(screen.getByRole("button", { name: "Film 1 —" }));
    expect(screen.getByText(/holds #1/)).toBeTruthy();

    await click(screen.getByRole("button", { name: "Reset" }));
    await click(screen.getByRole("button", { name: "Erase the ranking" }));

    expect(screen.queryByText(/holds #1/)).toBeNull();
  });
});
