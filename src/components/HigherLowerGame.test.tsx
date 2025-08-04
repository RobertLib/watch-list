// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getRecord, HIGHER_LOWER_STORAGE_KEY } from "@/lib/higher-lower";
import { ACTIVE_PROFILE_STORAGE_KEY } from "@/lib/profiles";
import { initializeProfileStorage, profileStoreKey, withProfileStorage } from "@/lib/profile-storage";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { createProfileLockManager } from "@/test/profile-locks";
import { refuseNextLocalStorageRead } from "@/test/storage-faults";
import { HigherLowerGame } from "./HigherLowerGame";

const getRatingDuel = vi.fn();
const resolveRatingDuel = vi.fn();

vi.mock("@/lib/api", () => ({
  getRatingDuel: (...args: unknown[]) => getRatingDuel(...args),
  resolveRatingDuel: (...args: unknown[]) => resolveRatingDuel(...args),
}));
vi.mock("./Toast", () => ({ toast: { showToast: vi.fn() } }));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a"> & { prefetch?: boolean }) => {
    const attrs = { ...props };
    delete attrs.prefetch;
    return <a {...attrs} />;
  },
}));

const { toast } = await import("./Toast");

function film(id: number) {
  return {
    id,
    title: `Film ${id}`,
    slug: `film-${id}`,
    year: "2000",
    posterPath: null,
    backdropPath: null,
  };
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

function refuseRecordWrites() {
  const setItem = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (key === HIGHER_LOWER_STORAGE_KEY) {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    }
    setItem.call(this, key, value);
  });
}

function saveFromAnotherTab(best: number, totalRounds: number, dispatch = true) {
  const key = profileStoreKey(HIGHER_LOWER_STORAGE_KEY);
  window.localStorage.setItem(key, JSON.stringify({ best, totalRounds }));
  if (dispatch) {
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function holdRosterLock() {
  const entered = deferred<void>();
  const released = deferred<void>();
  const holding = navigator.locks.request(PROFILE_ROSTER_LOCK, {}, () => {
    entered.resolve();
    return released.promise;
  });
  await entered.promise;
  return { holding, release: () => released.resolve() };
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  getRatingDuel.mockResolvedValueOnce({
    champion: { ...film(1), rating: 7 },
    challenger: film(2),
  }).mockResolvedValue({ champion: null, challenger: film(3) });
  resolveRatingDuel.mockResolvedValue({ correct: true, challengerRating: 8 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("higher-or-lower record persistence", () => {
  it("reports a rejected round and lets the same pair be retried without counting it twice", async () => {
    resolveRatingDuel.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<HigherLowerGame />);
    await act(async () => {});

    await click("Higher");

    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Could not settle that round – try again", "error",
    );
    expect(screen.getByRole("button", { name: "Higher" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lower" })).toBeTruthy();
    expect(screen.getByText("0", { selector: "span" })).toBeTruthy();
    expect(getRecord()).toEqual({ best: 0, totalRounds: 0 });

    await click("Higher");

    expect(resolveRatingDuel).toHaveBeenNthCalledWith(1, 7, 2, "higher");
    expect(resolveRatingDuel).toHaveBeenNthCalledWith(2, 7, 2, "higher");
    expect(screen.getByRole("button", { name: "Next round" })).toBeTruthy();
    expect(getRecord()).toEqual({ best: 1, totalRounds: 1 });
  });

  it("retains an unsaved round after a transient record read failure and adds it once on retry", async () => {
    saveFromAnotherTab(12, 20, false);
    render(<HigherLowerGame />);
    await act(async () => {});
    const lock = await holdRosterLock();
    await click("Higher");
    refuseNextLocalStorageRead(HIGHER_LOWER_STORAGE_KEY);

    await act(async () => { lock.release(); await lock.holding; });

    expect(getRecord()).toEqual({ best: 12, totalRounds: 20 });
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Could not safely save this round. You can keep playing; another round will retry the save.", "error",
    );
    expect(screen.getByRole("button", { name: "Next round" })).toBeTruthy();
    await click("Next round");
    await click("Higher");
    expect(getRecord()).toEqual({ best: 12, totalRounds: 22 });
    await click("Next round");
    await click("Higher");
    expect(getRecord()).toEqual({ best: 12, totalRounds: 23 });
  });

  it("compares against the displayed score for both opening and promoted champions", async () => {
    getRatingDuel.mockReset().mockResolvedValueOnce({
      champion: { ...film(1), rating: 7.04 }, challenger: film(2),
    }).mockResolvedValue({ champion: null, challenger: film(3) });
    resolveRatingDuel.mockResolvedValue({ correct: true, challengerRating: 8.04 });
    render(<HigherLowerGame />);
    await act(async () => {});
    expect(screen.getByText("7.0")).toBeTruthy();

    await click("Higher");
    expect(resolveRatingDuel).toHaveBeenLastCalledWith(7.04, 2, "higher");
    await click("Next round");
    expect(screen.getByText("8.0")).toBeTruthy();
    await click("Lower");
    expect(resolveRatingDuel).toHaveBeenLastCalledWith(8.04, 3, "lower");
  });

  it("settles a double-clicked round once before the pending phase renders", async () => {
    const result = deferred<{ correct: boolean; challengerRating: number }>();
    resolveRatingDuel.mockReturnValueOnce(result.promise);
    render(<HigherLowerGame />);
    await act(async () => {});
    const button = screen.getByRole("button", { name: "Higher" });

    await act(async () => { fireEvent.click(button); fireEvent.click(button); });

    expect(resolveRatingDuel).toHaveBeenCalledTimes(1);
    await act(async () => { result.resolve({ correct: true, challengerRating: 8 }); });
    expect(getRecord()).toEqual({ best: 1, totalRounds: 1 });
  });

  it("keeps the round pending until the shared lock is released and adds to the latest record", async () => {
    saveFromAnotherTab(3, 5, false);
    render(<HigherLowerGame />);
    await act(async () => {});
    const lock = await holdRosterLock();
    const requests = vi.spyOn(navigator.locks, "request");

    await click("Higher");

    expect(requests).toHaveBeenCalledWith(PROFILE_ROSTER_LOCK, { mode: "exclusive" }, expect.any(Function));
    expect(getRecord()).toEqual({ best: 3, totalRounds: 5 });
    expect(screen.queryByRole("button", { name: "Next round" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Higher" })).toBeNull();
    saveFromAnotherTab(12, 20, false);

    await act(async () => { lock.release(); await lock.holding; });

    expect(getRecord()).toEqual({ best: 12, totalRounds: 21 });
    expect(screen.getByRole("button", { name: "Next round" })).toBeTruthy();
    await click("Next round");
    await click("Higher");
    expect(getRecord()).toEqual({ best: 12, totalRounds: 22 });
  });

  it.each(["unmount", "profile change"])("does not save a queued round after %s", async (change) => {
    const view = render(<HigherLowerGame />);
    await act(async () => {});
    const lock = await holdRosterLock();
    await click("Higher");
    if (change === "unmount") view.unmount();
    if (change === "profile change") window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "other");

    await act(async () => { lock.release(); await lock.holding; });

    expect(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)).toBeNull();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it.each(["missing", "rejected"])("retains a round after an unavailable lock (%s) and saves it once on recovery", async (failure) => {
    saveFromAnotherTab(3, 5, false);
    render(<HigherLowerGame />);
    await act(async () => {});
    vi.stubGlobal("navigator", failure === "missing" ? {} : {
      locks: { request: vi.fn().mockRejectedValue(new Error("Lock refused")) },
    });

    await click("Higher");

    expect(getRecord()).toEqual({ best: 3, totalRounds: 5 });
    expect(screen.getByRole("button", { name: "Next round" })).toBeTruthy();
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Could not safely save this round. You can keep playing; another round will retry the save.", "error",
    );
    vi.stubGlobal("navigator", { locks: createProfileLockManager() });
    saveFromAnotherTab(12, 20, false);
    await click("Next round");
    await click("Higher");
    expect(getRecord()).toEqual({ best: 12, totalRounds: 22 });
    await click("Next round");
    await click("Higher");
    expect(getRecord()).toEqual({ best: 12, totalRounds: 23 });
  });

  it("adds to another tab's record even before its storage event arrives", async () => {
    render(<HigherLowerGame />);
    await act(async () => {});
    saveFromAnotherTab(12, 20, false);

    await click("Higher");

    expect(JSON.parse(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)!))
      .toEqual({ best: 12, totalRounds: 21 });
    expect(screen.getByText(/best 12/i)).toBeTruthy();
  });

  it("refreshes the displayed best after another tab saves a round", async () => {
    render(<HigherLowerGame />);
    await act(async () => {});

    act(() => saveFromAnotherTab(12, 20));

    expect(screen.getByText(/best 12/i)).toBeTruthy();
  });

  it("merges refused rounds with another tab's progress without recounting saved rounds", async () => {
    saveFromAnotherTab(4, 10, false);
    render(<HigherLowerGame />);
    await act(async () => {});
    await click("Higher");
    await click("Next round");
    const refused = refuseRecordWrites();
    await click("Higher");
    refused.mockRestore();
    act(() => saveFromAnotherTab(12, 20));

    await click("Next round");
    await click("Higher");

    expect(JSON.parse(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)!))
      .toEqual({ best: 12, totalRounds: 22 });
    await click("Next round");
    await click("Higher");
    expect(JSON.parse(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)!))
      .toEqual({ best: 12, totalRounds: 23 });
  });

  it("discards an old profile's pending result and unsaved rounds after a switch", async () => {
    render(<HigherLowerGame />);
    await act(async () => {});
    const refused = refuseRecordWrites();
    await click("Higher");
    refused.mockRestore();
    await click("Next round");
    const result = deferred<{ correct: boolean; challengerRating: number }>();
    resolveRatingDuel.mockReturnValueOnce(result.promise);
    await click("Higher");
    getRatingDuel.mockResolvedValue({ champion: { ...film(50), rating: 7 }, challenger: film(51) });
    await act(async () => {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "other");
      saveFromAnotherTab(8, 30);
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });

    await act(async () => result.resolve({ correct: true, challengerRating: 8 }));
    expect(getRecord())
      .toEqual({ best: 8, totalRounds: 30 });
    await click("Higher");
    expect(getRecord())
      .toEqual({ best: 8, totalRounds: 31 });
  });

  it("does not save a round after leaving the page", async () => {
    const result = deferred<{ correct: boolean; challengerRating: number }>();
    resolveRatingDuel.mockReturnValueOnce(result.promise);
    const view = render(<HigherLowerGame />);
    await act(async () => {});
    await click("Higher");
    view.unmount();

    await act(async () => result.resolve({ correct: true, challengerRating: 8 }));

    expect(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)).toBeNull();
  });

  it("keeps playing after a refused save and catches up all rounds on recovery", async () => {
    window.localStorage.setItem(HIGHER_LOWER_STORAGE_KEY, JSON.stringify({ best: 0, totalRounds: 3 }));
    const refused = refuseRecordWrites();
    render(<HigherLowerGame />);
    await act(async () => {});

    await click("Higher");

    expect(screen.getByText("Correct.")).toBeTruthy();
    expect(screen.getByText("1", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText(/best 1/i)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)!))
      .toEqual({ best: 0, totalRounds: 3 });
    expect(toast.showToast).toHaveBeenCalledWith(
      "Your browser would not save this round. Check its storage settings; you can keep playing.",
      "error",
    );

    await click("Next round");
    refused.mockRestore();
    await click("Higher");

    expect(screen.getByText(/best 2/i)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)!))
      .toEqual({ best: 2, totalRounds: 5 });
  });

  it("does not announce an unsaved new best at the end of a run", async () => {
    refuseRecordWrites();
    resolveRatingDuel.mockResolvedValueOnce({ correct: true, challengerRating: 8 })
      .mockResolvedValueOnce({ correct: false, challengerRating: 6 });
    render(<HigherLowerGame />);
    await act(async () => {});

    await click("Higher");
    await click("Next round");
    await click("Higher");

    expect(screen.getByText("You got 1 right")).toBeTruthy();
    expect(screen.queryByText(/new best/i)).toBeNull();
    expect(screen.queryByText(/best 1/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Play again" })).toBeTruthy();
    expect(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)).toBeNull();
    expect(toast.showToast).toHaveBeenCalledTimes(2);
  });

  it("shows the new best after saving a round successfully", async () => {
    render(<HigherLowerGame />);
    await act(async () => {});

    await click("Higher");

    expect(screen.getByText(/best 1/i)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)!))
      .toEqual({ best: 1, totalRounds: 1 });
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("keeps a round with its owner when the active pointer changes after checking the profile", async () => {
    initializeProfileStorage();
    window.localStorage.setItem(profileStoreKey(HIGHER_LOWER_STORAGE_KEY, "bob"),
      JSON.stringify({ best: 9, totalRounds: 30 }));
    render(<HigherLowerGame />);
    await act(async () => {});
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = getItem.call(this, key);
      if (key === HIGHER_LOWER_STORAGE_KEY) {
        setItem.call(this, ACTIVE_PROFILE_STORAGE_KEY, "bob");
      }
      return value;
    });

    await click("Higher");

    expect(withProfileStorage("default", getRecord)).toEqual({ best: 1, totalRounds: 1 });
    expect(withProfileStorage("bob", getRecord)).toEqual({ best: 9, totalRounds: 30 });
  });
});

describe("retrying a film load", () => {
  it.each(["empty answer", "rejected request"])(
    "continues the same run after %s while loading the next film",
    async (failure) => {
      render(<HigherLowerGame />);
      await act(async () => {});
      await click("Higher");
      await click("Next round");
      await click("Higher");

      if (failure === "empty answer") getRatingDuel.mockResolvedValueOnce(null);
      else getRatingDuel.mockRejectedValueOnce(new Error("Temporarily offline"));
      await click("Next round");

      expect(screen.getByText(/Your streak is still intact/)).toBeTruthy();
      expect(JSON.parse(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)!))
        .toEqual({ best: 2, totalRounds: 2 });

      getRatingDuel.mockResolvedValueOnce({ champion: null, challenger: film(4) });
      await click("Try again");

      expect(getRatingDuel).toHaveBeenLastCalledWith([1, 2, 3], false);
      expect(screen.getByRole("link", { name: "Film 3" })).toBeTruthy();
      expect(screen.getByText("Film 4", { selector: "p" })).toBeTruthy();
      expect(screen.getByText("2", { selector: "span" })).toBeTruthy();
      expect(JSON.parse(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)!))
        .toEqual({ best: 2, totalRounds: 2 });

      await click("Higher");
      expect(resolveRatingDuel).toHaveBeenLastCalledWith(8, 4, "higher");
      expect(screen.getByText("3", { selector: "span" })).toBeTruthy();
      expect(JSON.parse(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)!))
        .toEqual({ best: 3, totalRounds: 3 });
    },
  );

  it("retries an unavailable opening pair as a new run", async () => {
    getRatingDuel.mockReset().mockResolvedValueOnce(null)
      .mockResolvedValue({ champion: { ...film(4), rating: 7 }, challenger: film(5) });
    render(<HigherLowerGame />);
    await act(async () => {});

    await click("Try again");

    expect(getRatingDuel).toHaveBeenLastCalledWith([], true);
    expect(screen.getByRole("link", { name: "Film 4" })).toBeTruthy();
    expect(screen.getByText("0", { selector: "span" })).toBeTruthy();
    expect(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)).toBeNull();
  });

  it("discards an old profile's pending retry after switching profiles", async () => {
    render(<HigherLowerGame />);
    await act(async () => {});
    await click("Higher");
    getRatingDuel.mockResolvedValueOnce(null);
    await click("Next round");

    const retry = deferred<{ champion: null; challenger: ReturnType<typeof film> }>();
    getRatingDuel.mockReturnValueOnce(retry.promise);
    await click("Try again");
    getRatingDuel.mockResolvedValue({ champion: { ...film(50), rating: 7 }, challenger: film(51) });
    await act(async () => {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "other");
      saveFromAnotherTab(8, 30);
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });

    await act(async () => retry.resolve({ champion: null, challenger: film(3) }));

    expect(screen.queryByText("Film 3")).toBeNull();
    expect(screen.getByRole("link", { name: "Film 50" })).toBeTruthy();
    expect(screen.getByText("Film 51", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("0", { selector: "span" })).toBeTruthy();
    await click("Higher");
    expect(resolveRatingDuel).toHaveBeenLastCalledWith(7, 51, "higher");
    expect(getRecord())
      .toEqual({ best: 8, totalRounds: 31 });
  });

  it("discards a pending retry after leaving the page", async () => {
    const view = render(<HigherLowerGame />);
    await act(async () => {});
    await click("Higher");
    getRatingDuel.mockResolvedValueOnce(null);
    await click("Next round");

    const retry = deferred<{ champion: null; challenger: ReturnType<typeof film> }>();
    getRatingDuel.mockReturnValueOnce(retry.promise);
    await click("Try again");
    const profiles = await import("@/lib/profiles");
    const activeProfile = vi.spyOn(profiles, "getActiveProfileId");
    const storedRecord = window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY);
    view.unmount();
    activeProfile.mockClear();

    await act(async () => retry.resolve({ champion: null, challenger: film(3) }));

    expect(activeProfile).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(HIGHER_LOWER_STORAGE_KEY)).toBe(storedRecord);
  });
});
