// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WatchedProvider } from "@/contexts/WatchedContext";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { RATINGS_STORAGE_KEY } from "@/lib/ratings";
import { getWatched, WATCHED_STORAGE_KEY } from "@/lib/watched";
import { ACTIVE_PROFILE_STORAGE_KEY, PROFILES_STORAGE_KEY } from "@/lib/profiles";
import { deletedProfileKey, initializeProfileStorage, profileStoreKey, withProfileStorage } from "@/lib/profile-storage";
import { addToWatchlist, getWatchlist, WATCHLIST_STORAGE_KEY } from "@/lib/watchlist";
import { STORAGE_REFUSED_MESSAGE } from "@/lib/media-list";
import type { MediaItem } from "@/types/tmdb";
import { UserRating } from "./UserRating";
import { createProfileLockManager } from "@/test/profile-locks";
import { PROFILE_ROSTER_LOCK } from "@/lib/profile-roster-lock";
import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup } from "@/lib/portable-data";
import { restoreBackup } from "@/lib/restore-backup";

vi.mock("./Toast", () => ({ toast: { showToast: vi.fn() } }));
const { toast } = await import("./Toast");

const item: MediaItem = {
  id: 550,
  title: "Fight Club",
  media_type: "movie",
  overview: "",
  poster_path: null,
  backdrop_path: null,
  release_date: "1999-10-15",
  vote_average: 8.4,
  vote_count: 27000,
  genre_ids: [],
};

function renderRating() {
  return render(
    <WatchlistProvider>
      <WatchedProvider>
        <UserRating item={item} />
      </WatchedProvider>
    </WatchlistProvider>,
  );
}

async function queueTitle() {
  expect(await addToWatchlist({
    id: item.id,
    title: item.title,
    mediaType: item.media_type,
    posterPath: item.poster_path,
    releaseDate: item.release_date,
    voteAverage: item.vote_average,
  })).toBe("ok");
}

function refuseWrites(...keys: string[]) {
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (keys.includes(key)) {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    }
    setItem.call(this, key, value);
  });
}

function saveRating() {
  window.localStorage.setItem(
    RATINGS_STORAGE_KEY,
    JSON.stringify({
      "movie-550": { rating: 8, ratedAt: "2026-01-01T00:00:00.000Z" },
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: createProfileLockManager() });
  window.localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("UserRating storage outcomes", async () => {
  it.each([WATCHED_STORAGE_KEY, WATCHLIST_STORAGE_KEY])(
    "refuses a rating before any writes when only the %s context has changed owner",
    async (key) => {
      initializeProfileStorage();
      await queueTitle();
      renderRating();
      const bobRatingsKey = profileStoreKey(RATINGS_STORAGE_KEY, "bob");
      const bobRatings = JSON.stringify({ "movie-550": { rating: 9, ratedAt: "2026-10-05T00:00:00.000Z" } });
      const defaultWatchlist = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
      window.localStorage.setItem(bobRatingsKey, bobRatings);
      window.localStorage.setItem(profileStoreKey(WATCHLIST_STORAGE_KEY, "bob"), defaultWatchlist!);
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
      act(() => window.dispatchEvent(new StorageEvent("storage", { key: profileStoreKey(key, "bob") })));

      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Rate 8 out of 10" })); });

      expect(window.localStorage.getItem(bobRatingsKey)).toBe(bobRatings);
      expect(window.localStorage.getItem(RATINGS_STORAGE_KEY)).toBeNull();
      expect(withProfileStorage("default", getWatched)).toEqual([]);
      expect(getWatched()).toEqual([]);
      expect(window.localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe(defaultWatchlist);
      expect(getWatchlist()).toHaveLength(1);
      expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("active profile changed"), "info");
    },
  );

  it("keeps rating, history and watchlist on one owner if the pointer changes after the guard", async () => {
    initializeProfileStorage();
    await queueTitle();
    const bobWatchedKey = profileStoreKey(WATCHED_STORAGE_KEY, "bob");
    const bobWatched = JSON.stringify([{ id: item.id, title: item.title, mediaType: item.media_type, watchedAt: "2026-01-01T00:00:00.000Z" }]);
    window.localStorage.setItem(bobWatchedKey, bobWatched);
    renderRating();
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

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Rate 8 out of 10" })); });

    expect(JSON.parse(window.localStorage.getItem(RATINGS_STORAGE_KEY)!)["movie-550"].rating).toBe(8);
    expect(withProfileStorage("default", getWatched)).toHaveLength(1);
    expect(withProfileStorage("default", getWatchlist)).toEqual([]);
    expect(window.localStorage.getItem(profileStoreKey(RATINGS_STORAGE_KEY, "bob"))).toBeNull();
    expect(window.localStorage.getItem(bobWatchedKey)).toBe(bobWatched);
    expect(toast.showToast).toHaveBeenCalledWith("Rated 8/10, marked as watched and removed from your watchlist", "success");
  });

  it("marks watched again when another tab removed the rendered watched entry", async () => {
    window.localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify([{
      id: item.id, title: item.title, mediaType: item.media_type,
      watchedAt: "2026-01-01T00:00:00.000Z",
    }]));
    renderRating();
    window.localStorage.setItem(WATCHED_STORAGE_KEY, "[]");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Rate 8 out of 10" })); });

    expect(getWatched().map((entry) => entry.id)).toEqual([item.id]);
    expect(toast.showToast).toHaveBeenCalledWith("Rated 8/10 and marked as watched", "success");
  });

  it("removes a title queued in another tab before its storage event arrives", async () => {
    renderRating();
    await queueTitle();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Rate 8 out of 10" })); });

    expect(getWatchlist()).toEqual([]);
    expect(getWatched().map((entry) => entry.id)).toEqual([item.id]);
    expect(toast.showToast).toHaveBeenCalledWith(
      "Rated 8/10, marked as watched and removed from your watchlist", "success",
    );
  });

  it.each(["rate", "clear"])("does not %s another profile before its storage events arrive", async (action) => {
    saveRating();
    renderRating();
    const bobRatings = JSON.stringify({ "movie-550": { rating: 9, ratedAt: "2026-10-05T00:00:00.000Z" } });
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, "bob");
    window.localStorage.setItem(RATINGS_STORAGE_KEY, bobRatings);
    window.localStorage.setItem(WATCHED_STORAGE_KEY, "[]");

    await act(async () => { fireEvent.click(action === "rate"
      ? screen.getByRole("button", { name: "Rate 8 out of 10" })
      : screen.getByRole("button", { name: "Clear" })); });

    expect(window.localStorage.getItem(RATINGS_STORAGE_KEY)).toBe(bobRatings);
    expect(getWatched()).toEqual([]);
    expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("active profile changed"), "info");
  });

  it("removes a rated title from the watchlist after marking it watched", async () => {
    await queueTitle();
    renderRating();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Rate 8 out of 10" })); });

    expect(getWatchlist()).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem(WATCHED_STORAGE_KEY)!))
      .toHaveLength(1);
    expect(toast.showToast).toHaveBeenCalledWith(
      "Rated 8/10, marked as watched and removed from your watchlist", "success",
    );
  });

  it("keeps the queued title when marking watched fails after saving its rating", async () => {
    await queueTitle();
    refuseWrites(WATCHED_STORAGE_KEY);
    renderRating();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Rate 8 out of 10" })); });

    expect(getWatchlist().map((entry) => entry.id)).toEqual([item.id]);
    expect(window.localStorage.getItem(WATCHED_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(RATINGS_STORAGE_KEY)!)["movie-550"].rating)
      .toBe(8);
    expect(toast.showToast).toHaveBeenCalledWith(
      expect.stringContaining("could not mark as watched"), "error",
    );
  });

  it("reports a refused watchlist removal while keeping the saved rating and watched title", async () => {
    await queueTitle();
    refuseWrites(WATCHLIST_STORAGE_KEY);
    renderRating();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Rate 8 out of 10" })); });

    expect(getWatchlist().map((entry) => entry.id)).toEqual([item.id]);
    expect(JSON.parse(window.localStorage.getItem(WATCHED_STORAGE_KEY)!))
      .toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(RATINGS_STORAGE_KEY)!)["movie-550"].rating)
      .toBe(8);
    expect(toast.showToast).toHaveBeenCalledWith(
      expect.stringContaining("would not remove it from your watchlist"), "error",
    );
    expect(toast.showToast).not.toHaveBeenCalledWith(expect.any(String), "success");
  });

  it("reports success only after saving the score and watched title", async () => {
    renderRating();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Rate 8 out of 10" })); });

    expect(screen.getByRole("button", { name: "Rate 8 out of 10" }).getAttribute("aria-current"))
      .toBe("true");
    expect(JSON.parse(window.localStorage.getItem(WATCHED_STORAGE_KEY)!))
      .toHaveLength(1);
    expect(toast.showToast).toHaveBeenCalledWith(
      "Rated 8/10 and marked as watched", "success",
    );
  });

  it("does not mark watched or announce success when the score cannot be saved", async () => {
    refuseWrites(RATINGS_STORAGE_KEY);
    renderRating();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Rate 8 out of 10" })); });

    expect(window.localStorage.getItem(RATINGS_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(WATCHED_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "Rate 8 out of 10" }).getAttribute("aria-current"))
      .toBeNull();
    expect(toast.showToast).toHaveBeenCalledWith(STORAGE_REFUSED_MESSAGE, "error");
    expect(toast.showToast).not.toHaveBeenCalledWith(expect.any(String), "success");
  });

  it("keeps a saved rating and explains when marking watched fails", async () => {
    refuseWrites(WATCHED_STORAGE_KEY);
    renderRating();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Rate 8 out of 10" })); });

    expect(JSON.parse(window.localStorage.getItem(RATINGS_STORAGE_KEY)!)["movie-550"].rating)
      .toBe(8);
    expect(window.localStorage.getItem(WATCHED_STORAGE_KEY)).toBeNull();
    expect(toast.showToast).toHaveBeenCalledWith(
      expect.stringContaining("could not mark as watched"), "error",
    );
    expect(toast.showToast).not.toHaveBeenCalledWith(expect.any(String), "success");
  });

  it("keeps the score and reports an error when removal is refused", async () => {
    saveRating();
    refuseWrites(RATINGS_STORAGE_KEY);
    renderRating();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Clear" })); });

    expect(screen.getByRole("button", { name: "Rate 8 out of 10" }).getAttribute("aria-current"))
      .toBe("true");
    expect(toast.showToast).toHaveBeenCalledWith(STORAGE_REFUSED_MESSAGE, "error");
    expect(toast.showToast).not.toHaveBeenCalledWith("Rating removed", "info");
  });

  it("announces a successful removal", async () => {
    saveRating();
    renderRating();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Clear" })); });

    expect(JSON.parse(window.localStorage.getItem(RATINGS_STORAGE_KEY)!)).toEqual({});
    expect(toast.showToast).toHaveBeenCalledWith("Rating removed", "info");
  });
});

describe("UserRating keyboard controls", async () => {
  const star = (value: number) => screen.getByRole("button", { name: `Rate ${value} out of 10` });
  const stars = () => screen.getAllByRole("button", { name: /^Rate \d+ out of 10$/ });
  const tabStops = () => stars().filter((button) => button.tabIndex === 0);
  const filled = () => stars().filter((button) =>
    button.querySelector("svg")?.getAttribute("class")?.includes("fill-current"),
  ).length;

  it("is a toolbar of buttons rather than a radio group whose arrows would select", () => {
    renderRating();

    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryAllByRole("radio")).toEqual([]);
    expect(screen.getByRole("toolbar", { name: "Rate Fight Club out of ten" })).toBeTruthy();
    expect(stars()).toHaveLength(10);
  });

  it("has one Tab stop at the saved rating, or the first value when unrated", async () => {
    const view = renderRating();
    expect(tabStops()).toEqual([star(1)]);
    view.unmount();
    saveRating();
    renderRating();
    expect(tabStops()).toEqual([star(8)]);

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Clear" })); });
    expect(tabStops()).toEqual([star(1)]);
  });

  it("marks the saved score as current and describes the side effects while unrated", async () => {
    const view = renderRating();
    const hint = screen.getByText(/Rating a title marks it watched/);
    expect(stars().every((button) => button.getAttribute("aria-describedby") === hint.id)).toBe(true);
    expect(stars().some((button) => button.hasAttribute("aria-current"))).toBe(false);
    view.unmount();

    saveRating();
    renderRating();
    expect(stars().filter((button) => button.getAttribute("aria-current") === "true"))
      .toEqual([star(8)]);
    expect(stars().some((button) => button.hasAttribute("aria-describedby"))).toBe(false);
  });

  /**
   * The regression. Tabbing into an unrated title and pressing → used to rate it
   * 2/10, mark it watched and drop it from the watchlist; ← on the first star
   * wrapped to a 10. Arrows now only move focus and preview.
   */
  it("moves focus and the preview with arrows, Home and End without saving anything", async () => {
    await queueTitle();
    renderRating();
    act(() => star(1).focus());
    expect(filled()).toBe(1);

    for (const [key, expected] of [
      ["ArrowLeft", 1],
      ["ArrowRight", 2],
      ["ArrowRight", 3],
      ["ArrowLeft", 2],
      ["End", 10],
      ["ArrowRight", 10],
      ["Home", 1],
    ] as const) {
      await act(async () => { fireEvent.keyDown(document.activeElement!, { key }); });
      expect(document.activeElement).toBe(star(expected));
      expect(tabStops()).toEqual([star(expected)]);
      expect(filled()).toBe(expected);
    }

    expect(stars().some((button) => button.hasAttribute("aria-current"))).toBe(false);
    expect(window.localStorage.getItem(RATINGS_STORAGE_KEY)).toBeNull();
    expect(getWatched()).toEqual([]);
    expect(getWatchlist()).toHaveLength(1);
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("leaves vertical arrows to the page", async () => {
    renderRating();
    act(() => star(3).focus());

    for (const key of ["ArrowUp", "ArrowDown"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      act(() => { document.activeElement!.dispatchEvent(event); });
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(star(3));
    }
  });

  it("restores the saved score and its Tab stop once focus leaves the row", async () => {
    saveRating();
    renderRating();
    act(() => star(8).focus());
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: "Home" }); });
    expect(filled()).toBe(1);

    act(() => star(1).blur());

    expect(filled()).toBe(8);
    expect(tabStops()).toEqual([star(8)]);
  });

  it("commits the focused score only when it is activated", async () => {
    await queueTitle();
    renderRating();
    act(() => star(1).focus());
    for (let step = 0; step < 6; step += 1) {
      await act(async () => { fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" }); });
    }
    expect(window.localStorage.getItem(RATINGS_STORAGE_KEY)).toBeNull();

    // Enter and Space activate a native button, which arrives as a click.
    await act(async () => { fireEvent.click(document.activeElement!); });

    expect(JSON.parse(window.localStorage.getItem(RATINGS_STORAGE_KEY)!)["movie-550"].rating).toBe(7);
    expect(star(7).getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(star(7));
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
      "Rated 7/10, marked as watched and removed from your watchlist", "success",
    );
  });

  it("keeps the focused star enabled during an async save and lets the arrows keep moving", async () => {
    saveRating();
    const lock = await holdRosterLock();
    const requests = vi.spyOn(navigator.locks, "request");
    renderRating();
    act(() => star(8).focus());

    act(() => { fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" }); });
    const pending = star(9) as HTMLButtonElement;
    expect(document.activeElement).toBe(pending);
    expect(requests).not.toHaveBeenCalled();
    act(() => { fireEvent.click(pending); });
    // jsdom keeps focus even on a disabled button, so checking focus alone
    // would miss the native browser regression.
    expect(pending.disabled).toBe(false);
    expect(pending.getAttribute("aria-disabled")).toBe("true");
    expect(pending.getAttribute("aria-current")).toBeNull();

    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
      fireEvent.click(star(10));
    });
    expect(document.activeElement).toBe(star(10));
    expect(requests).toHaveBeenCalledTimes(1);

    await act(async () => { lock.release(); await lock.held; });
    expect(document.activeElement).toBe(star(10));
    expect(pending.getAttribute("aria-disabled")).toBe("false");
    expect(pending.getAttribute("aria-current")).toBe("true");
    expect(JSON.parse(window.localStorage.getItem(RATINGS_STORAGE_KEY)!)["movie-550"].rating).toBe(9);

    await act(async () => { fireEvent.click(document.activeElement!); });
    expect(star(10).getAttribute("aria-current")).toBe("true");
    expect(JSON.parse(window.localStorage.getItem(RATINGS_STORAGE_KEY)!)["movie-550"].rating).toBe(10);
  });

  it("hands focus from Clear to the stars without previewing a score", async () => {
    saveRating();
    renderRating();
    const clear = screen.getByRole("button", { name: "Clear" }) as HTMLButtonElement;
    act(() => clear.focus());

    await act(async () => { fireEvent.click(clear); });

    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(document.activeElement).toBe(star(1));
    expect(tabStops()).toEqual([star(1)]);
    expect(filled()).toBe(0);
    expect(window.localStorage.getItem(RATINGS_STORAGE_KEY)).toBe("{}");
  });

  it("keeps Clear focusable while a save is pending", async () => {
    saveRating();
    const lock = await holdRosterLock();
    renderRating();
    const clear = screen.getByRole("button", { name: "Clear" }) as HTMLButtonElement;
    act(() => clear.focus());

    act(() => { fireEvent.click(clear); });

    expect(clear.disabled).toBe(false);
    expect(clear.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(clear);
    await act(async () => { lock.release(); await lock.held; });
    expect(document.activeElement).toBe(star(1));
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
    window.localStorage.setItem(profileStoreKey(RATINGS_STORAGE_KEY, "alice"), JSON.stringify({
      "movie-550": { rating: 7, ratedAt: "2026-01-01T00:00:00.000Z" },
    }));
    const lock = await holdRosterLock();
    const requests = vi.spyOn(navigator.locks, "request");
    renderRating();
    const control = screen.getByRole("button", { name: "Rate 8 out of 10" }) as HTMLButtonElement;

    act(() => {
      fireEvent.click(control);
      fireEvent.click(screen.getByRole("button", { name: "Rate 9 out of 10" }));
    });
    expect(requests).toHaveBeenCalledTimes(1);
    expect(control.disabled).toBe(false);
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(getWatched()).toEqual([]);
    expect(getWatchlist()).toHaveLength(1);
    expect(toast.showToast).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Rate 7 out of 10" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "Rate 8 out of 10" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("button", { name: "Rate 9 out of 10" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Rate \d+ out of 10$/ }).every((button) =>
      !(button as HTMLButtonElement).disabled && button.getAttribute("aria-disabled") === "true",
    )).toBe(true);
    const clear = screen.getByRole("button", { name: "Clear" }) as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    expect(clear.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(clear);
    fireEvent.keyDown(control, { key: "ArrowRight" });
    expect(control.getAttribute("aria-current")).toBeNull();

    await act(async () => { lock.release(); await lock.held; });

    expect(control.disabled).toBe(false);
    expect(getWatched()).toHaveLength(1);
    expect(getWatchlist()).toEqual([]);
    expect(toast.showToast).toHaveBeenCalledExactlyOnceWith('Rated 8/10, marked as watched and removed from your watchlist', "success");
  });

  it.each(["switch", "delete"])("keeps a pending action on its original profile after a %s", async (change) => {
    const { aliceWatchlist, bobWatchlist, queued } = seedActionProfiles();
    const lock = await holdRosterLock();
    renderRating();
    const control = screen.getByRole("button", { name: "Rate 8 out of 10" }) as HTMLButtonElement;
    await act(async () => { fireEvent.click(control); });
    expect(control.disabled).toBe(false);
    expect(control.getAttribute("aria-disabled")).toBe("true");
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
        window.localStorage.removeItem(profileStoreKey(RATINGS_STORAGE_KEY, "alice"));
      }
      window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_PROFILE_STORAGE_KEY }));
    });
    await act(async () => { lock.release(); await lock.held; });

    expect(control.disabled).toBe(false);
    expect(window.localStorage.getItem(bobWatchlist)).toBe(queued);
    expect(getWatchlist()).toHaveLength(1);
    expect(getWatched()).toEqual([]);
    expect(window.localStorage.getItem(profileStoreKey(RATINGS_STORAGE_KEY, "bob"))).toBeNull();
    if (change === "delete") {
      expect(window.localStorage.getItem(aliceWatchlist)).toBeNull();
      expect(window.localStorage.getItem(profileStoreKey(WATCHED_STORAGE_KEY, "alice"))).toBeNull();
      expect(toast.showToast).toHaveBeenCalledWith(expect.stringContaining("profile for this action was deleted"), "info");
      expect(toast.showToast).not.toHaveBeenCalledWith(expect.any(String), "success");
    } else {
      expect(withProfileStorage("alice", getWatchlist)).toEqual([]);
      expect(withProfileStorage("alice", getWatched)).toHaveLength(1);
      expect(toast.showToast).toHaveBeenCalledExactlyOnceWith('Rated 8/10, marked as watched and removed from your watchlist', "success");
    }
  });
});

it("applies the entire action after a previously queued restore of the same profile", async () => {
  const { queued } = seedActionProfiles();
  const lock = await holdRosterLock();
  renderRating();
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
  const control = screen.getByRole("button", { name: "Rate 8 out of 10" }) as HTMLButtonElement;
  await act(async () => { fireEvent.click(control); });

  expect(getWatched()).toEqual([]);
  expect(toast.showToast).not.toHaveBeenCalled();
  await act(async () => { lock.release(); await lock.held; expect(await restoring).toEqual({ ok: true }); });

  expect(getWatched().map((entry) => entry.id)).toEqual([550, 12]);
  expect(getWatchlist().map((entry) => entry.id)).toEqual([11]);
  expect(control.disabled).toBe(false);
  expect(control.getAttribute("aria-current")).toBe("true");
  const ratings = JSON.parse(window.localStorage.getItem(profileStoreKey(RATINGS_STORAGE_KEY, "alice"))!);
  expect(ratings["movie-550"].rating).toBe(8);
  expect(ratings["movie-11"].rating).toBe(6);
  expect(toast.showToast).toHaveBeenCalledExactlyOnceWith('Rated 8/10, marked as watched and removed from your watchlist', "success");
});
